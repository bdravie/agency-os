import Anthropic from "@anthropic-ai/sdk";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { query } from "./db";
import { anthropicClient, assistantModel, MODELS } from "./llm";
import { knowledgeIndex, knowledgeTopics } from "./knowledge";
import { assembleAnswer, citedRefs, passagesBlock, questionProblem, retrieve, type AnswerBlock, type AssistantSource, type Passage } from "./knowledgeMath";

// The knowledge-base assistant at the centre of the dashboard brain. It runs only when the owner presses Ask, within a
// daily cap, reads the passages from config/knowledge.yaml's files that best match the question (and searches the web only
// when the owner ticks it), and saves the question and answer in assistant_messages. It reads no CRM records and sends nothing.

export type { AssistantSource };
export type AssistantMessage = { id: number; role: "user" | "assistant"; content: string; sources: AssistantSource[]; topic: string | null; web: boolean; created_at: string };

/** A problem to show the owner as it is (a refusal, a cap, a cut-off reply). Anything else is logged and reported generically. */
export class AssistantError extends Error {}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const validThread = (s: unknown): string | null => (typeof s === "string" && UUID.test(s) ? s.toLowerCase() : null);

export const assistantCaps = () => ({
  cap: Number(process.env.ASSISTANT_DAILY_CAP ?? 40) || 40,
  webCap: Number(process.env.ASSISTANT_WEB_DAILY_CAP ?? 10) || 10,
});

const TODAY = `created_at >= (date_trunc('day', now() AT TIME ZONE 'Europe/London') AT TIME ZONE 'Europe/London')`;

export async function usageToday(): Promise<{ asked: number; web: number; cap: number; webCap: number }> {
  const [r] = await query<{ asked: string; web: string }>(
    `SELECT count(*) AS asked, count(*) FILTER (WHERE web) AS web FROM assistant_messages WHERE role = 'assistant' AND ${TODAY}`);
  return { asked: Number(r.asked), web: Number(r.web), ...assistantCaps() };
}

export async function loadThread(threadId: string): Promise<AssistantMessage[]> {
  return query<AssistantMessage>(
    `SELECT id::int AS id, role, content, sources, topic, web, created_at::text AS created_at
       FROM assistant_messages WHERE thread_id = $1 ORDER BY created_at, id`, [threadId]);
}

export async function latestThreadId(): Promise<string | null> {
  const [r] = await query<{ thread_id: string }>(`SELECT thread_id FROM assistant_messages ORDER BY created_at DESC, id DESC LIMIT 1`);
  return r?.thread_id ?? null;
}

function root(): string {
  return existsSync(path.join(process.cwd(), "prompts")) ? process.cwd() : path.resolve(process.cwd(), "..");
}

// Models that accept server-side refusal fallbacks ("default" routing), and the web search tool version they take.
const FALLBACK_MODELS = new Set([MODELS.sonnet, MODELS.opus, "claude-fable-5-2", "claude-fable-5-1", "claude-opus-5"]);
const WEB_SEARCH = { type: "web_search_20260209", name: "web_search", max_uses: 3, user_location: { type: "approximate", country: "GB", timezone: "Europe/London" } };


