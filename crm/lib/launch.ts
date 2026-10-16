import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { revalidatePath } from "next/cache";
import { query } from "./db";
import { logActivity } from "./activity";
import { listNiches } from "./leadConfig";
import { apifyToken, getLimits, startRun, ApifyError } from "./apify";
import { apifySettings, perPlaceUsd, planRun } from "./apifyMath";

// The shared "start a search" code behind Lead Sourcer. Plain server module (no "use server"): the actions that call it check you are logged in first.
// Nothing here saves a company: searches only keep what they found, and you choose what to add.
export const ROOT = path.resolve(process.cwd(), "..");
export const STALE_MINUTES = 15;
const MAX_CH_RUN_MINUTES = 20;

/** The project's own Python (no PATH setup needed), falling back to uv. */
export function pythonCommand(args: string[]): { cmd: string; args: string[] } {
  const venv = path.join(ROOT, ".venv", "bin", "python");
  return existsSync(venv) ? { cmd: venv, args: ["-m", ...args] } : { cmd: "uv", args: ["run", "python", "-m", ...args] };
}

/** Never let a secret reach the screen or the database, even inside an error message. */
export const scrub = (text: string) => ["DATABASE_URL", "COMPANIES_HOUSE_API_KEY", "ANTHROPIC_API_KEY", "GOOGLE_PLACES_API_KEY", "SEARCH_API_KEY", "APIFY_TOKEN", "APP_PASSWORD", "SESSION_SECRET"]
  .reduce((t, k) => { const v = process.env[k]; return v && v.length > 6 ? t.split(v).join("[hidden]") : t; }, text).slice(-6000);

