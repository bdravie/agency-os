import { NextResponse } from "next/server";
import { setUnansweredStatus } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { id?: string; status?: string };
  const status = body.status === "dismissed" || body.status === "fixed" || body.status === "open" ? body.status : null;
  if (!body.id || !status) return NextResponse.json({ ok: false }, { status: 400 });
  setUnansweredStatus(String(body.id), status);
  return NextResponse.json({ ok: true });
}
