"use server";

import { revalidatePath } from "next/cache";
import { query } from "./db";
import { requireLogin } from "./auth";
import { logActivity } from "./activity";
import { listNiches } from "./leadConfig";
import { launchApify, launchChSearch, getBudget, type Budget } from "./launch";
import { apifyPollAction } from "./apifyActions";
import { addSearchResultsAction } from "./leadSearchActions";
import { checkHealthInBackground, insertApifyRow, patchCompanyFromMaps } from "./apifyAdd";
import { chLimit, mapsPlaces, mapsStars, mapsWebsite, parseSourcerForm, type SourcerFilters } from "./sourcerFilters";
import { applyFilters, mergeRows, type ChStaged, type MapsStaged, type SourcerRow } from "./sourcerMerge";
import { explainSuitability } from "./suitability";

// Lead Sourcer: one search that can use several sources at once, merges what they find into one ranked list, and adds what you choose.
// Searching never saves a company. Paid sources run only because you ticked them and clicked Search, inside their budgets.

export type StartState = { id?: number; error?: string; notes?: string[] } | null;

export async function startSourcerAction(_prev: StartState, form: FormData): Promise<StartState> {
  await requireLogin();
  const parsed = parseSourcerForm((k) => { const v = form.get(k); return typeof v === "string" ? v : null; });
  if (!parsed.ok) return { error: parsed.error };
  const f = parsed.filters;
  const niche = (await listNiches()).find((n) => n.key === f.niche);
  if (!niche) return { error: "Choose a niche from the list." };
  const notes: string[] = [];
  let chId: number | null = null, mapsId: number | null = null;
  const errors: string[] = [];

  if (f.sources.includes("ch")) {
    const r = await launchChSearch({ niche: f.niche, location: f.location, limit: chLimit(f), minAgeYears: f.ageMin ?? undefined });
    if (r.id) chId = r.id; else errors.push(`Companies House: ${r.error}`);
  }
  if (f.sources.includes("maps")) {
    const r = await launchApify({ nicheKey: f.niche, term: f.term || niche.terms[0] || niche.label.toLowerCase(), location: f.location, places: mapsPlaces(f), contacts: f.contacts, website: mapsWebsite(f), minStars: mapsStars(f) });
    if (r.id) { mapsId = r.id; if (r.note) notes.push(r.note); } else errors.push(`Google Maps: ${r.error}`);
  }
  if (!chId && !mapsId) return { error: errors.join(" ") || "Nothing could be started." };
  const used = [chId ? "ch" : null, mapsId ? "maps" : null].filter(Boolean) as string[];
  const [run] = await query<{ id: number }>(`INSERT INTO sourcer_runs (niche, location, filters, sources, ch_search_id, apify_run_id, warnings) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
    [f.niche, f.location, JSON.stringify(f), used, chId, mapsId, JSON.stringify([...errors.map((e) => `Skipped: ${e}`), ...notes])]);
  return { id: Number(run.id), notes: [...errors.map((e) => `Skipped: ${e}`), ...notes] };
}

export type PartState = { key: "ch" | "maps"; label: string; state: "running" | "processing" | "done" | "failed"; message: string };
export type SourcerPoll = { status: "running" | "done" | "failed"; parts: PartState[] };

/** Moves every source along one step and reports where each is. The screen calls this every few seconds until it says done. */
export async function sourcerPollAction(runId: number): Promise<SourcerPoll> {
  await requireLogin();
  const [run] = await query<any>(`SELECT ch_search_id, apify_run_id FROM sourcer_runs WHERE id = $1`, [runId]);
  if (!run) return { status: "failed", parts: [] };
  const parts: PartState[] = [];
  if (run.ch_search_id) {
    const [s] = await query<any>(`SELECT status, output, (SELECT count(*) FROM lead_search_results WHERE search_id = $1) AS n FROM lead_searches WHERE id = $1`, [run.ch_search_id]);
    parts.push({ key: "ch", label: "Companies House", state: s?.status === "done" ? "done" : s?.status === "failed" ? "failed" : "running",
      message: s?.status === "done" ? `${s.n} companies found` : s?.status === "failed" ? String(s.output ?? "").split("\n").filter(Boolean).slice(-1)[0] ?? "The search failed." : "Looking up companies and checking their filing health…" });
  }
  if (run.apify_run_id) {
    const p = await apifyPollAction(Number(run.apify_run_id));
    parts.push({ key: "maps", label: "Google Maps", state: p.status, message: p.status === "done" ? `${p.total} businesses found${p.costUsd !== null ? ` · cost $${p.costUsd.toFixed(3)}` : ""}`
      : p.status === "failed" ? p.error ?? "The search failed." : p.status === "processing" ? `Matching to Companies House… ${p.processed} of ${p.total}` : p.message ?? "Searching Google Maps…" });
  }
  const active = parts.some((p) => p.state === "running" || p.state === "processing");
  return { status: active ? "running" : parts.some((p) => p.state === "done") ? "done" : "failed", parts };
}

export type Scored = SourcerRow & { score: number; tier: string; why: string[] };
export type SourcerResults = {
  filters: SourcerFilters; rows: Scored[]; dropped: [string, number][]; found: number; warnings: string[]; mapsCostUsd: number | null; mapsEstUsd: number | null;
};

async function loadMerged(runId: number): Promise<{ run: any; rows: SourcerRow[]; maps: any[] } | null> {
  const [run] = await query<any>(`SELECT * FROM sourcer_runs WHERE id = $1`, [runId]);
  if (!run) return null;
  const ch: ChStaged[] = run.ch_search_id ? (await query<any>(
    `SELECT company_number, name, postcode, address, company_type, company_status, fit_score, fit_notes, est_revenue_gbp::float AS est,
            CASE WHEN facts->>'employees' ~ '^[0-9]+$' THEN (facts->>'employees')::int END AS employees, facts->>'incorporated_on' AS inc, skip_reason, added_at
       FROM lead_search_results WHERE search_id = $1`, [run.ch_search_id])).map((r) => ({ number: r.company_number, name: r.name, postcode: r.postcode, address: r.address, type: r.company_type, status: r.company_status,
        fit: r.fit_score, notes: r.fit_notes, est: r.est, employees: r.employees, incorporatedOn: r.inc, skip: r.skip_reason, added: !!r.added_at })) : [];
  const mapsRows = run.apify_run_id ? await query<any>(`SELECT * FROM apify_results WHERE run_id = $1 AND match IS NOT NULL`, [run.apify_run_id]) : [];
  const maps: MapsStaged[] = mapsRows.map((r) => ({ placeId: r.place_id, title: r.title, address: r.address, city: r.city, postcode: r.postcode, phone: r.phone, website: r.website, domain: r.domain,
    rating: r.rating === null ? null : Number(r.rating), reviews: r.reviews, categories: r.categories, mapsUrl: r.maps_url, emails: r.emails, closed: r.closed, chNumber: r.ch_number, chName: r.ch_name,
    chType: r.ch_type, chStatus: r.ch_status, eligible: r.eligible, skip: r.skip_reason, added: !!r.added_at }));
  return { run, rows: mergeRows(ch, maps, new Date().toISOString().slice(0, 10)), maps: mapsRows };
}

/** The merged, filtered, scored list. Scores come from the same database function as the CRM list, so a company ranks the same before and after it is added. */
export async function sourcerResultsAction(runId: number, override?: Record<string, string>): Promise<SourcerResults | null> {
  await requireLogin();
  const m = await loadMerged(runId);
  if (!m) return null;
  let f = m.run.filters as SourcerFilters;
  const warnings: string[] = [...m.run.warnings];
  if (override) {   // change the filters on results you already have: free, nothing is searched again. The search itself (niche, place, sources) stays as it was.
    const stored = m.run.filters as SourcerFilters;
    const fixed: Record<string, string | null> = { niche: stored.niche, location: stored.location, term: stored.term, src_ch: stored.sources.includes("ch") ? "on" : null, src_maps: stored.sources.includes("maps") ? "on" : null };
    const parsed = parseSourcerForm((k) => (k in fixed ? fixed[k] : typeof override[k] === "string" ? override[k] : null));
    if (parsed.ok) f = parsed.filters; else warnings.push(`Filters not applied: ${parsed.error}`);
  }
  const { kept, dropped } = applyFilters(m.rows, f);
  const pts = kept.length ? await query<any>(
    `SELECT r.ord::int AS i, sp.* FROM unnest($1::int[], $2::boolean[], $3::boolean[], $4::boolean[], $5::boolean[], $6::numeric[], $7::int[], $8::boolean[]) WITH ORDINALITY AS r(fit, eligible, site, email, phone, rating, reviews, excluded, ord)
       CROSS JOIN LATERAL suitability_points(r.fit, r.eligible, r.site, r.email, r.phone, r.rating, r.reviews, r.excluded) sp ORDER BY r.ord`,
    [kept.map((r) => r.fit), kept.map((r) => r.eligible === "eligible"), kept.map((r) => !!r.domain), kept.map((r) => r.emails.length > 0), kept.map((r) => !!r.phone), kept.map((r) => r.rating), kept.map((r) => r.reviews), kept.map((r) => r.eligible === "not_eligible")]) : [];
  const scored: Scored[] = kept.map((r, i) => ({ ...r, score: pts[i].score, tier: pts[i].tier,
    why: explainSuitability({ suitability: pts[i].score, tier: pts[i].tier, excluded: r.eligible === "not_eligible", fit_pts: pts[i].fit_pts, eligible_pts: pts[i].eligible_pts, website_pts: pts[i].website_pts, email_pts: pts[i].email_pts,
      phone_pts: pts[i].phone_pts, rating_pts: pts[i].rating_pts, reviews_pts: pts[i].reviews_pts, fit_score: r.fit, maps_rating: r.rating, maps_reviews: r.reviews }) }));
  scored.sort((a, b) => Number(!!a.skip || a.added) - Number(!!b.skip || b.added) || b.score - a.score || a.name.localeCompare(b.name));
  const [cost] = m.run.apify_run_id ? await query<any>(`SELECT cost_usd::float8 AS cost, est_usd::float8 AS est FROM apify_runs WHERE id = $1`, [m.run.apify_run_id]) : [null];
  return { filters: f, rows: scored.slice(0, 200), dropped: Object.entries(dropped).sort((a, b) => b[1] - a[1]), found: m.rows.length, warnings, mapsCostUsd: cost?.cost ?? null, mapsEstUsd: cost?.est ?? null };
}

/** Adds the rows you ticked. Companies House results go in with their full filing health; Google Maps details are added to the same company when both sources found it. */
export async function sourcerAddAction(runId: number, keys: string[]): Promise<{ ok?: string; error?: string }> {
  await requireLogin();
  const m = await loadMerged(runId);
  if (!m) return { error: "Search not found." };
  const wanted = new Set(keys.filter((k) => typeof k === "string" && k.length < 160));
  const rows = m.rows.filter((r) => wanted.has(r.key) && !r.skip && !r.added);
  if (rows.length === 0) return { error: "Tick at least one business that isn't already added." };
  const mapsByPlace = new Map<string, any>(m.maps.map((r) => [r.place_id, r]));
  const chRows = rows.filter((r) => r.sources.includes("ch") && r.chNumber), mapsOnly = rows.filter((r) => !r.sources.includes("ch"));
  let added = 0, skipped = 0, healthNeeded = false;

  if (chRows.length) {
    const r = await addSearchResultsAction(Number(m.run.ch_search_id), chRows.map((x) => x.chNumber!));
    if (r.error) return { error: r.error };
    added += Number(r.ok?.match(/Added (\d+)/)?.[1] ?? chRows.length);
    for (const row of chRows.filter((x) => x.mapsPlaceId)) { const p = mapsByPlace.get(row.mapsPlaceId!); if (p) await patchCompanyFromMaps(row.chNumber!, p); }
  }
  for (const row of mapsOnly) {
    const p = mapsByPlace.get(row.mapsPlaceId ?? "");
    if (!p) continue;
    try { const res = await insertApifyRow(p, m.run.niche); added++; healthNeeded = healthNeeded || res.eligible; }
    catch (e: any) { if (e?.code === "23505") { await query(`UPDATE apify_results SET skip_reason = 'Already in the CRM (same website or company number)' WHERE id = $1`, [p.id]); skipped++; } else throw e; }
  }
  if (healthNeeded) checkHealthInBackground();
  await logActivity("sourcer_added", { channel: "sourcer", body: `${added} added from a Lead Sourcer search (${m.run.niche}, ${m.run.location})` });
  revalidatePath("/companies"); revalidatePath("/sourcer");
  return added ? { ok: `Added ${added} to the CRM${skipped ? ` (${skipped} were duplicates)` : ""}. Filing health and fit scores are filled in from Companies House.` } : { error: skipped ? "Those were already in the CRM." : "Nothing was added." };
}

export async function sourcerBudgetAction(): Promise<Budget> { await requireLogin(); return getBudget(); }
