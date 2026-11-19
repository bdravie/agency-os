import { NextResponse } from "next/server";
import { answerQuestion } from "@/lib/answer";
import { loadArticles } from "@/lib/store";
import type { Turn } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { question?: string; history?: Turn[] };
  const question = String(body.question ?? "").trim();
  if (!question) return NextResponse.json({ error: "Type a question first." }, { status: 400 });
  const history = Array.isArray(body.history) ? body.history.slice(-6) : [];
  const result = await answerQuestion(question, history, loadArticles());
  return NextResponse.json(result);
}
