import { randomBytes } from "node:crypto";
import { redirectTo } from "@/lib/redirectTo";
import { NextResponse, type NextRequest } from "next/server";
import { authUrl, googleConfigured } from "@/lib/gmail";

// Starts connecting a Google mailbox. The state value is kept in a cookie and checked on the way back, so only this browser can finish it.
export async function GET(req: NextRequest) {
  if (!googleConfigured()) return redirectTo(req, "/mailboxes?error=not-configured");
  const state = randomBytes(24).toString("base64url");
  const res = NextResponse.redirect(authUrl(state, req.nextUrl.searchParams.get("hint") ?? undefined));
  res.cookies.set("google_oauth_state", state, { httpOnly: true, sameSite: "lax", secure: false, path: "/api/google", maxAge: 600 });
  return res;
}
