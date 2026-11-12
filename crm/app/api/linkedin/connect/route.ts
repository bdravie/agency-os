import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { redirectTo } from "@/lib/redirectTo";
import { authorizeUrl, linkedinConfigured } from "@/lib/linkedinApiMath";

// Starts connecting the owner's LinkedIn profile (click-to-post, L6). The state value is kept in a cookie and checked on the way back,
// so only this browser can finish it. Signed-in only, like every page (middleware).
export async function GET(req: NextRequest) {
  if (!linkedinConfigured()) return redirectTo(req, "/content?tab=linkedin&linkedin=not-configured");
  const state = randomBytes(24).toString("base64url");
  const res = NextResponse.redirect(authorizeUrl(state));
  res.cookies.set("linkedin_oauth_state", state, { httpOnly: true, sameSite: "lax", secure: false, path: "/api/linkedin", maxAge: 600 });
  return res;
}
