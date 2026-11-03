// Signing in to Google Calendar. Same Google app (GOOGLE_CLIENT_ID and SECRET) and same callback address as the mailboxes,
// so there is nothing new to register with Google. The connection is kept apart from the mailboxes.
import { query } from "./db";
import { decryptToken } from "./mailCrypto";
import { googleConfigured, redirectUri, tokenCall, MailboxAuthError } from "./gmail";

const AUTH = "https://accounts.google.com/o/oauth2/v2/auth";
// calendar.events: create, change and delete events (and read them). No contacts, no Gmail, no Drive.
export const CALENDAR_SCOPES = ["openid", "email", "profile", "https://www.googleapis.com/auth/calendar.events"];
export { googleConfigured };

export function calendarAuthUrl(state: string, loginHint?: string): string {
  const p = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID ?? "", redirect_uri: redirectUri(), response_type: "code", scope: CALENDAR_SCOPES.join(" "),
    access_type: "offline", prompt: "consent select_account", state,
  });
  if (loginHint) p.set("login_hint", loginHint);
  return `${AUTH}?${p}`;
}

/** Swaps the one-time code for a refresh token and reads which Google account it belongs to. */
export async function exchangeCalendarCode(code: string): Promise<{ refreshToken: string; email: string; name: string | null }> {
  const t = await tokenCall({ code, grant_type: "authorization_code", redirect_uri: redirectUri() });
  if (!t.refresh_token) throw new Error("Google did not give a long-lived token. Remove the app at myaccount.google.com/permissions and connect again.");
  if (!String(t.scope ?? "").includes("calendar.events")) throw new Error("Calendar permission was not ticked on Google's screen. Connect again and tick every box.");
  const claims = JSON.parse(Buffer.from(String(t.id_token).split(".")[1] ?? "", "base64url").toString("utf8") || "{}");
  if (!claims.email || claims.email_verified === false) throw new Error("Google did not confirm the account address.");
  return { refreshToken: t.refresh_token, email: String(claims.email).toLowerCase(), name: claims.name ?? null };
}

export type Connection = { id: number; email: string; display_name: string | null; calendar_id: string; refresh_token_enc: string | null; last_error: string | null };

/** The connected calendar, if any (the most recently connected one). */
export async function getConnection(): Promise<Connection | null> {
  const [c] = await query<Connection>(`SELECT id, email, display_name, calendar_id, refresh_token_enc, last_error FROM calendar_connections WHERE refresh_token_enc IS NOT NULL ORDER BY connected_at DESC LIMIT 1`);
  return c ?? null;
}

const cache = new Map<number, { token: string; until: number }>();

export async function calendarToken(c: Pick<Connection, "id" | "refresh_token_enc">): Promise<string> {
  const hit = cache.get(c.id);
  if (hit && hit.until > Date.now() + 60_000) return hit.token;
  if (!c.refresh_token_enc) throw new MailboxAuthError("The calendar is disconnected.");
  try {
    const t = await tokenCall({ refresh_token: decryptToken(c.refresh_token_enc, process.env.SESSION_SECRET ?? ""), grant_type: "refresh_token" });
    cache.set(c.id, { token: t.access_token, until: Date.now() + Number(t.expires_in ?? 3000) * 1000 });
    await query(`UPDATE calendar_connections SET last_error = NULL WHERE id = $1 AND last_error IS NOT NULL`, [c.id]);
    return t.access_token;
  } catch (e) {
    cache.delete(c.id);
    if (e instanceof MailboxAuthError) await query(`UPDATE calendar_connections SET last_error = $2 WHERE id = $1`, [c.id, e.message.replace("mailbox", "calendar")]);
    throw e;
  }
}
