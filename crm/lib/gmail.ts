// Talks to Google: sign-in for a mailbox, sending one email, and reading the messages of threads the CRM started.
// Server-side only. Tokens are never logged or returned to the browser.
import { query } from "./db";
import { decryptToken } from "./mailCrypto";
import type { GmailMessage } from "./replyMath";

const AUTH = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN = process.env.GOOGLE_TOKEN_URL?.trim() || "https://oauth2.googleapis.com/token";   // the override is only for tests with a stand-in server
const API = "https://gmail.googleapis.com/gmail/v1/users/me";
// send: to send on a click. readonly: to read replies (the code only opens messages in threads the CRM sent, see replies.ts).
export const SCOPES = ["openid", "email", "profile", "https://www.googleapis.com/auth/gmail.send", "https://www.googleapis.com/auth/gmail.readonly"];

export const googleConfigured = () => !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
export const redirectUri = () => process.env.GOOGLE_REDIRECT_URI?.trim() || "http://127.0.0.1:3000/api/google/callback";

export class MailboxAuthError extends Error {}

export function authUrl(state: string, loginHint?: string): string {
  const p = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID ?? "", redirect_uri: redirectUri(), response_type: "code", scope: SCOPES.join(" "),
    access_type: "offline", prompt: "consent select_account", state, include_granted_scopes: "true",
  });
  if (loginHint) p.set("login_hint", loginHint);
  return `${AUTH}?${p}`;
}

export async function tokenCall(body: Record<string, string>): Promise<any> {
  const res = await fetch(TOKEN, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID ?? "", client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "", ...body }) });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (json.error === "invalid_grant") throw new MailboxAuthError("Google no longer allows this mailbox (access was removed, or the app is still in Testing and the token expired after 7 days). Connect it again.");
    throw new Error(`Google sign-in failed (${json.error ?? res.status}${json.error_description ? `: ${json.error_description}` : ""}).`);
  }
  return json;
}

/** Swaps the one-time code from the consent screen for a refresh token, and reads which mailbox it belongs to. */
export async function exchangeCode(code: string): Promise<{ refreshToken: string; email: string; name: string | null }> {
  const t = await tokenCall({ code, grant_type: "authorization_code", redirect_uri: redirectUri() });
  if (!t.refresh_token) throw new Error("Google did not give a long-lived token. Remove the app at myaccount.google.com/permissions and connect again.");
  if (!String(t.scope ?? "").includes("gmail.send")) throw new Error("Sending permission was not ticked on Google's screen. Connect again and tick every box.");
  const claims = JSON.parse(Buffer.from(String(t.id_token).split(".")[1] ?? "", "base64url").toString("utf8") || "{}");
  if (!claims.email || claims.email_verified === false) throw new Error("Google did not confirm the mailbox address.");
  return { refreshToken: t.refresh_token, email: String(claims.email).toLowerCase(), name: claims.name ?? null };
}

const cache = new Map<number, { token: string; until: number }>();

export async function accessToken(mailbox: { id: number; refresh_token_enc: string | null }): Promise<string> {
  const hit = cache.get(mailbox.id);
  if (hit && hit.until > Date.now() + 60_000) return hit.token;
  if (!mailbox.refresh_token_enc) throw new MailboxAuthError("This mailbox is disconnected.");
  const secret = process.env.SESSION_SECRET ?? "";
  const refresh = decryptToken(mailbox.refresh_token_enc, secret);
  try {
    const t = await tokenCall({ refresh_token: refresh, grant_type: "refresh_token" });
    cache.set(mailbox.id, { token: t.access_token, until: Date.now() + Number(t.expires_in ?? 3000) * 1000 });
    return t.access_token;
  } catch (e) {
    cache.delete(mailbox.id);
    if (e instanceof MailboxAuthError) await query(`UPDATE mailboxes SET last_error = $2 WHERE id = $1`, [mailbox.id, e.message]);
    throw e;
  }
}

export async function revokeToken(refreshToken: string): Promise<void> {
  await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(refreshToken)}`, { method: "POST" }).catch(() => {});
}

async function api<T>(token: string, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401) throw new MailboxAuthError("Google rejected the saved access. Connect the mailbox again.");
    throw new Error(`Gmail said ${res.status}: ${json?.error?.message ?? "no details"}`);
  }
  return json as T;
}

/** Sends one prepared message. Returns Gmail's ids so replies can be matched to it later. */
export const sendRaw = (token: string, raw: string) => api<{ id: string; threadId: string }>(token, "/messages/send", { method: "POST", body: JSON.stringify({ raw }) });

/** Ids only (no content) of messages received since `afterEpoch`, excluding our own. */
export async function listReceived(token: string, afterEpoch: number): Promise<{ id: string; threadId: string }[]> {
  const out: { id: string; threadId: string }[] = [];
  let page = "";
  for (let i = 0; i < 5; i++) {
    const q = new URLSearchParams({ q: `after:${afterEpoch} -from:me`, maxResults: "100" });
    if (page) q.set("pageToken", page);
    const r = await api<{ messages?: { id: string; threadId: string }[]; nextPageToken?: string }>(token, `/messages?${q}`);
    out.push(...(r.messages ?? []));
    if (!r.nextPageToken) break;
    page = r.nextPageToken;
  }
  return out;
}

export const getMessage = (token: string, id: string) => api<GmailMessage>(token, `/messages/${encodeURIComponent(id)}?format=full`);
