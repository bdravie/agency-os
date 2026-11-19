// One customer question in, one reply out. The order matters:
// 1. contact details are removed, 2. an unhappy customer is offered a person at once,
// 3. the search picks the articles (or finds none, and Claude is never called),
// 4. Claude answers from those articles only, 5. code checks the answer before the customer sees it.
import { askJson, hasKey, prompt, SHOP, type Usage } from "./claude";
import { relevant, search, type Match } from "./search";
import { logUnanswered } from "./store";
import { maskContactDetails, soundsUnhappy, unsupportedNumbers } from "./text";
import type { Article, ChatReply, NotSureReason, Turn } from "./types";

export const NOT_SURE_TEXT =
  "I'm not sure about that from our help pages, and I'd rather not guess. I can pass your question to a person in our customer team.";

const SCHEMA = {
  type: "object",
  properties: {
    answerable: { type: "boolean", description: "True only if the articles fully answer the question." },
    answer: { type: "string", description: "1 to 3 short sentences, empty when not answerable." },
    sources: { type: "array", items: { type: "string" }, description: "Ids of the articles used." },
  },
  required: ["answerable", "answer", "sources"],
  additionalProperties: false,
} as const;

type Raw = { answerable: boolean; answer: string; sources: string[] };

export type AnswerResult = {
  reply: ChatReply;
  masked: boolean;
  matches: { id: string; score: number; matched: string[] }[];
  usage?: Usage;
  cached?: boolean;
  problem?: string;
};

function articleBlock(m: Match[]): string {
  return m.map(({ article: a }) => `<article id="${a.id}" title="${a.title}">\n${a.body}\n</article>`).join("\n\n");
}

function historyBlock(history: Turn[]): string {
  return history
    .slice(-6)
    .map((t) => `${t.who === "customer" ? "Customer" : "Help chat"}: ${maskContactDetails(t.text).text}`)
    .join("\n") || "(none)";
}

function notSure(question: string, reason: NotSureReason, nearest?: Article): ChatReply {
  logUnanswered({ question, reason, nearest: nearest?.title });
  return { kind: "not_sure", text: NOT_SURE_TEXT, reason, nearest: nearest ? { id: nearest.id, title: nearest.title } : undefined };
}

export async function answerQuestion(rawQuestion: string, history: Turn[], articles: Article[], opts: { fresh?: boolean } = {}): Promise<AnswerResult> {
  const { text: question, masked } = maskContactDetails(rawQuestion.trim().slice(0, 500));
  const matches = search(question, articles);
  const debug = matches.map((m) => ({ id: m.article.id, score: m.score, matched: m.matched }));

  if (soundsUnhappy(question)) {
    return {
      masked,
      matches: debug,
      reply: { kind: "unhappy", text: "I'm sorry this hasn't been easy. Let me pass you to a person in our customer team, with this chat attached so you don't have to repeat yourself." },
    };
  }

  const picked = relevant(matches);
  if (!picked.length) return { masked, matches: debug, reply: notSure(question, "no_match", matches[0]?.article) };

  // Offline mode (no API key, or SUPPORT_DEMO_NO_LLM=1): show the closest article's opening lines, clearly labelled.
  if (!hasKey()) {
    const a = picked[0].article;
    const opening = a.body.split("\n\n").slice(0, 2).join(" ");
    return { masked, matches: debug, reply: { kind: "answer", text: `(Offline demo mode: closest help article.) ${opening}`, sources: [{ id: a.id, title: a.title }], cached: false } };
  }

  const system = prompt("answer", { SHOP, ARTICLES: articleBlock(picked), HISTORY: historyBlock(history) });
  let result;
  try {
    result = await askJson<Raw>(system, `Customer question: ${question}`, SCHEMA, opts.fresh);
  } catch (e) {
    return { masked, matches: debug, problem: (e as Error).message, reply: notSure(question, "failed_check", picked[0].article) };
  }
  const { data, usage, cached } = result;

  if (!data.answerable || !data.answer.trim()) {
    return { masked, matches: debug, usage, cached, reply: notSure(question, "not_in_articles", picked[0].article) };
  }

  // Code, not the prompt, decides whether the answer may be shown.
  const sent = new Map(picked.map((m) => [m.article.id, m.article]));
  const used = [...new Set(data.sources)].filter((id) => sent.has(id)).map((id) => sent.get(id)!);
  if (!used.length) {
    return { masked, matches: debug, usage, cached, problem: "no valid source named", reply: notSure(question, "failed_check", picked[0].article) };
  }
  const sourceText = used.map((a) => `${a.title}\n${a.body}`).join("\n");
  const invented = unsupportedNumbers(data.answer, sourceText);
  if (invented.length) {
    return { masked, matches: debug, usage, cached, problem: `figures not in the articles: ${invented.join(", ")}`, reply: notSure(question, "failed_check", used[0]) };
  }

  return {
    masked,
    matches: debug,
    usage,
    cached,
    reply: { kind: "answer", text: maskContactDetails(data.answer.trim()).text, sources: used.map((a) => ({ id: a.id, title: a.title })), cached },
  };
}