export const PLAIN_PLACE = /^[A-Za-z0-9 .,'&-]{2,60}$/;

// ---------- Companies House (free) ----------

export async function launchChSearch(o: { niche: string; location: string | null; limit: number; minAgeYears?: number }): Promise<{ id?: number; error?: string }> {
  if (!(await listNiches()).some((n) => n.key === o.niche)) return { error: "Choose a niche from the list." };
  if (o.location && !PLAIN_PLACE.test(o.location)) return { error: "Use a plain town, county or area name (letters, numbers and spaces)." };
  if (!process.env.COMPANIES_HOUSE_API_KEY?.trim()) return { error: "The server can't see COMPANIES_HOUSE_API_KEY (it is missing or empty). Put it in the .env file in the top-level folder as COMPANIES_HOUSE_API_KEY=yourkey, or set it as a Codespaces secret, then stop and restart the CRM." };
  const limit = Math.min(100, Math.max(10, Math.round(o.limit) || 50));
  await query(`UPDATE lead_searches SET status = 'failed', finished_at = now(), output = coalesce(output, '') || 'Timed out.' WHERE status = 'running' AND started_at < now() - make_interval(mins => $1)`, [MAX_CH_RUN_MINUTES]);
  const [busy] = await query(`SELECT 1 FROM lead_searches WHERE status = 'running'`);
  if (busy) return { error: "A Companies House search is already running. Wait for it to finish." };
  const [row] = await query<{ id: number }>(`INSERT INTO lead_searches (kind, niche, location, row_limit, dry_run) VALUES ('search',$1,$2,$3,false) RETURNING id`, [o.niche, o.location, limit]);
  const args = ["agency.companies_house", "--niche", o.niche, "--limit", String(limit), ...(o.location ? ["--location", o.location] : []),
    ...(o.minAgeYears !== undefined ? ["--min-age-years", String(Math.max(0, Math.min(50, Math.round(o.minAgeYears))))] : []), "--stage", String(row.id)];
  runChJob(Number(row.id), args);
  return { id: Number(row.id) };
}

/** Runs a Companies House job in the background and records what it printed. */
export function runChJob(searchId: number, args: string[]) {
  const { cmd, args: full } = pythonCommand(args);
  execFile(cmd, full, { cwd: ROOT, env: process.env, timeout: MAX_CH_RUN_MINUTES * 60_000, maxBuffer: 5_000_000 }, (err, stdout, stderr) => {
    const output = scrub(`${stdout}${err ? `\n${stderr || err.message}` : ""}`.trim());
    void query(`UPDATE lead_searches SET status = $2, output = $3, finished_at = now() WHERE id = $1`, [searchId, err ? "failed" : "done", output]).then(() => { revalidatePath("/sourcer"); });
  });
}

// ---------- Apify / Google Maps (credits) ----------

export type Budget = {
  configured: boolean; dailyCap: number; dailyUsed: number; dailyLeft: number; monthlyCap: number; monthlyUsed: number; monthlyLeft: number;
  perPlace: { withContacts: number; without: number }; maxPlacesNow: number; planUsd: number | null; running: boolean; minCap: number; blocked: string | null;
};

/** The real cost per place from the most recent finished run with the same contact setting (null if there is none yet). */
async function learnedPrice(contacts: boolean): Promise<number | null> {
  const [r] = await query<{ p: number | null }>(`SELECT (cost_usd / NULLIF(items, 0))::float8 AS p FROM apify_runs WHERE status = 'done' AND cost_usd IS NOT NULL AND items >= 3 AND contacts = $1 ORDER BY id DESC LIMIT 1`, [contacts]);
  return r?.p ?? null;
}

/** What has been spent (real cost where known, otherwise our estimate for that run) and what is left. */
export async function getBudget(): Promise<Budget> {
  const s = apifySettings();
  const [r] = await query<any>(`
    SELECT coalesce(sum(CASE WHEN cost_usd IS NOT NULL THEN cost_usd WHEN apify_run_id IS NULL AND status = 'failed' THEN 0 ELSE est_usd END) FILTER (WHERE started_at::date = current_date), 0)::float8 AS day,
           coalesce(sum(CASE WHEN cost_usd IS NOT NULL THEN cost_usd WHEN apify_run_id IS NULL AND status = 'failed' THEN 0 ELSE est_usd END) FILTER (WHERE date_trunc('month', started_at) = date_trunc('month', now())), 0)::float8 AS month,
           count(*) FILTER (WHERE status IN ('starting', 'running', 'processing') AND started_at > now() - make_interval(mins => ${STALE_MINUTES})) AS active
      FROM apify_runs`);
  const live = apifyToken() ? await getLimits() : null;
  const dailyLeft = Math.max(0, s.dailyUsd - r.day);
  const monthlyLeft = Math.max(0, Math.min(s.monthlyUsd - r.month, live ? live.maxMonthlyUsd - live.usedUsd : Infinity));
  const headroomUsd = live ? Math.max(0, live.maxMonthlyUsd - live.usedUsd) : null;
  const plan = planRun({ requested: s.maxPlaces, contacts: true, dailyLeft, monthlyLeft, s, learnedPerPlace: await learnedPrice(true), headroomUsd });
  return {
    configured: !!apifyToken(), dailyCap: s.dailyUsd, dailyUsed: r.day, dailyLeft, monthlyCap: s.monthlyUsd, monthlyUsed: Math.max(r.month, live?.usedUsd ?? 0), monthlyLeft,
    perPlace: { withContacts: perPlaceUsd(true, s), without: perPlaceUsd(false, s) }, maxPlacesNow: plan.ok ? plan.places : 0, planUsd: live?.maxMonthlyUsd ?? null, running: Number(r.active) > 0, minCap: s.minCapUsd, blocked: plan.ok ? null : plan.error,
  };
}

export type ApifyLaunch = { nicheKey: string; term: string; location: string; places: number; contacts: boolean; website: "allPlaces" | "withWebsite" | "withoutWebsite"; minStars?: "" | "four" | "fourAndHalf" };

/** Sizes the search to today's budget, starts it with Apify's spend cap, and records it. Returns the run id, or why it could not start. */
export async function launchApify(o: ApifyLaunch): Promise<{ id?: number; error?: string; note?: string }> {
  if (!apifyToken()) return { error: "The server can't see APIFY_TOKEN. Add it to the .env file in the top-level folder (or as a Codespaces secret) and restart the CRM." };
  if (!PLAIN_PLACE.test(o.term)) return { error: "Use a plain search phrase, e.g. roofer." };
  if (!PLAIN_PLACE.test(o.location)) return { error: "Enter a town or area, e.g. Leeds." };
  await query(`UPDATE apify_runs SET status = 'failed', error = 'Timed out', finished_at = now() WHERE status IN ('starting', 'running', 'processing') AND started_at < now() - make_interval(mins => $1)`, [STALE_MINUTES]);
  const [busy] = await query(`SELECT 1 FROM apify_runs WHERE status IN ('starting', 'running', 'processing')`);
  if (busy) return { error: "A Google Maps search is already running. Wait for it to finish." };

  const b = await getBudget(), s = apifySettings();
  const plan = planRun({ requested: o.places, contacts: o.contacts, dailyLeft: b.dailyLeft, monthlyLeft: b.monthlyLeft, s, learnedPerPlace: await learnedPrice(o.contacts), headroomUsd: b.planUsd === null ? null : Math.max(0, b.planUsd - b.monthlyUsed) });
  if (!plan.ok) return { error: plan.error };
  const [row] = await query<{ id: number }>(
    `INSERT INTO apify_runs (niche, query, location, max_places, contacts, website_filter, est_usd, max_charge_usd) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
    [o.nicheKey, o.term, o.location, plan.places, o.contacts, o.website, plan.estUsd, plan.maxChargeUsd]);
  const input: Record<string, unknown> = { searchStringsArray: [o.term], locationQuery: `${o.location}, UK`, maxCrawledPlacesPerSearch: plan.places, language: "en", countryCode: "gb", skipClosedPlaces: true, scrapeContacts: o.contacts };
  if (o.website !== "allPlaces") input.website = o.website;
  if (o.minStars) input.placeMinimumStars = o.minStars;
  try {
    const run = await startRun(input, { maxChargeUsd: plan.maxChargeUsd, timeoutSecs: 600 });
    await query(`UPDATE apify_runs SET apify_run_id = $2, dataset_id = $3, status = 'running' WHERE id = $1`, [row.id, run.id, run.defaultDatasetId ?? null]);
  } catch (e) {
    await query(`UPDATE apify_runs SET status = 'failed', error = $2, finished_at = now() WHERE id = $1`, [row.id, scrub(e instanceof Error ? e.message : String(e))]);
    return { error: e instanceof ApifyError ? e.message : "Couldn't start the search." };
  }
  await logActivity("apify_search_started", { channel: "apify", body: `${o.term} in ${o.location}: up to ${plan.places} places (about $${plan.estUsd.toFixed(3)}), safety cap $${plan.maxChargeUsd.toFixed(2)}` });
  return { id: Number(row.id), note: plan.limitedBy === "daily" || plan.limitedBy === "monthly" ? `Reduced to ${plan.places} places to stay inside your ${plan.limitedBy} budget.` : undefined };
}
