import { readFile } from "node:fs/promises";
import path from "node:path";
import { parse } from "yaml";

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

export type NicheOption = { key: string; label: string; custom: boolean; sic: string[] };

/** Niches that can be searched on Companies House: those in config/niches.yaml plus any added in the CRM. */
export async function listNiches(): Promise<NicheOption[]> {
  let y: any = {};
  try { y = parse(await readFile(path.join(path.resolve(process.cwd(), ".."), "config/niches.yaml"), "utf8")); } catch {}
  const focus: string[] = y?.defaults?.focus_niches ?? [];
  const label = (key: string) => key.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
  const fromYaml: NicheOption[] = Object.entries<any>(y?.niches ?? {})
    .filter(([, n]) => Array.isArray(n?.sic_codes) && n.sic_codes.length > 0)
    .map(([key, n]) => ({ key, label: label(key), custom: false, sic: n.sic_codes.map(String) }))
    .sort((a, b) => Number(focus.includes(b.key)) - Number(focus.includes(a.key)) || a.label.localeCompare(b.label));
  let custom: NicheOption[] = [];
  try {
    const { query } = await import("./db");
    custom = (await query<any>(`SELECT key, label, sic_codes FROM custom_niches ORDER BY label`)).filter((r) => !fromYaml.some((n) => n.key === r.key)).map((r) => ({ key: r.key, label: r.label, custom: true, sic: r.sic_codes }));
  } catch {}
  return [...fromYaml, ...custom];
}
