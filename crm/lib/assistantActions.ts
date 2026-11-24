"use server";

import { redirect } from "next/navigation";
import { AssistantError, askAssistant, validThread } from "./assistant";

// The assistant's page (/assistant): its form works with JavaScript off and redirects back to the conversation.
// It answers only on the owner's Ask.

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

/** The page's form. Without JavaScript the browser posts it and follows the redirect, so the answer shows on reload. */
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
