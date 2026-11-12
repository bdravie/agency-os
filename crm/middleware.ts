import { NextResponse, type NextRequest } from "next/server";
import { redirectTo } from "@/lib/redirectTo";
import { COOKIE, verifyToken } from "@/lib/session";

// The home-screen manifest and icons hold no data, and phones fetch them without the session cookie, so they are open (docs/SETUP.md, phone).
const PUBLIC_ASSETS = new Set(["/manifest.webmanifest", "/apple-icon", "/icon-192.png", "/icon-512.png", "/icon.svg"]);

// Everything needs login except the login page, signed webhooks and the home-screen icons above.
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname === "/login" && req.method === "GET") {
    // Opening the password page always signs you out, so it can never show the app (sidebar included) behind a password box.
    const headers = new Headers(req.headers);
    const rest = (headers.get("cookie") ?? "").split(";").map((c) => c.trim()).filter((c) => c && !c.startsWith(`${COOKIE}=`));
    if (rest.length) headers.set("cookie", rest.join("; ")); else headers.delete("cookie");
    const res = NextResponse.next({ request: { headers } });
    if (req.cookies.has(COOKIE)) res.cookies.delete(COOKIE);
    return res;
  }
  if (pathname === "/login" || pathname.startsWith("/api/webhooks/") || PUBLIC_ASSETS.has(pathname)) return NextResponse.next();
  if (await verifyToken(req.cookies.get(COOKIE)?.value)) return NextResponse.next();
  if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  return redirectTo(req, "/login");   // on the address the browser used, so the phone (via Tailscale) is not sent to localhost
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