export async function askAssistant(input: { question: string; threadId?: string | null; topic?: string | null; web?: boolean }): Promise<{ threadId: string }> {
  const question = input.question.trim();
  const problem = questionProblem(question);
  if (problem) throw new AssistantError(problem);

  const topics = await knowledgeTopics();
  const topic = topics.find((t) => t.key === input.topic) ?? null;
  const usage = await usageToday();
  if (usage.asked >= usage.cap) throw new AssistantError(`Daily limit of ${usage.cap} answers reached (ASSISTANT_DAILY_CAP). Ask again tomorrow.`);
  const web = Boolean(input.web);
  if (web && usage.web >= usage.webCap) throw new AssistantError(`Daily limit of ${usage.webCap} web searches reached (ASSISTANT_WEB_DAILY_CAP). Untick Search the web, or ask tomorrow.`);

  const threadId = validThread(input.threadId) ?? crypto.randomUUID();
  const history = (await loadThread(threadId)).slice(-8);
  const lastQuestion = [...history].reverse().find((m) => m.role === "user")?.content ?? "";

  // The question counts twice and the previous question once, so a short follow-up ("and for retainers?") still finds its passages.
  const { index, perQuestion } = await knowledgeIndex();
  const passages = retrieve(index, `${question} ${question} ${lastQuestion}`, { topic: topic?.key ?? null, k: perQuestion });

  const system = `${await readFile(path.join(root(), "prompts", "assistant.md"), "utf8")}\n\nThe knowledge topics are: ${topics.map((t) => `${t.label} (${t.description})`).join("; ")}.`;
  const messages: Anthropic.MessageParam[] = [
    // Earlier answers' [K1] markers pointed at that turn's passages, so they are removed rather than left to clash with this turn's.
    ...trimHistory(history).map((m) => ({ role: m.role, content: m.content.replace(/\s?\[[KW]\d{1,2}(?:\s*,\s*[KW]\d{1,2})*\]/g, "") }) as Anthropic.MessageParam),
    { role: "user", content: `Passages from the owner's knowledge files:\n\n${passagesBlock(passages)}\n\n${topic ? `Topic chosen: ${topic.label}.\n` : ""}${web ? "Web search is allowed for this question.\n" : ""}Question: ${question}` },
  ];

  let model = assistantModel();
  if (web && model === MODELS.haiku) model = MODELS.sonnet;   // the dynamic web search tool needs Sonnet or above
  const blocks = await callModel(model, system, messages, web);

  const { text, webSources } = assembleAnswer(blocks);
  if (!text) throw new AssistantError("The AI returned an empty answer. Try asking again.");
  const sources: AssistantSource[] = [...fileSources(text, passages), ...webSources];

  await query(
    `INSERT INTO assistant_messages (thread_id, role, content, topic, sources, model, web) VALUES
       ($1, 'user', $2, $3, '[]'::jsonb, NULL, $4),
       ($1, 'assistant', $5, $3, $6::jsonb, $7, $4)`,
    [threadId, question, topic?.key ?? null, web, text.slice(0, 20000), JSON.stringify(sources), model]);
  return { threadId };
}

/** Earlier turns, newest kept, at most about 12,000 characters, starting with a question. */
function trimHistory(history: AssistantMessage[]): AssistantMessage[] {
  const kept: AssistantMessage[] = [];
  let size = 0;
  for (const m of [...history].reverse()) {
    size += m.content.length;
    if (size > 12_000) break;
    kept.unshift(m);
  }
  while (kept.length && kept[0].role !== "user") kept.shift();
  return kept;
}

async function callModel(model: string, system: string, messages: Anthropic.MessageParam[], web: boolean): Promise<AnswerBlock[]> {
  const client = anthropicClient();
  const fallbacks = FALLBACK_MODELS.has(model);
  const all: AnswerBlock[] = [];
  const convo = [...messages];
  // A web search can pause a long turn (stop_reason "pause_turn"); sending the partial turn back lets it carry on.
  for (let round = 0; round < 4; round++) {
    // SDK 0.39 predates output_config, server-side fallbacks and this web search version, so the body is built untyped.
    const body: Record<string, unknown> = {
      model, max_tokens: 8000, system, messages: convo,
      output_config: { effort: "medium" },
      ...(web ? { tools: [WEB_SEARCH] } : {}),
      ...(fallbacks ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" } : {}),
    };
    let res: { content: AnswerBlock[]; stop_reason: string | null };
    try {
      res = (fallbacks
        ? await client.beta.messages.create(body as unknown as Anthropic.Beta.Messages.MessageCreateParamsNonStreaming)
        : await client.messages.create(body as unknown as Anthropic.MessageCreateParamsNonStreaming)) as unknown as typeof res;
    } catch (e) {
      if (e instanceof Anthropic.RateLimitError) throw new AssistantError("The AI service is busy (rate limited). Try again in a minute.");
      if (e instanceof Anthropic.AuthenticationError) throw new AssistantError("The Anthropic API key was refused. Check ANTHROPIC_API_KEY in .env.");
      if (e instanceof Anthropic.APIError) { console.error("Assistant:", e.status, e.message); throw new AssistantError(`The AI service returned an error (${e.status ?? "no status"}). Try again shortly.`); }
      throw e;
    }
    all.push(...res.content);
    if (res.stop_reason === "refusal") throw new AssistantError("The AI declined to answer this one. Try rewording the question.");
    if (res.stop_reason === "max_tokens") throw new AssistantError("The answer was cut off before it finished. Ask for a shorter answer, or split the question.");
    if (res.stop_reason !== "pause_turn") return all;
    convo.push({ role: "assistant", content: res.content as unknown as Anthropic.ContentBlockParam[] });
  }
  return all;
}

function fileSources(text: string, passages: Passage[]): AssistantSource[] {
  return citedRefs(text).filter((r) => r.startsWith("K")).flatMap((ref) => {
    const p = passages[Number(ref.slice(1)) - 1];
    return p ? [{ ref, kind: "file" as const, title: p.heading || p.file, path: p.file }] : [];
  });
}
