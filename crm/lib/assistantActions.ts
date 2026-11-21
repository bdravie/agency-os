"use server";

import { redirect } from "next/navigation";
import { AssistantError, askAssistant, latestThreadId, loadThread, usageToday, validThread, type AssistantMessage } from "./assistant";

// The assistant's two ways in: the full page (/assistant), whose form works with JavaScript off and redirects back to the
// conversation, and the panel the brain's core opens, which stays in place. Both answer only on the owner's Ask.

const read = (fd: FormData) => ({
  question: String(fd.get("question") ?? ""),
  threadId: validThread(fd.get("thread")),
  topic: String(fd.get("topic") ?? "") || null,
  web: fd.get("web") === "on",
});

function friendly(e: unknown): string {
  if (e instanceof AssistantError) return e.message;
  console.error("Assistant failed:", e);
  return e instanceof Error && /ANTHROPIC_API_KEY|DATABASE_URL/.test(e.message) ? e.message : "Something went wrong answering that. Nothing was saved; try again.";
}

/** The full page's form. Without JavaScript the browser posts it and follows the redirect, so the answer shows on reload. */
export async function askFromPage(fd: FormData) {
  const input = read(fd);
  let threadId = input.threadId;
  let error: string | null = null;
  try { threadId = (await askAssistant(input)).threadId; }
  catch (e) { error = friendly(e); }
  const q = new URLSearchParams();
  if (threadId) q.set("thread", threadId); else q.set("new", "1");
  if (error) { q.set("error", error); q.set("q", input.question.slice(0, 1500)); }
  redirect(`/assistant?${q}${error ? "" : "#latest"}`);
}

export type PanelState = { threadId: string | null; messages: AssistantMessage[]; error: string | null; usage: { asked: number; cap: number } | null; draft?: string };

/** The brain's panel: answers and returns the whole conversation, so it can redraw in place. */
export async function askInPanel(prev: PanelState, fd: FormData): Promise<PanelState> {
  const input = read(fd);
  try {
    const { threadId } = await askAssistant(input);
    const usage = await usageToday();
    return { threadId, messages: await loadThread(threadId), error: null, usage: { asked: usage.asked, cap: usage.cap } };
  } catch (e) {
    return { ...prev, error: friendly(e), draft: input.question };
  }
}

/** What the panel shows when it opens: the latest conversation, unless a new one was asked for. */
export async function openPanel(fresh: boolean): Promise<PanelState> {
  try {
    const threadId = fresh ? null : await latestThreadId();
    const usage = await usageToday();
    return { threadId, messages: threadId ? await loadThread(threadId) : [], error: null, usage: { asked: usage.asked, cap: usage.cap } };
  } catch (e) {
    return { threadId: null, messages: [], error: friendly(e), usage: null };
  }
}
