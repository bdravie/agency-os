// Rules for posting to LinkedIn through its official API (L6). Pure: no network, no database, so it can be tested.
// Checked against LinkedIn's documentation on 12 Nov 2026: Posts API (/rest/posts), Images API, Documents API, the "little" text format,
// and Sign In with LinkedIn using OpenID Connect. Re-check the docs if LinkedIn starts refusing requests.

export const AUTHORIZE_URL = "https://www.linkedin.com/oauth/v2/authorization";
export const TOKEN_URL = "https://www.linkedin.com/oauth/v2/accessToken";
export const USERINFO_URL = "https://api.linkedin.com/v2/userinfo";
export const REST = "https://api.linkedin.com/rest";
/** openid and profile say who you are (your id and name); w_member_social lets the app post as you. Nothing that reads your feed, posts or numbers. */
export const SCOPES = ["openid", "profile", "w_member_social"];
export const DEFAULT_CAP = 3;
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
export const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024;   // LinkedIn allows 100 MB; a carousel of 9 PNG pages is a few MB

/** The LinkedIn-Version header (YYYYMM). Each version is retired about a year after release, so it is a setting: LINKEDIN_API_VERSION. */
export function apiVersion(env: Record<string, string | undefined> = process.env): string {
  const v = (env.LINKEDIN_API_VERSION ?? "").trim();
  return /^20\d{2}(0[1-9]|1[0-2])$/.test(v) ? v : "202610";
}

/** Posts allowed in 24 hours (LINKEDIN_DAILY_CAP, default 3). LinkedIn's own limit is far higher; this is about not over-posting. */
export function dailyCap(env: Record<string, string | undefined> = process.env): number {
  const n = Number(env.LINKEDIN_DAILY_CAP);
  return Number.isInteger(n) && n > 0 && n <= 20 ? n : DEFAULT_CAP;
}

export const redirectUri = (env: Record<string, string | undefined> = process.env) => env.LINKEDIN_REDIRECT_URI?.trim() || "http://127.0.0.1:3000/api/linkedin/callback";
export const linkedinConfigured = (env: Record<string, string | undefined> = process.env) => !!(env.LINKEDIN_CLIENT_ID?.trim() && env.LINKEDIN_CLIENT_SECRET?.trim());

export function authorizeUrl(state: string, env: Record<string, string | undefined> = process.env): string {
  return `${AUTHORIZE_URL}?${new URLSearchParams({ response_type: "code", client_id: env.LINKEDIN_CLIENT_ID?.trim() ?? "", redirect_uri: redirectUri(env), state, scope: SCOPES.join(" ") })}`;
}

const RESERVED = /[\\|{}@[\]()<>#*_~]/g;
/** Plain text escaped for LinkedIn's "little" format: every reserved character gets a backslash, or LinkedIn reads it as markup (or refuses the post). */
export const escapeLittle = (text: string): string => text.replace(RESERVED, "\\$&");

/**
 * A post's text as LinkedIn's commentary: hashtags (a # at the start of a word) become LinkedIn hashtags, and everything else is escaped,
 * so brackets, @ signs, asterisks and underscores show exactly as written. A # in the middle of a word ("C#") stays plain text.
 */
export function toCommentary(text: string): string {
  const out: string[] = [];
  const re = /(^|[^\p{L}\p{N}_&/])#([\p{L}\p{N}_]+)/gu;
  let last = 0;
  for (const m of text.matchAll(re)) {
    const start = (m.index ?? 0) + m[1].length;
    out.push(escapeLittle(text.slice(last, start)), `{hashtag|\\#|${m[2].replace(/_/g, "\\_")}}`);
    last = start + 1 + m[2].length;
  }
  out.push(escapeLittle(text.slice(last)));
  return out.join("");
}

/** The address of a post from the id LinkedIn returns (urn:li:share:… or urn:li:ugcPost:…), or null for anything else. */
export function postUrlFromUrn(urn: string | null | undefined): string | null {
  const u = (urn ?? "").trim();
  return /^urn:li:(share|ugcPost):\d{5,25}$/.test(u) ? `https://www.linkedin.com/feed/update/${u}` : null;
}

/** What kind of file the browser sent, told by its own bytes: a PNG image or a PDF document, within size; or why it cannot be posted. */
export function mediaKind(bytes: Uint8Array): { kind: "image" | "document" } | { error: string } {
  const png = bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  const pdf = bytes.length > 4 && String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]) === "%PDF";
  if (png) return bytes.length <= MAX_IMAGE_BYTES ? { kind: "image" } : { error: "The image is too large to post (8 MB at most)." };
  if (pdf) return bytes.length <= MAX_DOCUMENT_BYTES ? { kind: "document" } : { error: "The carousel PDF is too large to post (20 MB at most)." };
  return { error: "Only the post's own image (PNG) or carousel (PDF) can be attached." };
}

/** A document's title as LinkedIn shows it above the carousel: the post's title, plain, ending in .pdf. */
export const documentTitle = (title: string): string => `${title.replace(/[^\p{L}\p{N} .,'&!?-]/gu, "").replace(/\s+/g, " ").trim().slice(0, 80) || "Carousel"}.pdf`;

/** Whether a saved access token can still be used, with five minutes' slack. LinkedIn tokens here last about 60 days and cannot be refreshed. */
export const tokenUsable = (expiresAt: Date | string | null, now = new Date()): boolean => !!expiresAt && new Date(expiresAt).getTime() - now.getTime() > 5 * 60_000;

/** A LinkedIn error turned into words the owner can act on. */
export function explainError(status: number, body: any): string {
  const msg = typeof body?.message === "string" ? body.message.slice(0, 200) : "";
  if (status === 401) return "LinkedIn no longer accepts the sign-in (it expired or was removed). Connect LinkedIn again.";
  if (status === 403) return `LinkedIn refused the post (permission). Check the app has the Share on LinkedIn product.${msg ? ` LinkedIn said: ${msg}` : ""}`;
  if (status === 426 || /version/i.test(msg)) return `LinkedIn refused the API version. Set LINKEDIN_API_VERSION to a current YYYYMM.${msg ? ` LinkedIn said: ${msg}` : ""}`;
  if (status === 429) return "LinkedIn says too many requests. Try again later.";
  return `LinkedIn refused the request (${status})${msg ? `: ${msg}` : "."}`;
}
