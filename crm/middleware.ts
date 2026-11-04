import { NextResponse, type NextRequest } from "next/server";
import { COOKIE, verifyToken } from "@/lib/session";

// Everything needs login except the login page and signed webhooks.
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
  if (pathname === "/login" || pathname.startsWith("/api/webhooks/")) return NextResponse.next();
  if (await verifyToken(req.cookies.get(COOKIE)?.value)) return NextResponse.next();
  if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  return NextResponse.redirect(new URL("/login", req.url));
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
