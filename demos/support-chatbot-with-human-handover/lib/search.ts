// Keyword search over the help articles (BM25, the scoring most search engines started from).
// No vector database and no embeddings: a shop's help centre is small, the words customers use are
// close to the article words, and every match can be explained ("matched: refund, days").
import type { Article } from "./types";

const STOP = new Set(
  ("a an and are as at be been but by can could did do does doing for from get got had has have how i i'm im if in into is it " +
    "it's its just me my of on or our please so that the their them then there these this to too up us was we what when where " +
    "which who why will with would you your yours hi hello thanks thank any some about after before still yet not no").split(" "),
);

// A few everyday words customers use for the same thing as the articles.
const SYNONYMS: Record<string, string[]> = {
  parcel: ["order", "delivery"],
  package: ["order", "delivery"],
  ship: ["delivery"],
  shipping: ["delivery"],
  post: ["delivery"],
  postage: ["delivery"],
  money: ["refund"],
  cracked: ["damaged"],
  smashed: ["damaged"],
  login: ["sign"],
  log: ["sign"],
  instalment: ["instalments"],
  sunday: ["sundays", "open"],
  saturday: ["open"],
  abroad: ["international"],
  france: ["abroad", "international"],
  spain: ["abroad", "international"],
  ireland: ["abroad"],
};

/** Very light stemming, enough that "returns", "returned" and "returning" meet. */
export function stem(w: string): string {
  if (w.length > 5 && w.endsWith("ing")) return w.slice(0, -3);
  if (w.length > 4 && w.endsWith("ed")) return w.slice(0, -2);
  if (w.length > 4 && w.endsWith("ies")) return w.slice(0, -3) + "y";
  if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss")) return w.slice(0, -1);
  return w;
}

export function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[’']/g, "")
    .split(/[^a-z0-9]+/)
    .filter((w) => w && !STOP.has(w))
    .map(stem);
}

function queryTokens(text: string): string[] {
  const raw = text.toLowerCase().replace(/[’']/g, "").split(/[^a-z0-9]+/).filter((w) => w && !STOP.has(w));
  const out = new Set<string>();
  for (const w of raw) {
    out.add(stem(w));
    for (const s of SYNONYMS[w] ?? []) out.add(stem(s));
  }
  return [...out];
}

const FIELD_WEIGHT = { title: 3, tags: 3, body: 1 };
const K1 = 1.2;
const B = 0.75;

type Doc = { article: Article; tf: Map<string, number>; length: number };

function index(articles: Article[]): { docs: Doc[]; df: Map<string, number>; avgLength: number } {
  const docs = articles.map((article) => {
    const tf = new Map<string, number>();
    const add = (text: string, weight: number) => {
      for (const t of tokens(text)) tf.set(t, (tf.get(t) ?? 0) + weight);
    };
    add(article.title, FIELD_WEIGHT.title);
    add(article.tags.join(" "), FIELD_WEIGHT.tags);
    add(article.body, FIELD_WEIGHT.body);
    const length = [...tf.values()].reduce((a, b) => a + b, 0);
    return { article, tf, length };
  });
  const df = new Map<string, number>();
  for (const d of docs) for (const t of d.tf.keys()) df.set(t, (df.get(t) ?? 0) + 1);
  const avgLength = docs.reduce((a, d) => a + d.length, 0) / Math.max(docs.length, 1);
  return { docs, df, avgLength };
}

export type Match = { article: Article; score: number; matched: string[] };

/** The best articles for a question, highest score first. */
export function search(question: string, articles: Article[], limit = 3): Match[] {
  const { docs, df, avgLength } = index(articles);
  const q = queryTokens(question);
  const n = docs.length;
  const scored: Match[] = docs.map((d) => {
    let score = 0;
    const matched: string[] = [];
    for (const t of q) {
      const f = d.tf.get(t);
      if (!f) continue;
      const idf = Math.log(1 + (n - (df.get(t) ?? 0) + 0.5) / ((df.get(t) ?? 0) + 0.5));
      score += idf * ((f * (K1 + 1)) / (f + K1 * (1 - B + (B * d.length) / avgLength)));
      matched.push(t);
    }
    return { article: d.article, score: Math.round(score * 100) / 100, matched };
  });
  return scored.filter((m) => m.score > 0).sort((a, b) => b.score - a.score).slice(0, limit);
}

/**
 * Below this score nothing is close enough to send to Claude, so the bot says it is not sure without
 * calling the API at all (free). Tuned on sample-data/test-questions.json with `npm run eval -- --search-only`.
 */
export const MIN_SCORE = 2.5;

/** Articles worth sending: the best match, plus any others scoring at least half as well. */
export function relevant(matches: Match[]): Match[] {
  if (!matches.length || matches[0].score < MIN_SCORE) return [];
  return matches.filter((m) => m.score >= Math.max(MIN_SCORE, matches[0].score / 2));
}
