"use server";

import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { revalidatePath } from "next/cache";
import { query, tx } from "./db";
import { requireLogin } from "./auth";
import { logActivity } from "./activity";
import { DEFAULT_CONSENT_BASIS, classifyCompany, normalisePhone } from "./compliance";
import { searchByName } from "./companiesHouse";
import { listNiches } from "./leadConfig";
import { normaliseSocial } from "./contact";
import { apifyToken, getItems, getLimits, getRun, startRun, abortRun, ApifyError } from "./apify";
import { apifySettings, parsePlace, planRun, perPlaceUsd, matchCompanyHouse, priorityScore, tidyName, type Eligibility } from "./apifyMath";

// Google Maps lead search through Apify. It spends credits, so: only on click, one run at a time, a hard spend cap sent to Apify with every run,
// and daily and monthly limits worked out from what was really spent. Nothing reaches the companies table until you choose and click Add.
const ROOT = path.resolve(process.cwd(), "..");
const STALE_MINUTES = 15;
const scrub = (t: string) => { const k = apifyToken(); return k.length > 6 ? t.split(k).join("[hidden]") : t; };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export type Budget = {
  configured: boolean; dailyCap: number; dailyUsed: number; dailyLeft: number; monthlyCap: number; monthlyUsed: number; monthlyLeft: number;
  perPlace: { withContacts: number; without: number }; maxPlacesNow: number; planUsd: number | null; running: boolean;
};

/** What has been spent (real cost where known, otherwise the cap the run was given) and what is left. */
export async function apifyBudgetAction(): Promise<Budget> {
  await requireLogin();
  const s = apifySettings();
  const [r] = await query<any>(`
    SELECT coalesce(sum(CASE WHEN cost_usd IS NOT NULL THEN cost_usd WHEN apify_run_id IS NULL AND status = 'failed' THEN 0 ELSE max_charge_usd END) FILTER (WHERE started_at::date = current_date), 0)::float8 AS day,
           coalesce(sum(CASE WHEN cost_usd IS NOT NULL THEN cost_usd WHEN apify_run_id IS NULL AND status = 'failed' THEN 0 ELSE max_charge_usd END) FILTER (WHERE date_trunc('month', started_at) = date_trunc('month', now())), 0)::float8 AS month,
           count(*) FILTER (WHERE status IN ('starting', 'running', 'processing') AND started_at > now() - make_interval(mins => ${STALE_MINUTES})) AS active
      FROM apify_runs`);
  const live = apifyToken() ? await getLimits() : null;
  const dailyLeft = Math.max(0, s.dailyUsd - r.day);
  const monthlyLeft = Math.max(0, Math.min(s.monthlyUsd - r.month, live ? live.maxMonthlyUsd - live.usedUsd : Infinity));
  const plan = planRun({ requested: s.maxPlaces, contacts: true, dailyLeft, monthlyLeft, s });
  return {
    configured: !!apifyToken(), dailyCap: s.dailyUsd, dailyUsed: r.day, dailyLeft, monthlyCap: s.monthlyUsd, monthlyUsed: Math.max(r.month, live?.usedUsd ?? 0), monthlyLeft,
    perPlace: { withContacts: perPlaceUsd(true, s), without: perPlaceUsd(false, s) }, maxPlacesNow: plan.ok ? plan.places : 0, planUsd: live?.maxMonthlyUsd ?? null, running: Number(r.active) > 0,
  };
}

export type StartState = { id?: number; error?: string; note?: string } | null;

