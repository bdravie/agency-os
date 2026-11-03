import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { COOKIE, verifyToken } from "@/lib/session";
import { runSync } from "@/lib/calendarSync";

// Checks Google for changes and sends the CRM's task changes to Google. Called about once a minute by the open CRM (LiveCalendar) and by Sync now.
// Needs the signed-in session like every other route; it is not a webhook.
export async function POST(req: NextRequest) {
  if (!(await verifyToken((await cookies()).get(COOKIE)?.value))) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const r = await runSync({ force: body?.force === true });
  return NextResponse.json(r, { headers: { "Cache-Control": "no-store" } });
}
