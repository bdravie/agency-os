import { readFile } from "node:fs/promises";
import path from "node:path";
import { parse } from "yaml";
import { query } from "./db";
import { askStructured, suggestModel } from "./llm";
import { normaliseSuggestions, type SuggestionResult } from "./offerSuggestNormalise";
import type { Research } from "./research";

// Turns the research snapshot into 1-3 offer ideas. The model only words things: every claim must point at a finding id supplied here,
// and anything it adds that was not in the facts is flagged. Runs only when you click, within a daily cap.
const S = { type: "string" } as const;
const SCHEMA = {
  type: "object", required: ["business_summary", "suggestions", "opener", "opener_finding_ids", "questions", "not_checked"],
  properties: {
    business_summary: S,
    suggestions: { type: "array", items: { type: "object", required: ["title", "automation", "outcome", "why", "finding_ids", "offer_name", "kpi", "pilot", "risk", "needs_dpa", "confidence"], properties: {
      title: S, automation: S, outcome: S, why: S, finding_ids: { type: "array", items: S }, offer_name: { type: ["string", "null"] }, kpi: S, pilot: S, risk: S, needs_dpa: { type: "boolean" }, confidence: { type: "string", enum: ["high", "medium", "low"] } } } },
    opener: { type: ["string", "null"] }, opener_finding_ids: { type: "array", items: S }, questions: { type: "array", items: S }, not_checked: { type: "array", items: S },
  },
} as const;

async function nichePitch(niche: string | null): Promise<string | null> {
  if (!niche) return null;
  try {
    const y: any = parse(await readFile(path.join(path.resolve(process.cwd(), ".."), "config/niches.yaml"), "utf8"));
    if (y?.niches?.[niche]?.offer) return String(y.niches[niche].offer);
  } catch { /* fall through */ }
  try { const [r] = await query<{ offer: string | null }>(`SELECT offer FROM custom_niches WHERE key = $1`, [niche]); return r?.offer ?? null; } catch { return null; }
}

const band = (n: number | null) => (n === null ? null : n >= 1_000_000 ? `about £${(n / 1_000_000).toFixed(1)}m` : `about £${Math.round(n / 1000)}k`);

export async function buildFacts(companyId: number, r: Research): Promise<{ text: string; offerNames: string[]; findingIds: string[] }> {
  const [c] = await query<any>(`SELECT name, niche, postcode, company_type, to_char(incorporated_on, 'YYYY') AS inc, accounts_type, employees, est_revenue_gbp::float AS est, fit_notes FROM companies WHERE id = $1`, [companyId]);
  const offers = await query<{ name: string; outcome: string | null; niche: string | null }>(`SELECT name, outcome, niche FROM offers WHERE active ORDER BY sort_order, id`);
  const pitch = await nichePitch(c.niche);
  const s = r.site;
  const lines = [
    `COMPANY: ${c.name}${c.niche ? ` (niche: ${String(c.niche).replace(/_/g, " ")})` : ""}${c.postcode ? `, area ${String(c.postcode).split(" ")[0]}` : ""}`,
    `COMPANIES HOUSE CONTEXT: ${[c.company_type && `type ${c.company_type}`, c.inc && `incorporated ${c.inc}`, c.accounts_type && `accounts type ${c.accounts_type}`, c.employees != null && `${c.employees} employees filed`, band(c.est) && `estimated revenue ${band(c.est)}`].filter(Boolean).join("; ") || "nothing useful"}`,
    s ? `WEBSITE (${r.domain}): title “${s.title ?? "none"}”; description “${s.description ?? "none"}”; headings: ${[...s.h1, ...s.h2].slice(0, 10).map((h) => `“${h}”`).join(", ") || "none"}; ${s.words} words on the home page; calls to action seen: ${s.ctas.join(", ") || "none"}; pages read: ${s.pagesRead.filter((p) => p.ok).map((p) => p.path).join(", ")}`
      : `WEBSITE: ${r.domain ? "could not be read" : "none saved"}`,
    `FINDINGS (cite these ids):\n${r.findings.map((f) => `${f.id} [${f.kind}, ${f.severity}, ${f.area}] ${f.title}: ${f.detail} (evidence: ${f.evidence})`).join("\n") || "none"}`,
    r.web && r.web.length ? `WEB SEARCH SNIPPETS (public pages that mention them):\n${r.web.map((h) => `- ${h.host}: ${h.title}${h.snippet ? ` — ${h.snippet}` : ""}`).join("\n")}` : "WEB SEARCH: not run",
    `WHAT COULD NOT BE CHECKED: ${r.limits.join(" ")}`,
    pitch ? `THE CONSULTANT'S USUAL PITCH FOR THIS NICHE: ${pitch}` : "",
    `OFFER CATALOGUE (offer_name must be one of these exactly, or null):\n${offers.map((o) => `- ${o.name}: ${o.outcome ?? ""}`).join("\n")}`,
  ].filter(Boolean);
  return { text: lines.join("\n\n"), offerNames: offers.map((o) => o.name), findingIds: r.findings.map((f) => f.id) };
}

export async function suggestOffers(companyId: number, r: Research): Promise<{ result: SuggestionResult; model: string; warnings: string[] }> {
  const rules = await readFile(path.join(path.resolve(process.cwd(), ".."), "prompts", "offer-suggestion.md"), "utf8");
  const facts = await buildFacts(companyId, r);
  const model = suggestModel();
  const raw = await askStructured<unknown>(`${rules}\n\n${facts.text}`, SCHEMA as never, model, 4000);
  const { result, warnings } = normaliseSuggestions(raw, { findingIds: facts.findingIds, offerNames: facts.offerNames, facts: facts.text });
  return { result, model, warnings };
}
