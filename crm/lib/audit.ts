// Audit scoring. Pure functions (no database, no AI): every number in an audit is calculated here.
//
//   hours saved per week = hours per week x automation share (a planning assumption, set per audit)
//   value                = revenue impact weight x (1 + error rate)         errors cost rework, so they raise the value
//   ease factor          = ease / 5                                           ease is your 1-5 judgement, defaulted from frequency
//   sensitivity factor   = none 1.0, personal 0.6, special category 0.25      sensitive data is penalised
//   score                = hours saved x value x ease factor x sensitivity factor
//   annual saving        = hours saved per week x hourly rate x 46 working weeks

export const FREQUENCIES = [
  { code: "daily", label: "Daily" }, { code: "weekly", label: "Weekly" }, { code: "fortnightly", label: "Fortnightly" },
  { code: "monthly", label: "Monthly" }, { code: "quarterly", label: "Quarterly" }, { code: "ad_hoc", label: "Ad hoc" },
] as const;
export const IMPACTS = [{ code: "low", label: "Low" }, { code: "medium", label: "Medium" }, { code: "high", label: "High" }] as const;
export const SENSITIVITIES = [
  { code: "none", label: "None" }, { code: "personal", label: "Personal data" }, { code: "special_category", label: "Special category" },
] as const;

export type Frequency = (typeof FREQUENCIES)[number]["code"];
export type Impact = (typeof IMPACTS)[number]["code"];
export type Sensitivity = (typeof SENSITIVITIES)[number]["code"];

export const label = (list: readonly { code: string; label: string }[], code: string) => list.find((x) => x.code === code)?.label ?? code;

export const IMPACT_WEIGHT: Record<Impact, number> = { low: 1, medium: 2, high: 3 };
export const SENSITIVITY_FACTOR: Record<Sensitivity, number> = { none: 1, personal: 0.6, special_category: 0.25 };
// Regular, frequent tasks are usually more standardised, so they start easier to automate. Override with your own rating.
export const DEFAULT_EASE: Record<Frequency, number> = { daily: 4, weekly: 4, fortnightly: 3, monthly: 3, quarterly: 2, ad_hoc: 2 };
export const WORKING_WEEKS = 46;

export type AuditTask = {
  id?: number; name: string; performed_by?: string | null; hours_per_week: number; frequency: Frequency; error_rate_pct: number;
  revenue_impact: Impact; data_sensitivity: Sensitivity; ease?: number | null; notes?: string | null;
};
export type Params = { automationShare: number; hourlyRate: number };

export type Scored = AuditTask & {
  ease_used: number; hoursSavedWeek: number; value: number; easeFactor: number; sensitivityFactor: number;
  score: number; annualGbp: number; eligible: boolean; flags: string[]; rank: number; top: boolean;
};

const r2 = (n: number) => Math.round(n * 100) / 100;

export function scoreTask(t: AuditTask, p: Params): Omit<Scored, "rank" | "top"> {
  const ease = t.ease ?? DEFAULT_EASE[t.frequency];
  const hoursSavedWeek = r2(t.hours_per_week * p.automationShare);
  const value = r2(IMPACT_WEIGHT[t.revenue_impact] * (1 + t.error_rate_pct / 100));
  const easeFactor = ease / 5;
  const sensitivityFactor = SENSITIVITY_FACTOR[t.data_sensitivity];
  const flags: string[] = [];
  if (t.data_sensitivity === "special_category") flags.push("Special-category data: needs a data protection impact assessment and a processing agreement before any build (outside phase 1).");
  else if (t.data_sensitivity === "personal") flags.push("Involves personal data: needs a data processing agreement before any build.");
  if (t.error_rate_pct >= 10) flags.push("High error rate: automating it should also cut rework.");
  return {
    ...t, ease_used: ease, hoursSavedWeek, value, easeFactor, sensitivityFactor,
    score: r2(hoursSavedWeek * value * easeFactor * sensitivityFactor),
    annualGbp: Math.round(hoursSavedWeek * p.hourlyRate * WORKING_WEEKS),
    eligible: t.data_sensitivity !== "special_category", flags,
  };
}

/** Highest score first; ties go to the task with more hours, then by name so the order is stable. The top three are the best ELIGIBLE tasks. */
export function rankTasks(tasks: AuditTask[], p: Params, topN = 3): Scored[] {
  const scored = tasks.filter((t) => t.hours_per_week > 0).map((t) => scoreTask(t, p))
    .sort((a, b) => b.score - a.score || b.hours_per_week - a.hours_per_week || a.name.localeCompare(b.name));
  let picked = 0;
  return scored.map((t, i) => ({ ...t, rank: i + 1, top: t.eligible && picked++ < topN }));
}

export function summarise(ranked: Scored[]) {
  const top = ranked.filter((t) => t.top);
  return {
    topHoursWeek: r2(top.reduce((s, t) => s + t.hoursSavedWeek, 0)),
    topAnnualGbp: top.reduce((s, t) => s + t.annualGbp, 0),
    allHoursWeek: r2(ranked.reduce((s, t) => s + t.hoursSavedWeek, 0)),
    taskHoursWeek: r2(ranked.reduce((s, t) => s + t.hours_per_week, 0)),
    held: ranked.filter((t) => !t.eligible),
  };
}

/** The intake must not hold personal data about individuals: refuse email addresses and phone numbers in free text. */
export function containsContactDetails(text: string | null | undefined): boolean {
  if (!text) return false;
  return /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(text) || /(?:\+44\s?\(?0?\)?\s?|\b0)\d(?:[\s-]?\d){8,10}\b/.test(text);
}

/** Figures in drafted text that were not supplied: a guard against the model inventing numbers. */
export function unverifiedFigures(text: string, allowed: string[]): string[] {
  const norm = (f: string) => f.toLowerCase().replace(/[£,\s]/g, "").replace(/(hours?|hrs?|h)$/, "");
  const ok = new Set(allowed.map(norm));
  const found = text.match(/£\s?\d[\d,]*(?:\.\d+)?k?|\b\d[\d,]*(?:\.\d+)?\s?(?:hours?|hrs?|h)\b/gi) ?? [];
  return [...new Set(found.filter((f) => !ok.has(norm(f))))];
}
