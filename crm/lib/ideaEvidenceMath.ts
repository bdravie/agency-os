// Pure helpers for making content ideas from evidence (no AI, no files, no database), so they can be tested on their own.
// Business names never reach the AI: the pipeline digest is built from generic, rule-made gap titles seen across several businesses,
// and every line is scrubbed against the names, domains and contacts in the CRM before it is used.
import { HOOK_TYPES, PILLARS } from "./contentMath.ts";
import { FIGURE } from "./breakdownMath.ts";

export type PainRow = { company_id: number; kind: string | null; area: string | null; title: string | null };
export type Pain = { area: string; title: string; companies: number };

/** Every name, trading name, domain, domain stem and contact name in the CRM that must never reach the AI (short or generic fragments are left out). */
export function bannedTerms(companies: { name?: string | null; trading_name?: string | null; domain?: string | null }[], contactNames: (string | null)[]): string[] {
  const out = new Set<string>();
  const add = (t: string | null | undefined) => { const v = (t ?? "").trim().toLowerCase(); if (v.length >= 4) out.add(v); };
  for (const c of companies) {
    for (const n of [c.name, c.trading_name]) {
      add(n);
      add(n?.replace(/\b(ltd|limited|llp|plc|uk)\b\.?/gi, "").replace(/\s+/g, " ").trim());
    }
    const d = (c.domain ?? "").toLowerCase().replace(/^www\./, "");
    add(d);
    add(d.split(".")[0]);
  }
  for (const n of contactNames) if (n && n.trim().split(/\s+/).length >= 2) add(n);
  return [...out];
}

export const mentionsAny = (text: string, terms: string[]): string | null => {
  const t = text.toLowerCase();
  return terms.find((x) => t.includes(x)) ?? null;
};

/**
 * The gaps found most often across different businesses: only gaps (not strengths or notes), only a gap seen at `minCompanies` or more different businesses
 * (so nothing specific to one business can qualify), and never a line that mentions a name, domain or contact in the CRM.
 */
export function anonymisedPains(rows: PainRow[], banned: string[], minCompanies = 2, limit = 6): Pain[] {
  const by = new Map<string, { area: string; title: string; companies: Set<number> }>();
  for (const r of rows) {
    if (r.kind !== "gap" || !r.title || !r.area) continue;
    if (mentionsAny(`${r.area} ${r.title}`, banned)) continue;
    const key = `${r.area}||${r.title}`;
    const e = by.get(key) ?? { area: r.area, title: r.title, companies: new Set<number>() };
    e.companies.add(r.company_id);
    by.set(key, e);
  }
  return [...by.values()].map((e) => ({ area: e.area, title: e.title, companies: e.companies.size })).filter((p) => p.companies >= minCompanies)
    .sort((a, b) => b.companies - a.companies || a.title.localeCompare(b.title)).slice(0, limit);
}

export type Evidence = {
  winners: { hook: string; platform: string; x: number }[];
  outliers: { id: number; hookType: string | null; format: string; beats: string[]; why: string }[];
  trends: { id: number; title: string; detail: string | null }[];
  pains: Pain[];
};

/** The evidence as numbered lines the AI can cite (W = your best posts, O = outlier structures, T = trends, P = pains). Any line that mentions a banned term is dropped, and the whole thing is cut to fit. */
export function evidenceDigest(e: Evidence, banned: string[], maxChars = 6000): string {
  const clean = (lines: string[]) => lines.filter((l) => !mentionsAny(l, banned));
  const sections: [string, string[]][] = [
    ["YOUR BEST POSTS (hooks that beat your usual):", clean(e.winners.map((w, i) => `W${i + 1}: "${w.hook}" on ${w.platform}, ${w.x}× your usual`))],
    ["OUTLIER STRUCTURES (from creators you follow; borrow the shape, never the words):", clean(e.outliers.map((o) => `O${o.id}: ${o.hookType ?? "other"} hook, ${o.format}. Steps: ${o.beats.slice(0, 3).join(" > ")}. May work because: ${o.why}`))],
    ["TRENDS YOU NOTED:", clean(e.trends.map((t) => `T${t.id}: ${t.title}${t.detail ? ` (${t.detail})` : ""}`))],
    ["PATTERNS SEEN ACROSS MANY BUSINESSES YOU HAVE RESEARCHED (never about one business):", clean(e.pains.map((p, i) => `P${i + 1}: ${p.area}: ${p.title} (seen at ${p.companies} businesses)`))],
  ];
  let out = sections.filter(([, l]) => l.length).map(([h, l]) => `${h}\n${l.join("\n")}`).join("\n\n");
  while (out.length > maxChars) {
    const longest = sections.reduce((a, b) => (b[1].length > a[1].length ? b : a));
    if (!longest[1].length) break;
    longest[1].pop();
    out = sections.filter(([, l]) => l.length).map(([h, l]) => `${h}\n${l.join("\n")}`).join("\n\n");
  }
  return out;
}

