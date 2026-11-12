import { NextResponse, type NextRequest } from "next/server";
import { redirectTo } from "@/lib/redirectTo";
import { query } from "@/lib/db";
import { encryptToken } from "@/lib/mailCrypto";
import { exchangeCode } from "@/lib/gmail";
import { exchangeCalendarCode } from "@/lib/gcalAuth";

const back = (req: NextRequest, q: string, page = "/mailboxes") => redirectTo(req, `${page}?${q}`);

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const expected = req.cookies.get("google_oauth_state")?.value;
  const calendar = req.cookies.get("google_oauth_kind")?.value === "calendar";
  const page = calendar ? "/calendar" : "/mailboxes";
  const res = (r: NextResponse) => { r.cookies.delete("google_oauth_state"); r.cookies.delete("google_oauth_kind"); return r; };
  if (p.get("error")) return res(back(req, `error=${encodeURIComponent(p.get("error")!)}`, page));
  if (!expected || p.get("state") !== expected || !p.get("code")) return res(back(req, "error=state", page));
  try {
    if (calendar) {
      const g = await exchangeCalendarCode(p.get("code")!);
      await query(
        `INSERT INTO calendar_connections (email, display_name, refresh_token_enc, connected_at, last_error) VALUES ($1,$2,$3,now(),NULL)
         ON CONFLICT (lower(email)) DO UPDATE SET refresh_token_enc = EXCLUDED.refresh_token_enc, connected_at = now(), last_error = NULL,
           display_name = COALESCE(calendar_connections.display_name, EXCLUDED.display_name)`,
        [g.email, g.name, encryptToken(g.refreshToken, process.env.SESSION_SECRET ?? "")]);
      return res(back(req, `connected=${encodeURIComponent(g.email)}`, page));
    }
    const g = await exchangeCode(p.get("code")!);
    await query(
      `INSERT INTO mailboxes (email, display_name, refresh_token_enc, active, connected_at, last_error) VALUES ($1,$2,$3,true,now(),NULL)
       ON CONFLICT (lower(email)) DO UPDATE SET refresh_token_enc = EXCLUDED.refresh_token_enc, active = true, connected_at = now(), last_error = NULL,
         display_name = COALESCE(mailboxes.display_name, EXCLUDED.display_name)`,
      [g.email, g.name, encryptToken(g.refreshToken, process.env.SESSION_SECRET ?? "")]);
    return res(back(req, `connected=${encodeURIComponent(g.email)}`));
  } catch (e) {
    return res(back(req, `error=${encodeURIComponent(e instanceof Error ? e.message.slice(0, 200) : "failed")}`, page));
  }
}
