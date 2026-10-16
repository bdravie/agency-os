import { verifyQuote } from "./transcript.ts";

// Cleans what the model returned: real quotes only, objections matched to your library, a sane follow-up date.
export type RawAnalysis = {
  summary?: string; pains?: { pain?: string; quote?: string | null }[]; budget_signals?: { signal?: string; quote?: string | null }[];
  objections?: { name?: string; quote?: string | null }[]; next_step?: string | null; follow_up_date?: string | null;
};
export type Analysis = {
  summary: string; pains: { pain: string; quote: string | null }[]; budget_signals: { signal: string; quote: string | null }[];
  objections: { name: string; quote: string | null; isNew: boolean }[]; next_step: string | null;
};

const clip = (s: unknown, n: number) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, n);
export const DEFAULT_FOLLOW_UP_DAYS = 3;

/** "2026-10-19" plus n days, in UTC so time zones can't shift the date. */
export function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
const isIso = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));

/** A follow-up date must not be before the call or more than a year after it. Anything else becomes the default, marked as assumed. */
export function followUpDate(modelDate: unknown, callDate: string): { date: string; assumed: boolean } {
  if (isIso(modelDate) && modelDate >= callDate && modelDate <= addDays(callDate, 365)) return { date: modelDate, assumed: false };
  return { date: addDays(callDate, DEFAULT_FOLLOW_UP_DAYS), assumed: true };
}

export function normaliseAnalysis(raw: RawAnalysis, transcript: string, library: string[], callDate: string) {
  const known = new Map(library.map((n) => [n.toLowerCase(), n]));
  const seen = new Set<string>();
  const objections: Analysis["objections"] = [];
  for (const o of raw.objections ?? []) {
    const name = clip(o.name, 80);
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    const canonical = known.get(name.toLowerCase());
    objections.push({ name: canonical ?? name, quote: verifyQuote(o.quote, transcript), isNew: !canonical });
    if (objections.length === 6) break;
  }
  const analysis: Analysis = {
    summary: clip(raw.summary, 700),
    pains: (raw.pains ?? []).slice(0, 5).map((p) => ({ pain: clip(p.pain, 220), quote: verifyQuote(p.quote, transcript) })).filter((p) => p.pain),
    budget_signals: (raw.budget_signals ?? []).slice(0, 4).map((b) => ({ signal: clip(b.signal, 220), quote: verifyQuote(b.quote, transcript) })).filter((b) => b.signal),
    objections, next_step: clip(raw.next_step, 220) || null,
  };
  const droppedQuotes = [...(raw.pains ?? []), ...(raw.budget_signals ?? []), ...(raw.objections ?? [])].filter((x) => x.quote).length
    - [...analysis.pains, ...analysis.budget_signals, ...analysis.objections].filter((x) => x.quote).length;
  return { analysis, followUp: followUpDate(raw.follow_up_date, callDate), droppedQuotes };
}
