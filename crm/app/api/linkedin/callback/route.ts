import { type NextRequest, type NextResponse } from "next/server";
import { redirectTo } from "@/lib/redirectTo";
import { connectWithCode } from "@/lib/linkedinApi";
import { logActivity } from "@/lib/activity";

// LinkedIn sends the browser back here after the consent screen. The state must match the cookie set by /api/linkedin/connect.
const back = (req: NextRequest, q: string) => redirectTo(req, `/content?tab=linkedin&${q}`);

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const expected = req.cookies.get("linkedin_oauth_state")?.value;
  const done = (r: NextResponse) => { r.cookies.delete("linkedin_oauth_state"); return r; };
  if (p.get("error")) return done(back(req, `linkedin=error&reason=${encodeURIComponent((p.get("error_description") ?? p.get("error") ?? "").slice(0, 200))}`));
  if (!expected || p.get("state") !== expected || !p.get("code")) return done(back(req, "linkedin=error&reason=state"));
  try {
    const { name } = await connectWithCode(p.get("code")!);
    await logActivity("linkedin_connected", { channel: "linkedin", body: "Connected LinkedIn for click-to-post" });
    return done(back(req, `linkedin=connected&name=${encodeURIComponent(name)}`));
  } catch (e) {
    return done(back(req, `linkedin=error&reason=${encodeURIComponent(e instanceof Error ? e.message.slice(0, 200) : "failed")}`));
  }
}
