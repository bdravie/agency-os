// Pure helpers for breaking down a creator's outlier post into ideas (no AI, no files, no database), so they can be tested on their own.
// The AI is asked to borrow structure and angle, never wording, and never to claim a result. These checks make that true in code.
import { HOOK_TYPES, PILLARS } from "./contentMath.ts";

export type AdaptedIdea = { idea: string; hook: string; pillar: string; hook_type: string; niche: string; content_id?: number };
export type Breakdown = {
  hook: string; hook_type: string | null; format: string; length_note: string; beats: string[]; why_it_worked: string[]; cta: string | null;
  ideas: AdaptedIdea[]; based_on: "caption" | "caption_and_transcript"; made_at: string;
};

const text = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
const list = (v: unknown, n: number, max: number) => (Array.isArray(v) ? v.map((x) => text(x, max)).filter(Boolean).slice(0, n) : []);

/** Tidy what the model returned. An idea with an unknown pillar, hook type or niche is dropped, so a saved idea always fits the board and the insights page. */
export function cleanBreakdown(raw: any, niches: string[], basedOn: Breakdown["based_on"], now = new Date()): Breakdown {
  const ht = (HOOK_TYPES as readonly string[]).includes(raw?.hook_type) ? raw.hook_type : null;
  const ideas = (Array.isArray(raw?.ideas) ? raw.ideas : []).map((i: any): AdaptedIdea => ({
    idea: text(i?.idea, 300), hook: text(i?.hook, 160), pillar: String(i?.pillar ?? ""), hook_type: String(i?.hook_type ?? ""), niche: String(i?.niche ?? ""),
  })).filter((i: AdaptedIdea) => i.idea && i.hook && (PILLARS as readonly string[]).includes(i.pillar) && (HOOK_TYPES as readonly string[]).includes(i.hook_type) && niches.includes(i.niche)).slice(0, 3);
  return {
    hook: text(raw?.hook, 300), hook_type: ht, format: text(raw?.format, 120), length_note: text(raw?.length_note, 160),
    beats: list(raw?.beats, 6, 180), why_it_worked: list(raw?.why_it_worked, 4, 240), cta: text(raw?.cta, 200) || null, ideas, based_on: basedOn, made_at: now.toISOString(),
  };
}

const words = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s']/g, " ").split(/\s+/).filter(Boolean);

/** The first run of `n` words that `candidate` copies word for word from `source` (ignoring case and punctuation), or null. */
export function copiedRun(source: string, candidate: string, n = 6): string | null {
  const s = words(source), c = words(candidate);
  if (c.length < n || s.length < n) return null;
  const seen = new Set<string>();
  for (let i = 0; i + n <= s.length; i++) seen.add(s.slice(i, i + n).join(" "));
  for (let i = 0; i + n <= c.length; i++) { const g = c.slice(i, i + n).join(" "); if (seen.has(g)) return g; }
  return null;
}

/** Figures that would be a claim of a result: money amounts, percentages and multipliers such as "3x" or "10k". */
const FIGURE = /[£$€]\s?\d|\d\s?%|\b\d+(?:\.\d+)?\s?x\b|\b\d[\d,.]*\s?(?:k|m)\b/i;

/** What is wrong with a breakdown, in plain words. Empty means it can be shown and saved. */
export function breakdownProblems(b: Breakdown, source: { caption: string | null; transcript: string | null }, names: string[]): string[] {
  const out: string[] = [];
  if (!b.hook || !b.format || b.beats.length < 2 || b.why_it_worked.length < 1) out.push("the breakdown is incomplete (hook, format, beats and reasons are all needed)");
  if (b.ideas.length !== 3) out.push(`it needs exactly 3 usable ideas (it has ${b.ideas.length})`);
  const original = [source.caption, source.transcript].filter(Boolean).join("\n");
  const own = names.map((n) => n.toLowerCase()).filter((n) => n.length >= 3);
  b.ideas.forEach((i, k) => {
    const mine = `${i.idea} ${i.hook}`;
    const run = copiedRun(original, mine);
    if (run) out.push(`idea ${k + 1} copies wording from the original ("${run}"): rewrite it in new words`);
    if (FIGURE.test(mine)) out.push(`idea ${k + 1} states a figure (money, percentage or multiplier): remove it, results can only be claimed once they are real`);
    if (/@\w/.test(mine) || own.some((n) => mine.toLowerCase().includes(n))) out.push(`idea ${k + 1} names the creator or someone else: remove the name`);
    if (i.hook.split(/\s+/).length > 14) out.push(`idea ${k + 1}'s hook is longer than 14 words`);
  });
  return out;
}

/** Emails and phone numbers in a pasted transcript are masked before anything is sent to the AI. */
export function maskContact(t: string): string {
  return t.replace(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, "[email]").replace(/(?:\+?\d[\s().-]?){9,}\d/g, "[phone]");
}
