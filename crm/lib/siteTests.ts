import { readFile } from "node:fs/promises";
import path from "node:path";
import { parse } from "yaml";
import { demoMode, query } from "./db";
import { DEFAULT_RULES, evaluateTest, type TestResult, type TestRules, type VariantCounts } from "./siteTestMath";

const ROOT = path.resolve(process.cwd(), "..");

export type Experiment = { id: string; status: string; started: string; hypothesis: string; rules: TestRules; variants: { id: string; weight: number; angle: string }[] };
export type ExperimentView = { experiment: Experiment; result: TestResult; fetchedAt: string | null };

async function angleOf(id: string) {
  try { return String(JSON.parse(await readFile(path.join(ROOT, `site/src/content/${id}.json`), "utf8")).angle ?? ""); } catch { return ""; }
}

/** config/experiments.yaml with defaults filled in. Nothing about a test is hard-coded in the app. */
export async function loadExperiments(): Promise<Experiment[]> {
  const raw = parse(await readFile(path.join(ROOT, "config/experiments.yaml"), "utf8").catch(() => "")) ?? {};
  const d = raw.defaults ?? {};
  const rules: TestRules = {
    minVisitors: Number(d.min_visitors_per_variant) > 0 ? Number(d.min_visitors_per_variant) : DEFAULT_RULES.minVisitors,
    minDays: Number(d.min_days) > 0 ? Number(d.min_days) : DEFAULT_RULES.minDays,
    threshold: Number(d.decision_threshold) > 0 && Number(d.decision_threshold) < 1 ? Number(d.decision_threshold) : DEFAULT_RULES.threshold,
    metric: d.metric === "cta_click" ? "cta_click" : "booked",
  };
  const list = Array.isArray(raw.experiments) ? raw.experiments : [];
  return Promise.all(list.map(async (e: any) => ({
    id: String(e.id), status: String(e.status), started: String(e.started), hypothesis: String(e.hypothesis ?? ""), rules,
    variants: await Promise.all((e.variants ?? []).map(async (v: any) => ({ id: String(v.id), weight: Number(v.weight), angle: await angleOf(String(v.id)) }))),
  })));
}

const DEMO: Record<string, [number, number, number]> = { a: [212, 31, 6], b: [205, 44, 11], c: [198, 27, 4] };

/** The saved snapshot for each experiment, judged by the rules. Demo mode shows made-up numbers. */
export async function loadSiteTests(): Promise<{ views: ExperimentView[]; needsMigration: boolean }> {
  const experiments = await loadExperiments();
  const now = new Date().toISOString();
  let rows: { experiment: string; variant: string; visitors: number; clicks: number; booked: number; fetched_at: string }[] = [];
  let needsMigration = false;
  if (!demoMode()) {
    try { rows = await query(`SELECT experiment, variant, visitors, clicks, booked, fetched_at::text FROM site_experiment_stats`); }
    catch { needsMigration = true; }
  }
  const views = experiments.map((experiment) => {
    const counts: VariantCounts[] = experiment.variants.map((v) => {
      if (demoMode()) { const [visitors, clicks, booked] = DEMO[v.id] ?? [0, 0, 0]; return { id: v.id, visitors, clicks, booked }; }
      const r = rows.find((x) => x.experiment === experiment.id && x.variant === v.id);
      return { id: v.id, visitors: r?.visitors ?? 0, clicks: r?.clicks ?? 0, booked: r?.booked ?? 0 };
    });
    const fetchedAt = demoMode() ? now : rows.find((x) => x.experiment === experiment.id)?.fetched_at ?? null;
    const started = demoMode() ? new Date(Date.now() - 20 * 86400000).toISOString().slice(0, 10) : experiment.started;
    return { experiment, result: evaluateTest(counts, experiment.rules, started, now), fetchedAt };
  });
  return { views, needsMigration };
}

/** Pulls the counts from the public site (needs SITE_URL and SITE_STATS_TOKEN) and replaces the saved snapshot. */
export async function refreshSiteStats(): Promise<{ ok: true } | { ok: false; error: string }> {
  if (demoMode()) return { ok: false, error: "Demo mode shows made-up numbers, so there is nothing to fetch." };
  const base = (process.env.SITE_URL ?? "").replace(/\/$/, "");
  const token = process.env.SITE_STATS_TOKEN ?? "";
  if (!/^https:\/\//.test(base) || token.length < 24) return { ok: false, error: "Set SITE_URL (https) and SITE_STATS_TOKEN (24+ characters) in .env first." };
  let body: { experiments?: { id: string; variants: { id: string; visitors: number; clicks: number; scroll75: number; booked: number }[] }[] };
  try {
    const res = await fetch(`${base}/api/stats`, { headers: { authorization: `Bearer ${token}` }, cache: "no-store", signal: AbortSignal.timeout(10000) });
    if (res.status === 401) return { ok: false, error: "The site refused the token. Check SITE_STATS_TOKEN matches the Cloudflare secret." };
    if (!res.ok) return { ok: false, error: `The site answered ${res.status}.` };
    body = await res.json();
  } catch (err) { return { ok: false, error: `Could not reach the site: ${err instanceof Error ? err.message : String(err)}` }; }
  for (const e of body.experiments ?? []) for (const v of e.variants) {
    const n = (x: unknown) => Math.max(0, Math.floor(Number(x) || 0));
    await query(
      `INSERT INTO site_experiment_stats (experiment, variant, visitors, clicks, scroll75, booked, fetched_at) VALUES ($1,$2,$3,$4,$5,$6, now())
       ON CONFLICT (experiment, variant) DO UPDATE SET visitors = EXCLUDED.visitors, clicks = EXCLUDED.clicks, scroll75 = EXCLUDED.scroll75, booked = EXCLUDED.booked, fetched_at = now()`,
      [e.id, v.id, n(v.visitors), n(v.clicks), n(v.scroll75), n(v.booked)],
    );
  }
  return { ok: true };
}
