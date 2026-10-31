// Pure helpers for the proposal fit analysis and the plan-and-price panel (no AI, no database), so they can be tested on their own.

export type Effect = "up" | "down" | "neutral";
export type FitAnalysis = {
  score: number;
  summary: string;
  factors: { factor: string; effect: Effect; note: string }[];
  benefits: string[];
  risks: string[];
  data_note: string | null;
};

export type Ease = "easy" | "medium" | "hard";
export type Milestone = { name: string; requirements: string[]; ease: Ease; hours_low: number; hours_high: number; why: string };
export type Plan = {
  milestones: Milestone[];
  assumptions: string[];
  questions: string[];
  data_note: string | null;
};

export type Rates = {
  hourly_rate_gbp: number;
  hours_per_day: number;
  min_project_gbp: number;
  contingency_pct: number;
  upwork_fee_pct: number;
  round_to_gbp: number;
  ease_multiplier: Record<Ease, number>;
};

export const DEFAULT_RATES: Rates = {
  hourly_rate_gbp: 45, hours_per_day: 6, min_project_gbp: 150, contingency_pct: 15, upwork_fee_pct: 10, round_to_gbp: 5,
  ease_multiplier: { easy: 1, medium: 1, hard: 1.25 },
};

const text = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
const list = (v: unknown, n: number, max: number) => (Array.isArray(v) ? v.map((x) => text(x, max)).filter(Boolean).slice(0, n) : []);
const positive = (v: unknown, fallback: number, min = 0) => (typeof v === "number" && Number.isFinite(v) && v > min ? v : fallback);

/** Rates from the YAML file, with any missing or nonsense value replaced by the default. */
export function normaliseRates(raw: any): Rates {
  const d = DEFAULT_RATES;
  const m = raw?.ease_multiplier ?? {};
  return {
    hourly_rate_gbp: positive(raw?.hourly_rate_gbp, d.hourly_rate_gbp),
    hours_per_day: positive(raw?.hours_per_day, d.hours_per_day),
    min_project_gbp: positive(raw?.min_project_gbp, d.min_project_gbp, -1),
    contingency_pct: positive(raw?.contingency_pct, d.contingency_pct, -1),
    upwork_fee_pct: positive(raw?.upwork_fee_pct, d.upwork_fee_pct, -1),
    round_to_gbp: positive(raw?.round_to_gbp, d.round_to_gbp),
    ease_multiplier: {
      easy: positive(m.easy, d.ease_multiplier.easy), medium: positive(m.medium, d.ease_multiplier.medium), hard: positive(m.hard, d.ease_multiplier.hard),
    },
  };
}

const effect = (v: unknown): Effect => (v === "up" || v === "down" ? v : "neutral");

/** Tidy the fit analysis the model returned: clamp the score, trim and cap every list. */
export function cleanFit(r: any): FitAnalysis {
  return {
    score: Math.max(1, Math.min(10, Math.round(Number(r?.score) || 1))),
    summary: text(r?.summary, 300),
    factors: (Array.isArray(r?.factors) ? r.factors : []).slice(0, 6)
      .map((f: any) => ({ factor: text(f?.factor, 60), effect: effect(f?.effect), note: text(f?.note, 220) }))
      .filter((f: { factor: string; note: string }) => f.factor && f.note),
    benefits: list(r?.benefits, 4, 200),
    risks: list(r?.risks, 4, 240),
    data_note: text(r?.data_note, 300) || null,
  };
}

export const fitProblems = (f: FitAnalysis): string[] => [
  !f.summary && "summary", f.factors.length < 3 && "factors", !f.benefits.length && "benefits", !f.risks.length && "risks",
].filter(Boolean) as string[];

const halfHours = (n: number) => Math.round(n * 2) / 2;

/** Tidy the plan the model returned: 1-8 milestones, sane hours (0.5-80, high never below low), known ease values. */
export function cleanPlan(r: any): Plan {
  const milestones = (Array.isArray(r?.milestones) ? r.milestones : []).map((m: any): Milestone => {
    const low = halfHours(Math.max(0.5, Math.min(80, Number(m?.hours_low) || 0.5)));
    const high = halfHours(Math.max(low, Math.min(80, Number(m?.hours_high) || low)));
    return {
      name: text(m?.name, 80), requirements: list(m?.requirements, 3, 160),
      ease: m?.ease === "easy" || m?.ease === "hard" ? m.ease : "medium", hours_low: low, hours_high: high, why: text(m?.why, 220),
    };
  }).filter((m: Milestone) => m.name).slice(0, 8);
  return { milestones, assumptions: list(r?.assumptions, 4, 200), questions: list(r?.questions, 3, 200), data_note: text(r?.data_note, 300) || null };
}

export const planProblems = (p: Plan): string[] => [p.milestones.length < 2 && "milestones"].filter(Boolean) as string[];

const roundUp = (n: number, to: number) => Math.ceil(n / to - 1e-9) * to;

export type PricedLine = { hours: number; days: number; price: number };
export type Pricing = {
  lines: PricedLine[];
  hours_low: number; hours_high: number; hours: number; days: number;
  subtotal: number; contingency: number; floor_applied: boolean;
  total: number; low: number; high: number;
  fee: number; take_home: number; effective_hourly: number;
};

/**
 * Price from hours and rates. A milestone costs mid-point hours x hourly rate x its ease multiplier.
 * Each line is rounded up to `round_to_gbp`; the contingency is added on top of their sum, the total never falls below the minimum project price,
 * and it is rounded up to `round_to_gbp`. low/high use the low/high hours with the same maths.
 */
export function priceMilestones(ms: Milestone[], rates: Rates): Pricing {
  const cost = (hours: (m: Milestone) => number) => ms.reduce((s, m) => s + hours(m) * rates.hourly_rate_gbp * rates.ease_multiplier[m.ease], 0);
  const withBuffer = (n: number) => Math.max(rates.min_project_gbp, roundUp(n * (1 + rates.contingency_pct / 100), rates.round_to_gbp));
  const mid = (m: Milestone) => (m.hours_low + m.hours_high) / 2;
  const lines = ms.map((m) => ({
    hours: mid(m), days: Math.round((mid(m) / rates.hours_per_day) * 10) / 10,
    price: roundUp(mid(m) * rates.hourly_rate_gbp * rates.ease_multiplier[m.ease], rates.round_to_gbp),
  }));
  const hours = ms.reduce((s, m) => s + mid(m), 0);
  const subtotal = lines.reduce((t, l) => t + l.price, 0); // the lines as shown, so the panel adds up
  const total = withBuffer(subtotal);
  const fee = Math.round(total * rates.upwork_fee_pct) / 100;
  const take_home = Math.round((total - fee) * 100) / 100;
  return {
    lines,
    hours_low: ms.reduce((s, m) => s + m.hours_low, 0), hours_high: ms.reduce((s, m) => s + m.hours_high, 0), hours,
    days: Math.round((hours / rates.hours_per_day) * 10) / 10,
    subtotal, contingency: Math.round((total - subtotal) * 100) / 100,
    floor_applied: roundUp(subtotal * (1 + rates.contingency_pct / 100), rates.round_to_gbp) < rates.min_project_gbp,
    total, low: withBuffer(cost((m) => m.hours_low)), high: withBuffer(cost((m) => m.hours_high)),
    fee, take_home, effective_hourly: hours ? Math.round((take_home / hours) * 100) / 100 : 0,
  };
}
