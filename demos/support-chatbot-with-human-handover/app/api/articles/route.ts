import { NextResponse } from "next/server";
import { loadArticles, saveArticle, setUnansweredStatus } from "@/lib/store";
import { articleProblem, slugify } from "@/lib/articleRules";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ articles: loadArticles() });
}

/** Add or edit a help article. It is used by the very next question: the chat reads the file on every request. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    id?: string; title?: string; category?: string; tags?: string; body?: string; fixes?: string;
  };
  const draft = {
    title: String(body.title ?? "").trim(),
    category: String(body.category ?? "").trim() || "General",
    tags: String(body.tags ?? "").split(",").map((t) => t.trim().toLowerCase()).filter(Boolean).slice(0, 20),
    body: String(body.body ?? "").replace(/\r\n/g, "\n").trim(),
  };
  const problem = articleProblem(draft);
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });
  const existing = loadArticles();
  let id = body.id && existing.some((a) => a.id === body.id) ? body.id : slugify(draft.title);
  if (!body.id || body.id !== id) while (existing.some((a) => a.id === id)) id = `${id}-2`;
  const saved = saveArticle({ id, ...draft });
  if (body.fixes) setUnansweredStatus(String(body.fixes), "fixed");
  return NextResponse.json({ article: saved });
}
