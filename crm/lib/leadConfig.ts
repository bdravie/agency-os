import { readFile } from "node:fs/promises";
import path from "node:path";
import { parse } from "yaml";
import { buildNicheTable, nicheStatus, STATUSES, type NicheStatus, type NicheTable } from "./nicheStatus";
import { NO_RULES, readRelevanceRules, type RelevanceRules } from "./nicheRelevance";
import { readCqcConfig, type CqcNiche } from "./cqcMath";
import { readSearchFirst, type Source } from "./sourcerFilters";

// Lead quality gates live in config/niches.yaml (defaults), never in code.
export async function leadSettings(): Promise<{ minEstRevenue: number }> {
  try {
    const y = parse(await readFile(path.join(path.resolve(process.cwd(), ".."), "config/niches.yaml"), "utf8"));
    return { minEstRevenue: Number(y?.defaults?.min_est_revenue_gbp ?? 50000) || 50000 };
  } catch {
    return { minEstRevenue: 50000 };
  }
}

/** Ranking tier from the fit score: A is worth a personal opening line first. */
export const fitTier = (score: number | null, filingOk: boolean | null): { label: string; tone: string; title: string } => {
  if (filingOk === false) return { label: "Skip", tone: "bad", title: "Filing problems at Companies House" };
  if (score === null || score === undefined) return { label: "–", tone: "neutral", title: "Not checked yet" };
  return score >= 55 ? { label: "A", tone: "good", title: `Fit score ${score}` } : score >= 35 ? { label: "B", tone: "warn", title: `Fit score ${score}` } : { label: "C", tone: "neutral", title: `Fit score ${score}` };
};

export const shortMoney = (n: number | null | undefined) => (n === null || n === undefined ? null : n >= 1_000_000 ? `£${(n / 1_000_000).toFixed(1)}m` : `£${Math.round(n / 1000)}k`);

/**
 * `rules`: the off-niche keywords (`name_includes`, `name_excludes` in config/niches.yaml; none for niches added in the CRM).
 * `searchFirst`: which sources the Lead Sourcer ticks first (`search_first`: a list, or one name; Companies House when not set).
 * `cqc`: how the niche is found on the CQC register (`cqc:` in niches.yaml), or null when CQC doesn't regulate it.
 */
export type NicheOption = { key: string; label: string; custom: boolean; sic: string[]; terms: string[]; status: NicheStatus; rules: RelevanceRules; searchFirst: Source[]; cqc: CqcNiche | null };

const readNichesYaml = async (): Promise<any> => {
  try { return parse(await readFile(path.join(path.resolve(process.cwd(), ".."), "config/niches.yaml"), "utf8")) ?? {}; } catch { return {}; }
};

// SELECT * so this still works before the niche status migration has run (the missing columns then read as parked).
async function customNicheRows(): Promise<any[]> {
  try { const { query } = await import("./db"); return await query<any>(`SELECT * FROM custom_niches ORDER BY label`); } catch { return []; }
}

/** The niche table (status, channels, platforms): config/niches.yaml plus the niches added in the CRM, read through nicheStatus.ts. */
export async function loadNicheTable(): Promise<NicheTable> {
  return buildNicheTable((await readNichesYaml())?.niches, await customNicheRows());
}

/** Niches that can be searched on Companies House: those in config/niches.yaml plus any added in the CRM, active first, then seeding, audience and parked. */
export async function listNiches(): Promise<NicheOption[]> {
  const y = await readNichesYaml();
  const rows = await customNicheRows();
  const table = buildNicheTable(y?.niches, rows);
  const rank = (k: string) => STATUSES.indexOf(nicheStatus(table, k));
  const fromYaml: NicheOption[] = Object.entries<any>(y?.niches ?? {})
    .filter(([, n]) => Array.isArray(n?.sic_codes) && n.sic_codes.length > 0)
    .map(([key, n]) => ({ key, label: table[key].label, custom: false, sic: n.sic_codes.map(String), terms: [...(Array.isArray(n.search_terms) ? n.search_terms : []), ...(Array.isArray(n.maps_keywords) ? n.maps_keywords : [])].map(String), status: table[key].status, rules: readRelevanceRules(n), searchFirst: readSearchFirst(n.search_first), cqc: readCqcConfig(n) }));
  const custom: NicheOption[] = rows.filter((r) => !fromYaml.some((n) => n.key === r.key))
    .map((r) => ({ key: r.key, label: r.label, custom: true, sic: r.sic_codes, terms: r.search_terms ?? [], status: nicheStatus(table, r.key), rules: NO_RULES, searchFirst: ["ch"], cqc: null }));
  return [...fromYaml, ...custom].sort((a, b) => rank(a.key) - rank(b.key) || Number(a.custom) - Number(b.custom) || a.label.localeCompare(b.label));
}
