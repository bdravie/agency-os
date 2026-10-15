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

/** Niches that can be searched on Companies House (they have SIC codes in config/niches.yaml). */
export async function listNiches(): Promise<{ key: string; label: string }[]> {
  try {
    const y = parse(await readFile(path.join(path.resolve(process.cwd(), ".."), "config/niches.yaml"), "utf8"));
    const focus: string[] = y?.defaults?.focus_niches ?? [];
    return Object.entries<any>(y?.niches ?? {})
      .filter(([, n]) => Array.isArray(n?.sic_codes) && n.sic_codes.length > 0)
      .map(([key]) => ({ key, label: key.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase()) }))
      .sort((a, b) => Number(focus.includes(b.key)) - Number(focus.includes(a.key)) || a.label.localeCompare(b.label));
  } catch { return []; }
}
