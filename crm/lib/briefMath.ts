// Pure helpers for trend notes and the weekly content brief (no AI, no files, no database), so they can be tested on their own.
// Every number in the brief is worked out in code from the same data as the What's working page; the AI only writes the words around them.
import type { Group } from "./insightsMath.ts";

const text = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
const SOCIAL = /(^|\.)(instagram|tiktok|youtube|youtu|linkedin|facebook|x|twitter)\.(com|be)$/i;

/** A trend you noticed, tidied: a title, an optional https link (tracking removed) and note, and a niche you work in. Returns an error message if it is no good. */
export function cleanTrend(raw: { title?: string; url?: string; detail?: string; niche?: string }, niches: string[]): { trend: { title: string; url: string | null; detail: string | null; niche: string | null } } | { error: string } {
  const title = text(raw.title, 140);
  if (title.length < 3) return { error: "Give the trend a short title (at least 3 characters)." };
  let url: string | null = null;
  const link = (raw.url ?? "").trim();
  if (link) {
    let u: URL;
    try { u = new URL(link); } catch { return { error: "That is not a valid link." }; }
    if (u.protocol !== "https:") return { error: "Links must start with https://." };
    if (SOCIAL.test(u.hostname)) u.search = "";   // share links carry tracking codes that can identify a person
    else for (const k of [...u.searchParams.keys()]) if (/^utm_|^fbclid$|^gclid$/i.test(k)) u.searchParams.delete(k);
    u.hash = "";
    url = u.toString().replace(/\/$/, "");
  }
  const niche = (raw.niche ?? "").trim();
  if (niche && !niches.includes(niche)) return { error: "That is not one of your niches." };
  return { trend: { title, url, detail: text(raw.detail, 300) || null, niche: niche || null } };
}

export type BriefNumbers = {
  weekStart: string;                                   // the Monday the brief is for, YYYY-MM-DD
  target: number;
  lastWeek: { hook: string; platform: string; label: string }[];   // last week's posts, each with its × score or what is missing
  pillars: Group[];                                    // the same groups as What's working
  hookTypes: Group[];
  keywordReplies: number;
  outliers: { total: number; top: { handle: string; platform: string; x: number; keyword: string | null }[] };
  trends: { id: number; title: string }[];
  film: { id: number; idea: string; rank: number }[];
};
export type BriefProse = { headline: string; what_happened: string[]; what_to_do: string[] };

const best = (g: Group[]): Group | null => g.find((x) => !x.thin) ?? null;
const grp = (name: string, g: Group | null) => (g ? `${name}: ${g.key}, median ${g.median}× over ${g.n} posts` : `${name}: no group has 3 posts yet`);

/** The numbers as plain lines. This one text is what the AI is shown and what its answer is checked against, and it holds every figure the page displays. */
export function briefDigest(n: BriefNumbers): string {
  return [
    `Brief for the week starting ${n.weekStart}.`,
    `Posts last week: ${n.lastWeek.length} against a target of ${n.target} a week.`,
    ...n.lastWeek.map((p) => `- "${p.hook}": ${p.label}`),
    grp("Best pillar", best(n.pillars)), grp("Best hook type", best(n.hookTypes)),
    `Keyword replies counted by hand last week: ${n.keywordReplies}.`,
    `New outliers from creators you follow: ${n.outliers.total}.`,
    ...n.outliers.top.map((o) => `- ${o.x}× their usual on ${o.platform}${o.keyword ? `, keyword ${o.keyword}` : ""}`),
    `Trends you noted and have not used: ${n.trends.length}.`,
    ...n.trends.map((t) => `- ${t.title}`),
    `Film these ${n.film.length} next:`,
    ...n.film.map((f, i) => `${i + 1}. ${f.idea} (rank ${f.rank})`),
  ].join("\n");
}

/** Whether there is anything at all to write a brief about. */
export const briefIsEmpty = (n: BriefNumbers): boolean => !n.lastWeek.length && !n.outliers.total && !n.trends.length && !n.film.length;

/** Tidy the prose the AI returned: a headline and exactly three observations and three things to do. */
export function cleanProse(raw: any): BriefProse | null {
  const list = (v: unknown) => (Array.isArray(v) ? v.map((x) => text(x, 280)).filter(Boolean).slice(0, 3) : []);
  const p = { headline: text(raw?.headline, 200), what_happened: list(raw?.what_happened), what_to_do: list(raw?.what_to_do) };
  return p.headline && p.what_happened.length === 3 && p.what_to_do.length === 3 ? p : null;
}
