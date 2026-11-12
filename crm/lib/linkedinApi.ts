import { query } from "./db";
import { decryptToken, encryptToken } from "./mailCrypto";
import { REST, TOKEN_URL, USERINFO_URL, apiVersion, explainError, redirectUri, tokenUsable } from "./linkedinApiMath";

// LinkedIn's official API, for the one thing the owner approved: posting their own post, on their click (L6). Nothing here reads LinkedIn.
// The access token is stored encrypted (same key as the Google tokens) and never leaves the server.

export class LinkedInAuthError extends Error {}

export type LinkedInConnection = { id: number; person_sub: string; display_name: string | null; access_token_enc: string | null; expires_at: string | null; last_error: string | null };

const secret = () => process.env.SESSION_SECRET ?? "";

/** Swaps the one-time code from LinkedIn's consent screen for an access token, reads who it belongs to, and saves the connection. */
export async function connectWithCode(code: string): Promise<{ name: string }> {
  const res = await fetch(TOKEN_URL, {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: redirectUri(), client_id: process.env.LINKEDIN_CLIENT_ID ?? "", client_secret: process.env.LINKEDIN_CLIENT_SECRET ?? "" }),
  });
  const t: any = await res.json().catch(() => ({}));
  if (!res.ok || !t.access_token) throw new Error(`LinkedIn sign-in failed (${t.error ?? res.status}${t.error_description ? `: ${String(t.error_description).slice(0, 160)}` : ""}).`);
  if (!String(t.scope ?? "").split(/[ ,]+/).includes("w_member_social")) throw new Error("LinkedIn did not grant permission to post (w_member_social). Add the Share on LinkedIn product to the app and connect again.");
  const who = await fetch(USERINFO_URL, { headers: { Authorization: `Bearer ${t.access_token}` } });
  const me: any = await who.json().catch(() => ({}));
  if (!who.ok || !me.sub) throw new Error("LinkedIn did not say whose account this is. Check the app has Sign In with LinkedIn using OpenID Connect.");
  const expires = new Date(Date.now() + Number(t.expires_in ?? 0) * 1000);
  // One LinkedIn profile at a time: connecting another replaces it.
  await query(`DELETE FROM linkedin_connections WHERE person_sub <> $1`, [me.sub]);
  await query(
    `INSERT INTO linkedin_connections (person_sub, display_name, access_token_enc, expires_at, connected_at, last_error) VALUES ($1, $2, $3, $4, now(), NULL)
     ON CONFLICT (person_sub) DO UPDATE SET display_name = EXCLUDED.display_name, access_token_enc = EXCLUDED.access_token_enc, expires_at = EXCLUDED.expires_at, connected_at = now(), last_error = NULL`,
    [me.sub, typeof me.name === "string" ? me.name.slice(0, 120) : null, encryptToken(t.access_token, secret()), expires]);
  return { name: me.name ?? "your profile" };
}

export async function getLinkedInConnection(): Promise<LinkedInConnection | null> {
  const [c] = await query<any>(`SELECT id, person_sub, display_name, access_token_enc, expires_at, last_error FROM linkedin_connections ORDER BY connected_at DESC LIMIT 1`).catch(() => []);
  return c ? { ...c, id: Number(c.id), expires_at: c.expires_at ? new Date(c.expires_at).toISOString() : null } : null;
}

/** The access token, or an error saying to connect again. */
export function tokenOf(c: LinkedInConnection): string {
  if (!c.access_token_enc || !tokenUsable(c.expires_at)) throw new LinkedInAuthError("The LinkedIn connection has expired (it lasts about 60 days). Connect LinkedIn again.");
  return decryptToken(c.access_token_enc, secret());
}

async function rest(token: string, path: string, body: unknown): Promise<{ json: any; headers: Headers }> {
  const res = await fetch(`${REST}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "LinkedIn-Version": apiVersion(), "X-Restli-Protocol-Version": "2.0.0" },
    body: JSON.stringify(body),
  });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401) throw new LinkedInAuthError(explainError(401, json));
    throw new Error(explainError(res.status, json));
  }
  return { json, headers: res.headers };
}

/** Uploads the post's image (PNG) or carousel (PDF) as an asset owned by the member, and returns its id (urn:li:image:… or urn:li:document:…). */
export async function uploadMedia(token: string, author: string, kind: "image" | "document", bytes: Uint8Array): Promise<string> {
  const { json } = await rest(token, `/${kind === "image" ? "images" : "documents"}?action=initializeUpload`, { initializeUploadRequest: { owner: author } });
  const uploadUrl: string | undefined = json?.value?.uploadUrl;
  const id: string | undefined = json?.value?.[kind];
  if (!uploadUrl || !id || !/^https:\/\/([a-z0-9-]+\.)*linkedin\.com\//.test(uploadUrl)) throw new Error("LinkedIn did not return a place to upload the file.");
  const up = await fetch(uploadUrl, { method: "PUT", headers: { Authorization: `Bearer ${token}`, "Content-Type": kind === "image" ? "image/png" : "application/pdf" }, body: Buffer.from(bytes) });
  if (!up.ok) throw new Error(`LinkedIn would not take the ${kind === "image" ? "image" : "PDF"} (${up.status}).`);
  return id;
}

/** Creates one public post on the member's own profile and returns its id (urn:li:share:… or urn:li:ugcPost:…). */
export async function createPost(token: string, author: string, commentary: string, media: { id: string; title?: string; altText?: string } | null): Promise<string> {
  const { headers, json } = await rest(token, "/posts", {
    author, commentary, visibility: "PUBLIC",
    distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] },
    ...(media ? { content: { media } } : {}),
    lifecycleState: "PUBLISHED", isReshareDisabledByAuthor: false,
  });
  const urn = headers.get("x-restli-id") ?? json?.id;
  if (!urn) throw new Error("LinkedIn accepted the post but did not say its id. Check your profile before posting again.");
  return String(urn);
}
