import { containsContactDetails } from "./audit.ts";
import { unverifiedNumbers } from "./outcomeMath.ts";

// Pure checks on what the AI returned: keep only what is tied to real findings and real catalogue offers, clip lengths, and flag anything suspicious.
export type Suggestion = {
  title: string; automation: string; outcome: string; why: string; finding_ids: string[]; offer_name: string | null;
  kpi: string; pilot: string; risk: string; needs_dpa: boolean; confidence: "high" | "medium" | "low";
};
export type SuggestionResult = { business_summary: string; suggestions: Suggestion[]; opener: string | null; opener_finding_ids: string[]; questions: string[]; not_checked: string[] };

const clip = (s: unknown, n: number) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, n);
const list = (a: unknown, max: number, n: number) => (Array.isArray(a) ? a : []).map((x) => clip(x, n)).filter(Boolean).slice(0, max);

export function normaliseSuggestions(raw: any, o: { findingIds: string[]; offerNames: string[]; facts: string }): { result: SuggestionResult; warnings: string[] } {
  const warnings: string[] = [];
  const known = new Set(o.findingIds);
  const ids = (a: unknown) => [...new Set((Array.isArray(a) ? a : []).map((x) => String(x).toUpperCase().trim()).filter((x) => known.has(x)))];
  const suggestions: Suggestion[] = (Array.isArray(raw?.suggestions) ? raw.suggestions : []).slice(0, 3).map((s: any) => {
    const offer = o.offerNames.find((n) => n.toLowerCase() === clip(s?.offer_name, 120).toLowerCase()) ?? null;
    const finding_ids = ids(s?.finding_ids);
    const confidence = (["high", "medium", "low"].includes(s?.confidence) ? s.confidence : "low") as Suggestion["confidence"];
    const title = clip(s?.title, 80);
    if (finding_ids.length === 0) warnings.push(`“${title}” isn't tied to any finding, so treat it as a guess.`);
    return { title, automation: clip(s?.automation, 320), outcome: clip(s?.outcome, 260), why: clip(s?.why, 300), finding_ids, offer_name: offer,
      kpi: clip(s?.kpi, 110), pilot: clip(s?.pilot, 220), risk: clip(s?.risk, 200), needs_dpa: s?.needs_dpa === true, confidence: finding_ids.length === 0 ? "low" : confidence };
  }).filter((s: Suggestion) => s.title && s.automation);
  let opener: string | null = clip(raw?.opener, 300) || null;
  const opener_finding_ids = ids(raw?.opener_finding_ids);
  if (opener && opener_finding_ids.length === 0) { warnings.push("The suggested opening line wasn't tied to a finding, so it was dropped."); opener = null; }
  const result: SuggestionResult = { business_summary: clip(raw?.business_summary, 360), suggestions, opener, opener_finding_ids, questions: list(raw?.questions, 4, 160), not_checked: list(raw?.not_checked, 4, 160) };
  const all = JSON.stringify(result);
  if (containsContactDetails(all)) warnings.push("The draft contains what looks like an email address or phone number. Remove it before using any of it.");
  const bad = unverifiedNumbers(all.replace(/"F\d+"/g, ""), o.facts);
  if (bad.length) warnings.push(`These figures weren't in the research, so check them: ${bad.join(", ")}`);
  if (suggestions.length === 0) warnings.push("No usable suggestion came back. Try again, or run the research again first.");
  return { result, warnings };
}
