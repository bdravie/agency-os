import { NextResponse } from "next/server";
import { logUnanswered } from "@/lib/store";
import { maskContactDetails } from "@/lib/text";

export const dynamic = "force-dynamic";

/** "That didn't help" on an answer: the question goes on the staff page's list of gaps. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { question?: string; source?: string };
  const question = maskContactDetails(String(body.question ?? "").slice(0, 500)).text.trim();
  if (!question) return NextResponse.json({ ok: false }, { status: 400 });
  logUnanswered({ question, reason: "did_not_help", nearest: body.source ? String(body.source).slice(0, 100) : undefined });
  return NextResponse.json({ ok: true });
}