export async function startApifyAction(_prev: StartState, form: FormData): Promise<StartState> {
  await requireLogin();
  if (!apifyToken()) return { error: "The server can't see APIFY_TOKEN. Add it to the .env file in the top-level folder (or as a Codespaces secret) and restart the CRM." };
  const nicheKey = String(form.get("niche") ?? ""), niche = (await listNiches()).find((n) => n.key === nicheKey);
  if (!niche) return { error: "Choose a niche from the list." };
  const term = (String(form.get("term") ?? "").trim() || niche.terms[0] || niche.label.toLowerCase()).slice(0, 80);
  const location = String(form.get("location") ?? "").trim();
  if (!/^[A-Za-z0-9 .,'&-]{2,60}$/.test(term)) return { error: "Use a plain search phrase, e.g. roofer." };
  if (!/^[A-Za-z0-9 .,'&-]{2,60}$/.test(location)) return { error: "Enter a town or area, e.g. Leeds." };
  const contacts = form.get("contacts") === "on";
  const filter = ["allPlaces", "withWebsite", "withoutWebsite"].includes(String(form.get("website"))) ? String(form.get("website")) : "allPlaces";

  await query(`UPDATE apify_runs SET status = 'failed', error = 'Timed out', finished_at = now() WHERE status IN ('starting', 'running', 'processing') AND started_at < now() - make_interval(mins => $1)`, [STALE_MINUTES]);
  const [busy] = await query(`SELECT 1 FROM apify_runs WHERE status IN ('starting', 'running', 'processing')`);
  if (busy) return { error: "A search is already running. Wait for it to finish." };

  const b = await apifyBudgetAction(), s = apifySettings();
  const plan = planRun({ requested: Number(form.get("places")) || 10, contacts, dailyLeft: b.dailyLeft, monthlyLeft: b.monthlyLeft, s });
  if (!plan.ok) return { error: plan.error };

  const [row] = await query<{ id: number }>(
    `INSERT INTO apify_runs (niche, query, location, max_places, contacts, website_filter, est_usd, max_charge_usd) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
    [nicheKey, term, location, plan.places, contacts, filter, plan.estUsd, plan.maxChargeUsd]);
  const input: Record<string, unknown> = { searchStringsArray: [term], locationQuery: `${location}, UK`, maxCrawledPlacesPerSearch: plan.places, language: "en", countryCode: "gb", skipClosedPlaces: true, scrapeContacts: contacts };
  if (filter !== "allPlaces") input.website = filter;
  try {
    const run = await startRun(input, { maxChargeUsd: plan.maxChargeUsd, timeoutSecs: 600 });
    await query(`UPDATE apify_runs SET apify_run_id = $2, dataset_id = $3, status = 'running' WHERE id = $1`, [row.id, run.id, run.defaultDatasetId ?? null]);
  } catch (e) {
    await query(`UPDATE apify_runs SET status = 'failed', error = $2, finished_at = now() WHERE id = $1`, [row.id, scrub(e instanceof Error ? e.message : String(e))]);
    return { error: e instanceof ApifyError ? e.message : "Couldn't start the search." };
  }
  await logActivity("apify_search_started", { channel: "apify", body: `${term} in ${location}: up to ${plan.places} places, spend capped at $${plan.maxChargeUsd.toFixed(3)}` });
  return { id: Number(row.id), note: plan.limitedBy === "daily" || plan.limitedBy === "monthly" ? `Reduced to ${plan.places} places to stay inside your ${plan.limitedBy} budget.` : undefined };
}

export type PollState = { status: "running" | "processing" | "done" | "failed"; processed: number; total: number; costUsd: number | null; message?: string; error?: string };

/** Moves a run along one step: checks Apify, then matches a few results at a time against the CRM and Companies House (free). The screen calls this every few seconds. */
export async function apifyPollAction(runId: number): Promise<PollState> {
  await requireLogin();
  const [run] = await query<any>(`SELECT id, niche, status, apify_run_id, dataset_id, max_places, est_usd::float8 AS est, started_at, cost_usd::float8 AS cost, error FROM apify_runs WHERE id = $1`, [runId]);
  if (!run) return { status: "failed", processed: 0, total: 0, costUsd: null, error: "Search not found." };
  const counts = async () => { const [c] = await query<any>(`SELECT count(*) AS total, count(*) FILTER (WHERE match IS NOT NULL) AS done FROM apify_results WHERE run_id = $1`, [runId]); return { total: Number(c.total), processed: Number(c.done) }; };
  const fail = async (error: string, cost: number | null) => { await query(`UPDATE apify_runs SET status = 'failed', error = $2, cost_usd = coalesce($3, cost_usd), finished_at = now() WHERE id = $1`, [runId, scrub(error), cost]); return { status: "failed" as const, ...(await counts()), costUsd: cost, error }; };
  try {
    if (run.status === "done") return { status: "done", ...(await counts()), costUsd: run.cost };
    if (run.status === "failed") return { status: "failed", ...(await counts()), costUsd: run.cost, error: run.error ?? "The search failed." };

    if (run.status === "running") {
      const ap = await getRun(run.apify_run_id);
      if (["READY", "RUNNING", "TIMING-OUT"].includes(ap.status)) {
        if (Date.now() - new Date(run.started_at).getTime() > STALE_MINUTES * 60_000) { await abortRun(run.apify_run_id).catch(() => {}); return fail("The search took too long and was stopped.", ap.usageTotalUsd ?? null); }
        return { status: "running", processed: 0, total: 0, costUsd: null, message: ap.statusMessage };
      }
      if (ap.status !== "SUCCEEDED") return fail(`Apify ended the run as ${ap.status.toLowerCase().replace(/-/g, " ")}.`, ap.usageTotalUsd ?? null);
      const items = ap.defaultDatasetId || run.dataset_id ? await getItems(ap.defaultDatasetId ?? run.dataset_id, run.max_places + 5) : [];
      const places = items.map(parsePlace).filter((p): p is NonNullable<ReturnType<typeof parsePlace>> => !!p && p.closed !== "permanent").slice(0, run.max_places + 5);
      await tx(async (c) => {
        for (const p of places) await c.query(
          `INSERT INTO apify_results (run_id, place_id, title, address, street, city, postcode, latitude, longitude, phone, website, domain, rating, reviews, categories, maps_url, emails, socials, closed)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19) ON CONFLICT (run_id, place_id) DO NOTHING`,
          [runId, p.placeId, p.title, p.address, p.street, p.city, p.postcode, p.latitude, p.longitude, p.phone, p.website, p.domain, p.rating, p.reviews, p.categories, p.mapsUrl, p.emails, JSON.stringify(p.socials), p.closed]);
        await c.query(`UPDATE apify_runs SET status = 'processing', cost_usd = $2, items = $3 WHERE id = $1`, [runId, ap.usageTotalUsd ?? null, places.length]);
      });
      return { status: "processing", processed: 0, total: places.length, costUsd: ap.usageTotalUsd ?? null };
    }

    // processing: a few results per call
    const left = await processBatch(runId, 6);
    const c = await counts();
    if (left === 0) { await query(`UPDATE apify_runs SET status = 'done', finished_at = now() WHERE id = $1`, [runId]); await logActivity("apify_search_done", { channel: "apify", body: `${c.total} places found, cost $${(run.cost ?? run.est).toFixed(3)}` }); revalidatePath("/companies"); return { status: "done", ...c, costUsd: run.cost }; }
    return { status: "processing", ...c, costUsd: run.cost };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // A rejected request (4xx other than rate limits) will not fix itself: stop and show why. Network trouble, 5xx and 429 are retried on the next poll.
    if (e instanceof ApifyError && !(e.status >= 400 && e.status < 500 && e.status !== 429)) return { status: run.status === "processing" ? "processing" : "running", processed: 0, total: 0, costUsd: null, error: scrub(msg) };
    return fail(scrub(msg), null);
  }
}

async function processBatch(runId: number, size: number): Promise<number> {
  return tx(async (c) => {
    const { rows } = await c.query(`SELECT * FROM apify_results WHERE run_id = $1 AND match IS NULL ORDER BY id LIMIT $2 FOR UPDATE SKIP LOCKED`, [runId, size]);
    for (const r of rows) {
      const phone = normalisePhone(r.phone), dom = r.domain ? String(r.domain).toLowerCase() : null;
      const { rows: [ex] } = await c.query(
        `SELECT id FROM companies WHERE maps_place_id = $1 OR ($2::text IS NOT NULL AND lower(domain) = $2) OR ($3::text IS NOT NULL AND normalise_phone(phone) = $3)
            OR (lower(name) = lower($4) AND $5::text IS NOT NULL AND postcode ILIKE $5 || '%') LIMIT 1`, [r.place_id, dom, phone, r.title, r.postcode ? String(r.postcode).split(" ")[0] : null]);
      const { rows: [sup] } = await c.query(`SELECT 1 FROM suppression WHERE ($1::text IS NOT NULL AND lower(domain) = $1) OR ($2::text IS NOT NULL AND phone = $2) OR lower(email) = ANY($3::text[]) LIMIT 1`, [dom, phone, r.emails ?? []]);
      let m: ReturnType<typeof matchCompanyHouse> = { match: "none", candidate: null }, skip: string | null = sup ? "On your suppression list" : ex ? "Already in the CRM" : null, existing: number | null = ex ? Number(ex.id) : null;
      if (!skip) {
        const cands = await searchByName(r.title);
        await sleep(550);   // Companies House allows 600 requests per 5 minutes
        m = matchCompanyHouse({ title: r.title, postcode: r.postcode }, cands);
        if (m.candidate) {
          const { rows: [dup] } = await c.query(`SELECT id FROM companies WHERE company_number = $1`, [m.candidate.number]);
          if (dup) { skip = "Already in the CRM"; existing = Number(dup.id); }
          else if ((await c.query(`SELECT 1 FROM suppression WHERE company_number = $1`, [m.candidate.number])).rows.length) skip = "On your suppression list";
        }
      }
      const eligibility: Eligibility = m.candidate ? classifyCompany(m.candidate.type, m.candidate.status).status : "unmatched";
      const pr = priorityScore({ website: r.website, phone: r.phone, emails: r.emails ?? [], rating: r.rating === null ? null : Number(r.rating), reviews: r.reviews, closed: r.closed }, eligibility, m.candidate ? { type: m.candidate.type, status: m.candidate.status } : null);
      await c.query(`UPDATE apify_results SET match = $2, ch_number = $3, ch_name = $4, ch_type = $5, ch_status = $6, eligible = $7, priority = $8, reasons = $9, skip_reason = $10, existing_company_id = $11 WHERE id = $1`,
        [r.id, m.match, m.candidate?.number ?? null, m.candidate?.name ?? null, m.candidate?.type ?? null, m.candidate?.status ?? null, eligibility, skip ? null : pr.score, JSON.stringify(pr.reasons), skip, existing]);
    }
    const { rows: [left] } = await c.query(`SELECT count(*) AS n FROM apify_results WHERE run_id = $1 AND match IS NULL`, [runId]);
    return Number(left.n);
  });
}

export type ApifyRow = {
  placeId: string; title: string; address: string | null; city: string | null; postcode: string | null; phone: string | null; website: string | null; rating: number | null; reviews: number | null;
  categories: string[]; mapsUrl: string | null; emails: string[]; match: string | null; chName: string | null; chNumber: string | null; chType: string | null; chStatus: string | null;
  eligible: string | null; priority: number | null; reasons: string[]; skip: string | null; added: boolean;
};

export async function apifyResultsAction(runId: number): Promise<{ rows: ApifyRow[]; run: { query: string; location: string; costUsd: number | null; estUsd: number; status: string; contacts: boolean } | null }> {
  await requireLogin();
  const [run] = await query<any>(`SELECT query, location, cost_usd::float8 AS cost, est_usd::float8 AS est, status, contacts FROM apify_runs WHERE id = $1`, [runId]);
  const rows = await query<any>(`SELECT * FROM apify_results WHERE run_id = $1 ORDER BY (skip_reason IS NOT NULL OR added_at IS NOT NULL), priority DESC NULLS LAST, title LIMIT 200`, [runId]);
  return {
    run: run ? { query: run.query, location: run.location, costUsd: run.cost, estUsd: run.est, status: run.status, contacts: run.contacts } : null,
    rows: rows.map((r) => ({ placeId: r.place_id, title: r.title, address: r.address, city: r.city, postcode: r.postcode, phone: r.phone, website: r.website, rating: r.rating === null ? null : Number(r.rating), reviews: r.reviews, categories: r.categories,
      mapsUrl: r.maps_url, emails: r.emails, match: r.match, chName: r.ch_name, chNumber: r.ch_number, chType: r.ch_type, chStatus: r.ch_status, eligible: r.eligible, priority: r.priority, reasons: r.reasons, skip: r.skip_reason, added: !!r.added_at })),
  };
}

export async function latestApifyRunAction(): Promise<{ id: number; status: string } | null> {
  await requireLogin();
  const [r] = await query<any>(`SELECT id, status FROM apify_runs ORDER BY id DESC LIMIT 1`);
  return r ? { id: Number(r.id), status: r.status } : null;
}

/** Adds the chosen places to the CRM. Verified limited companies arrive ready to contact; unmatched ones arrive blocked until you find their company number. */
export async function addApifyResultsAction(runId: number, placeIds: string[]): Promise<{ ok?: string; error?: string }> {
  await requireLogin();
  const ids = [...new Set(placeIds.filter((p) => typeof p === "string" && p.length < 130))].slice(0, 200);
  if (ids.length === 0) return { error: "Tick at least one business." };
  const [run] = await query<any>(`SELECT niche FROM apify_runs WHERE id = $1`, [runId]);
  if (!run) return { error: "Search not found." };
  const rows = await query<any>(`SELECT * FROM apify_results WHERE run_id = $1 AND place_id = ANY($2) AND added_at IS NULL AND skip_reason IS NULL`, [runId, ids]);
  let added = 0, skipped = 0;
  const numbers: string[] = [];
  for (const r of rows) {
    const eligible = r.eligible === "eligible" && r.ch_number;
    const social = (k: "linkedin" | "instagram" | "facebook") => normaliseSocial(k, (r.socials ?? {})[k]).value;
    const emailOk = (r.emails ?? [])[0] ?? null;
    try {
      const cols: Record<string, unknown> = {
        name: eligible ? tidyName(r.ch_name) : tidyName(r.title), domain: r.domain, phone: r.phone, address: r.address, postcode: r.postcode, city: r.city, latitude: r.latitude, longitude: r.longitude,
        niche: run.niche, company_number: eligible ? r.ch_number : null, is_ltd: eligible ? true : null, source: "Apify Google Maps", status: "New", generic_email: emailOk,
        linkedin_url: social("linkedin"), instagram_url: social("instagram"), facebook_url: social("facebook"),
        contact_source: ["Google Maps listing (via Apify)", emailOk ? "company website (via Apify contact enrichment)" : ""].filter(Boolean).join(" + "),
        consent_basis: eligible ? DEFAULT_CONSENT_BASIS : null, company_type: eligible ? r.ch_type : null, company_status: eligible ? r.ch_status : null,
        compliance_status: eligible ? "eligible" : "unchecked", compliance_checked_at: eligible ? new Date().toISOString() : null,
        maps_place_id: r.place_id, maps_url: r.maps_url, maps_rating: r.rating, maps_reviews: r.reviews, maps_categories: r.categories,
      };
      const keys = Object.keys(cols);
      const { rows: [co] } = await tx(async (c) => {
        const res = await c.query(`INSERT INTO companies (${keys.join(", ")}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(", ")}) RETURNING id`, keys.map((k) => cols[k]));
        await c.query(`UPDATE apify_results SET added_at = now() WHERE id = $1`, [r.id]);
        return res;
      });
      await logActivity("lead_added", { company_id: Number(co.id), channel: "apify", body: `${r.title} (priority ${r.priority ?? "-"})` });
      added++; if (eligible) numbers.push(r.ch_number);
    } catch (e: any) {
      if (e?.code === "23505") { await query(`UPDATE apify_results SET skip_reason = 'Already in the CRM (same website or company number)' WHERE id = $1`, [r.id]); skipped++; } else throw e;
    }
  }
  if (numbers.length) checkHealthInBackground();
  revalidatePath("/companies");
  return added ? { ok: `Added ${added} to the CRM${skipped ? ` (${skipped} were duplicates)` : ""}.${numbers.length ? " Filing health and fit scores are being fetched from Companies House." : ""}` } : { error: skipped ? "Those were already in the CRM." : "Nothing to add." };
}

/** Fetches filing health and the fit score for newly added limited companies (free, in the background). */
function checkHealthInBackground() {
  const venv = path.join(ROOT, ".venv", "bin", "python");
  const [cmd, args] = existsSync(venv) ? [venv, ["-m", "agency.ch_health"]] : ["uv", ["run", "python", "-m", "agency.ch_health"]];
  execFile(cmd, args, { cwd: ROOT, env: process.env, timeout: 600_000 }, () => { /* results land in the database */ });
}
