import { NextResponse, type NextRequest } from "next/server";
import { publicOrigin } from "./redirectToMath";

/** A redirect to a path on this same site, on the address the browser used. Only same-site paths are accepted. */
export function redirectTo(req: NextRequest, path: string): NextResponse {
  if (!path.startsWith("/") || path.startsWith("//")) throw new Error("redirectTo only takes a path on this site");
  return NextResponse.redirect(new URL(path, publicOrigin(req.headers, req.url)));
}
