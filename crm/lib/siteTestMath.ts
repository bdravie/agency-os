// Pure maths for the public site's split tests (no files, no database, no network), so it can be tested on its own.
// The only inputs are anonymous counts per page version. A winner is never named before the rules in config/experiments.yaml are met.

export type VariantCounts = { id: string; visitors: number; clicks: number; booked: number };
export type TestRules = { minVisitors: number; minDays: number; threshold: number; metric: "booked" | "cta_click" };
export type VariantResult = VariantCounts & { rate: number | null; chanceBest: number | null; leader: boolean };
export type TestStatus = "no_data" | "too_early" | "keep_running" | "leader";
export type TestResult = { variants: VariantResult[]; status: TestStatus; leaderId: string | null; reason: string; days: number };

export const DEFAULT_RULES: TestRules = { minVisitors: 150, minDays: 14, threshold: 0.95, metric: "booked" };

const successes = (v: VariantCounts, metric: TestRules["metric"]) => (metric === "booked" ? v.booked : v.clicks);

/** Small deterministic random numbers, so the same counts always give the same answer. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const normal = (r: () => number) => Math.sqrt(-2 * Math.log(r() || 1e-12)) * Math.cos(2 * Math.PI * r());
/** Gamma(shape >= 1) sample (Marsaglia and Tsang). */
function gamma(shape: number, r: () => number): number {
  const d = shape - 1 / 3, c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x: number, v: number;
    do { x = normal(r); v = 1 + c * x; } while (v <= 0);
    v = v * v * v;
    const u = r();
    if (u < 1 - 0.0331 * x ** 4 || Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}
const beta = (a: number, b: number, r: () => number) => { const x = gamma(a, r), y = gamma(b, r); return x / (x + y); };

/** Chance (0 to 1) that each version has the highest true rate, from a Beta(1,1) prior and 20,000 draws. */
export function chanceBest(counts: VariantCounts[], metric: TestRules["metric"] = "booked", draws = 20000): number[] {
  if (counts.length === 0) return [];
  const r = rng(12345);
  const wins = counts.map(() => 0);
  for (let i = 0; i < draws; i++) {
    let best = -1, bestIdx = 0;
    counts.forEach((v, k) => {
      const s = Math.min(successes(v, metric), v.visitors);
      const p = beta(1 + s, 1 + v.visitors - s, r);
      if (p > best) { best = p; bestIdx = k; }
    });
    wins[bestIdx]++;
  }
  return wins.map((w) => w / draws);
}

/** Whole days between two ISO dates (start counts as day 1 once it has begun). */
export const daysRunning = (startedIso: string, nowIso: string) =>
  Math.max(0, Math.floor((Date.parse(nowIso) - Date.parse(startedIso)) / 86400000) + 1);

export function evaluateTest(counts: VariantCounts[], rules: TestRules, startedIso: string, nowIso: string): TestResult {
  const days = daysRunning(startedIso, nowIso);
  const total = counts.reduce((n, v) => n + v.visitors, 0);
  const noChance = counts.map((v) => ({ ...v, rate: v.visitors ? successes(v, rules.metric) / v.visitors : null, chanceBest: null as number | null, leader: false }));
  if (total === 0) return { variants: noChance, status: "no_data", leaderId: null, reason: "No visitors counted yet.", days };

  const chances = chanceBest(counts, rules.metric);
  const variants: VariantResult[] = noChance.map((v, i) => ({ ...v, chanceBest: chances[i] }));
  const top = variants.reduce((a, b) => ((b.chanceBest ?? 0) > (a.chanceBest ?? 0) ? b : a));

  const short = variants.filter((v) => v.visitors < rules.minVisitors);
  if (short.length) {
    const least = Math.min(...variants.map((v) => v.visitors));
    return { variants, status: "too_early", leaderId: null, days, reason: `Too early: every version needs ${rules.minVisitors} visitors; the smallest has ${least}.` };
  }
  if (days < rules.minDays) return { variants, status: "too_early", leaderId: null, days, reason: `Too early: the test has run ${days} of ${rules.minDays} days.` };
  if ((top.chanceBest ?? 0) >= rules.threshold) {
    return { variants: variants.map((v) => ({ ...v, leader: v.id === top.id })), status: "leader", leaderId: top.id, days, reason: `Version ${top.id} is best with a ${Math.round((top.chanceBest ?? 0) * 100)}% chance.` };
  }
  return { variants, status: "keep_running", leaderId: null, days, reason: `Not clear yet: the best version has a ${Math.round((top.chanceBest ?? 0) * 100)}% chance, and ${Math.round(rules.threshold * 100)}% is needed.` };
}
