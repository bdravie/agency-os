import { NextResponse, type NextRequest } from "next/server";
import { query } from "@/lib/db";
import { encryptToken } from "@/lib/mailCrypto";
import { exchangeCode } from "@/lib/gmail";

const back = (req: NextRequest, q: string) => NextResponse.redirect(new URL(`/mailboxes?${q}`, req.url));

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const expected = req.cookies.get("google_oauth_state")?.value;
  const res = (r: NextResponse) => { r.cookies.delete("google_oauth_state"); return r; };
  if (p.get("error")) return res(back(req, `error=${encodeURIComponent(p.get("error")!)}`));
  if (!expected || p.get("state") !== expected || !p.get("code")) return res(back(req, "error=state"));
  try {
    const g = await exchangeCode(p.get("code")!);
    await query(
      `INSERT INTO mailboxes (email, display_name, refresh_token_enc, active, connected_at, last_error) VALUES ($1,$2,$3,true,now(),NULL)
       ON CONFLICT (lower(email)) DO UPDATE SET refresh_token_enc = EXCLUDED.refresh_token_enc, active = true, connected_at = now(), last_error = NULL,
         display_name = COALESCE(mailboxes.display_name, EXCLUDED.display_name)`,
      [g.email, g.name, encryptToken(g.refreshToken, process.env.SESSION_SECRET ?? "")]);
    return res(back(req, `connected=${encodeURIComponent(g.email)}`));
  } catch (e) {
    return res(back(req, `error=${encodeURIComponent(e instanceof Error ? e.message.slice(0, 200) : "failed")}`));
  }
}
