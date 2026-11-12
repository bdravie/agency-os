import { randomBytes } from "node:crypto";
import { redirectTo } from "@/lib/redirectTo";
import { NextResponse, type NextRequest } from "next/server";
import { calendarAuthUrl, googleConfigured } from "@/lib/gcalAuth";

// Starts connecting the Google Calendar. The state value is kept in a cookie and checked on the way back, so only this browser can finish it.
// The shared callback (/api/google/callback) reads the "kind" cookie to know this is the calendar and not a mailbox.
export async function GET(req: NextRequest) {
  if (!googleConfigured()) return redirectTo(req, "/calendar?error=not-configured");
  const state = randomBytes(24).toString("base64url");
  const res = NextResponse.redirect(calendarAuthUrl(state, req.nextUrl.searchParams.get("hint") ?? undefined));
  const opts = { httpOnly: true, sameSite: "lax" as const, secure: false, path: "/api/google", maxAge: 600 };
  res.cookies.set("google_oauth_state", state, opts);
  res.cookies.set("google_oauth_kind", "calendar", opts);
  return res;
}