/** How many ideas of each pillar for a batch of `n`, following the weekly mix in the video guide (2 show the build : 1 build in public : 1 teach : 1 niche pain), by largest remainder. */
export function pillarMix(n: number): Record<string, number> {
  const weights = [2, 1, 1, 1];
  const total = weights.reduce((a, b) => a + b, 0);
  const raw = weights.map((w) => (n * w) / total);
  const base = raw.map(Math.floor);
  let left = n - base.reduce((a, b) => a + b, 0);
  raw.map((r, i) => [r - Math.floor(r), i] as const).sort((a, b) => b[0] - a[0] || a[1] - b[1]).forEach(([, i]) => { if (left > 0) { base[i]++; left--; } });
  return Object.fromEntries(PILLARS.map((p, i) => [p, base[i]]));
}

export type NewIdea = { idea: string; hook: string; pillar: string; hook_type: string; niche: string; source: string; source_ref: string | null };
export type EvidenceIds = { trends: Set<number>; outliers: Set<number>; pains: number; winners: number };

/**
 * Tidy the ideas the AI returned. Pillar, hook type and niche must be known (a fixed niche overrides the AI's choice). An idea's cited source is kept only if the
 * item exists in the evidence that was supplied, otherwise it is just "generated". Figures (money, percentages, multipliers) and duplicates of ideas you already have are dropped.
 */
export function cleanGenerated(raw: any, niches: string[], ids: EvidenceIds, existing: string[], fixedNiche: string | null): { ideas: NewIdea[]; dropped: number } {
  const seen = new Set(existing.map((e) => e.trim().toLowerCase()));
  let dropped = 0;
  const ideas: NewIdea[] = [];
  for (const i of Array.isArray(raw?.ideas) ? raw.ideas : []) {
    const idea = typeof i?.idea === "string" ? i.idea.replace(/\s+/g, " ").trim().slice(0, 300) : "";
    const hook = typeof i?.hook === "string" ? i.hook.replace(/\s+/g, " ").trim().slice(0, 160) : "";
    const niche = fixedNiche ?? String(i?.niche ?? "");
    const ok = idea && hook && (PILLARS as readonly string[]).includes(i?.pillar) && (HOOK_TYPES as readonly string[]).includes(i?.hook_type) && niches.includes(niche) && !FIGURE.test(`${idea} ${hook}`) && !seen.has(idea.toLowerCase());
    if (!ok) { dropped++; continue; }
    seen.add(idea.toLowerCase());
    const kind = i?.based_on?.kind, ref = String(i?.based_on?.ref ?? "").replace(/^[A-Za-z]/, "");
    let source = "generated", source_ref: string | null = null;
    if (kind === "trend" && ids.trends.has(Number(ref))) { source = "trend"; source_ref = `trend:${Number(ref)}`; }
    else if (kind === "outlier" && ids.outliers.has(Number(ref))) { source = "outlier"; source_ref = `creator_post:${Number(ref)}`; }
    else if (kind === "pipeline" && Number(ref) >= 1 && Number(ref) <= ids.pains) { source = "pipeline"; source_ref = `pain:${Number(ref)}`; }
    ideas.push({ idea, hook, pillar: i.pillar, hook_type: i.hook_type, niche, source, source_ref });
  }
  return { ideas, dropped };
}

/** Scores from the AI keyed by the idea's position; anything missing or out of range stays unscored. */
export function cleanScores(raw: any, count: number): ({ score: number; reason: string } | null)[] {
  const out: ({ score: number; reason: string } | null)[] = Array(count).fill(null);
  for (const s of Array.isArray(raw?.scores) ? raw.scores : []) {
    const i = Number(s?.index), score = Math.round(Number(s?.score));
    if (Number.isInteger(i) && i >= 0 && i < count && score >= 1 && score <= 10) out[i] = { score, reason: String(s?.reason ?? "").replace(/\s+/g, " ").trim().slice(0, 200) };
  }
  return out;
}

/** An idea scoring below 5 is saved already archived (shown with "Show archived and low scores"). An idea with no score is kept. */
export const scoredLow = (score: number | null): boolean => score !== null && score < 5;

export type PipelineFacts = { niche: string; researched: number; gaps: { area: string; title: string; withGap: number }[] };

/** What is wrong with the ideas written from one deal's research: a name, an @, a money figure, or a number that was not supplied as a fact. */
export function pipelineProblems(ideas: { idea: string; hook: string }[], banned: string[], facts: string): string[] {
  const out: string[] = [];
  if (ideas.length !== 3) out.push(`it needs exactly 3 ideas (it has ${ideas.length})`);
  ideas.forEach((i, k) => {
    const text = `${i.idea} ${i.hook}`;
    const name = mentionsAny(text, banned);
    if (name) out.push(`idea ${k + 1} mentions "${name}", which is a business or person: remove it, only describe the pattern`);
    if (/@\w/.test(text)) out.push(`idea ${k + 1} contains an @ name`);
    if (FIGURE.test(text)) out.push(`idea ${k + 1} states a money amount, percentage or multiplier`);
    const nums = text.match(/\d[\d,]*(?:\.\d+)?/g) ?? [];
    const allowed = new Set((facts.match(/\d[\d,]*(?:\.\d+)?/g) ?? []).map((n) => Number(n.replace(/,/g, ""))));
    const bad = nums.filter((n) => !allowed.has(Number(n.replace(/,/g, ""))));
    if (bad.length) out.push(`idea ${k + 1} uses a number that was not supplied (${bad.join(", ")}): only use the counts you were given`);
  });
  return out;
}
