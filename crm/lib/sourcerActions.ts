"use server";

import { revalidatePath } from "next/cache";
import { query } from "./db";
import { requireLogin } from "./auth";
import { logActivity } from "./activity";
import { listNiches } from "./leadConfig";
import { sourceBlockFor } from "./nicheGate";
import { launchApify, launchChSearch, getBudget, type Budget } from "./launch";
import { apifyPollAction } from "./apifyActions";
import { addSearchResultsAction } from "./leadSearchActions";
import { checkHealthInBackground, insertApifyRow, patchCompanyFromMaps } from "./apifyAdd";
import { chLimit, cqcLimit, mapsPlaces, mapsStars, mapsWebsite, parseSourcerForm, type SourcerFilters } from "./sourcerFilters";
import { applyFilters, mergeRows, splitForAdd, type ChStaged, type CqcStaged, type MapsStaged, type SourcerRow } from "./sourcerMerge";
import { cqcPoll, insertCqcRow, launchCqcSearch, patchCompanyFromCqc } from "./cqc";
import { explainSuitability } from "./suitability";
import { NO_RULES, offNicheReason } from "./nicheRelevance";

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
  const nicheBlock = await sourceBlockFor(f.niche);   // only active niches are searched; seeding, audience and parked ones are refused here, not just greyed out
  if (nicheBlock) return { error: nicheBlock };
  const notes: string[] = [];
  let chId: number | null = null, mapsId: number | null = null, cqcId: number | null = null;
  const errors: string[] = [];

  if (f.sources.includes("ch")) {
    const r = await launchChSearch({ niche: f.niche, location: f.location, limit: chLimit(f), minAgeYears: f.ageMin ?? undefined });
    if (r.id) chId = r.id; else errors.push(`Companies House: ${r.error}`);
  }
  if (f.sources.includes("maps")) {
    const r = await launchApify({ nicheKey: f.niche, term: f.term || niche.terms[0] || niche.label.toLowerCase(), location: f.location, places: mapsPlaces(f), contacts: f.contacts, website: mapsWebsite(f), minStars: mapsStars(f) });
    if (r.id) { mapsId = r.id; if (r.note) notes.push(r.note); } else errors.push(`Google Maps: ${r.error}`);
  }
  if (f.sources.includes("cqc")) {   // free: CQC's public directory (downloaded at most weekly) matched to Companies House
    if (!niche.cqc) errors.push("CQC register: CQC doesn't regulate this niche, so it isn't searched there.");
    else {
      const r = await launchCqcSearch({ niche: f.niche, location: f.location, limit: cqcLimit(f), cfg: niche.cqc, rules: niche.rules });
      if (r.id) { cqcId = r.id; if (r.note) notes.push(r.note); } else errors.push(`CQC register: ${r.error}`);
    }
  }
  if (!chId && !mapsId && !cqcId) return { error: errors.join(" ") || "Nothing could be started." };
  const used = [chId ? "ch" : null, mapsId ? "maps" : null, cqcId ? "cqc" : null].filter(Boolean) as string[];
  const [run] = await query<{ id: number }>(`INSERT INTO sourcer_runs (niche, location, filters, sources, ch_search_id, apify_run_id, cqc_search_id, warnings) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
    [f.niche, f.location, JSON.stringify(f), used, chId, mapsId, cqcId, JSON.stringify([...errors.map((e) => `Skipped: ${e}`), ...notes])]);
  return { id: Number(run.id), notes: [...errors.map((e) => `Skipped: ${e}`), ...notes] };
}

export type PartState = { key: "ch" | "maps" | "cqc"; label: string; state: "running" | "processing" | "done" | "failed"; message: string };
export type SourcerPoll = { status: "running" | "done" | "failed"; parts: PartState[] };

/** Moves every source along one step and reports where each is. The screen calls this every few seconds until it says done. */
export async function sourcerPollAction(runId: number): Promise<SourcerPoll> {
  await requireLogin();
  const [run] = await query<any>(`SELECT ch_search_id, apify_run_id, cqc_search_id FROM sourcer_runs WHERE id = $1`, [runId]);
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
  if (run.cqc_search_id) {
    const q = await cqcPoll(Number(run.cqc_search_id));
    parts.push({ key: "cqc", label: "CQC register", state: q.state, message: q.state === "done" ? `${q.total} practices found` : q.state === "failed" ? q.message ?? "The search failed."
      : `Matching each one to its company on Companies House… ${q.processed} of ${q.total}${q.message ? ` (${q.message})` : ""}` });
  }
  const active = parts.some((p) => p.state === "running" || p.state === "processing");
  return { status: active ? "running" : parts.some((p) => p.state === "done") ? "done" : "failed", parts };
}

export type ScoreParts = { size: number; verified: number; reach: number; reputation: number };
/** `offNiche`: why the name or Google category looks like another industry (nicheRelevance.ts), or null. Flagged rows are shown last and not ticked, never hidden. */
export type Scored = SourcerRow & { score: number; tier: string; why: string[]; parts: ScoreParts; offNiche: string | null };
export type SourcerResults = {
  filters: SourcerFilters; rows: Scored[]; dropped: [string, number][]; found: number; warnings: string[]; mapsCostUsd: number | null; mapsEstUsd: number | null; offNiche: number;
};

async function loadMerged(runId: number): Promise<{ run: any; rows: SourcerRow[]; maps: any[]; cqc: any[] } | null> {
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
  const cqcRows = run.cqc_search_id ? await query<any>(`SELECT * FROM cqc_results WHERE search_id = $1 AND match IS NOT NULL ORDER BY id`, [run.cqc_search_id]) : [];
  const cqc: CqcStaged[] = cqcRows.map((r) => ({ id: Number(r.id), locationId: r.location_id, name: r.name, provider: r.provider_name, address: r.address, postcode: r.postcode, phone: r.phone, website: r.website, domain: r.domain,
    serviceTypes: r.service_types ?? [], localAuthority: r.local_authority, chNumber: r.ch_number, chName: r.ch_name, chType: r.ch_type, chStatus: r.ch_status, eligible: r.eligible, skip: r.skip_reason, added: !!r.added_at }));
  return { run, rows: mergeRows(ch, maps, new Date().toISOString().slice(0, 10), cqc), maps: mapsRows, cqc: cqcRows };
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
    const fixed: Record<string, string | null> = { niche: stored.niche, location: stored.location, term: stored.term, src_ch: stored.sources.includes("ch") ? "on" : null, src_maps: stored.sources.includes("maps") ? "on" : null, src_cqc: stored.sources.includes("cqc") ? "on" : null };
    const parsed = parseSourcerForm((k) => (k in fixed ? fixed[k] : typeof override[k] === "string" ? override[k] : null));
    if (parsed.ok) f = parsed.filters; else warnings.push(`Filters not applied: ${parsed.error}`);
  }
  const { kept, dropped } = applyFilters(m.rows, f);
  const pts = kept.length ? await query<any>(
    `SELECT r.ord::int AS i, sp.* FROM unnest($1::int[], $2::boolean[], $3::boolean[], $4::boolean[], $5::boolean[], $6::numeric[], $7::int[], $8::boolean[]) WITH ORDINALITY AS r(fit, eligible, site, email, phone, rating, reviews, excluded, ord)
       CROSS JOIN LATERAL suitability_points(r.fit, r.eligible, r.site, r.email, r.phone, r.rating, r.reviews, r.excluded) sp ORDER BY r.ord`,
    [kept.map((r) => r.fit), kept.map((r) => r.eligible === "eligible"), kept.map((r) => !!r.domain), kept.map((r) => r.emails.length > 0), kept.map((r) => !!r.phone), kept.map((r) => r.rating), kept.map((r) => r.reviews), kept.map((r) => r.eligible === "not_eligible")]) : [];
  const rules = (await listNiches()).find((n) => n.key === m.run.niche)?.rules ?? NO_RULES;   // read each time, so editing the keywords re-flags old searches too
  const scored: Scored[] = kept.map((r, i) => ({ ...r, score: pts[i].score, tier: pts[i].tier, offNiche: offNicheReason(r.name, r.categories, rules),
    parts: r.eligible === "not_eligible" ? { size: 0, verified: 0, reach: 0, reputation: 0 } : { size: pts[i].fit_pts, verified: pts[i].eligible_pts, reach: pts[i].website_pts + pts[i].email_pts + pts[i].phone_pts, reputation: pts[i].rating_pts + pts[i].reviews_pts },
    why: explainSuitability({ suitability: pts[i].score, tier: pts[i].tier, excluded: r.eligible === "not_eligible", fit_pts: pts[i].fit_pts, eligible_pts: pts[i].eligible_pts, website_pts: pts[i].website_pts, email_pts: pts[i].email_pts,
      phone_pts: pts[i].phone_pts, rating_pts: pts[i].rating_pts, reviews_pts: pts[i].reviews_pts, fit_score: r.fit, maps_rating: r.rating, maps_reviews: r.reviews }) }));
  scored.sort((a, b) => Number(!!a.skip || a.added) - Number(!!b.skip || b.added) || Number(!!a.offNiche) - Number(!!b.offNiche) || b.score - a.score || a.name.localeCompare(b.name));
  const [cost] = m.run.apify_run_id ? await query<any>(`SELECT cost_usd::float8 AS cost, est_usd::float8 AS est FROM apify_runs WHERE id = $1`, [m.run.apify_run_id]) : [null];
  return { filters: f, rows: scored.slice(0, 200), dropped: Object.entries(dropped).sort((a, b) => b[1] - a[1]), found: m.rows.length, warnings, mapsCostUsd: cost?.cost ?? null, mapsEstUsd: cost?.est ?? null,
    offNiche: scored.filter((r) => r.offNiche && !r.skip && !r.added).length };
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
  const cqcById = new Map<number, any>(m.cqc.map((r) => [Number(r.id), r]));
  const { ch: chRows, others } = splitForAdd(rows);
  let added = 0, skipped = 0, healthNeeded = false;

  if (chRows.length) {
    const r = await addSearchResultsAction(Number(m.run.ch_search_id), chRows.map((x) => x.chNumber!));
    if (r.error) return { error: r.error };
    added += Number(r.ok?.match(/Added (\d+)/)?.[1] ?? chRows.length);
    for (const row of chRows) {   // the same company's Google Maps and CQC details fill the gaps
      const p = row.mapsPlaceId ? mapsByPlace.get(row.mapsPlaceId) : null; if (p) await patchCompanyFromMaps(row.chNumber!, p);
      const q = row.cqcId ? cqcById.get(row.cqcId) : null; if (q) await patchCompanyFromCqc({ companyNumber: row.chNumber }, q);
    }
  }
  for (const row of others) {   // Google Maps first (it brings ratings and emails), then CQC's details on top; or a CQC result on its own
    const p = row.mapsPlaceId ? mapsByPlace.get(row.mapsPlaceId) : null, q = row.cqcId ? cqcById.get(row.cqcId) : null;
    try {
      if (p) { const res = await insertApifyRow(p, m.run.niche); added++; healthNeeded = healthNeeded || res.eligible; if (q) await patchCompanyFromCqc({ companyId: res.id }, q); }
      else if (q) { const res = await insertCqcRow(q, m.run.niche); added++; healthNeeded = healthNeeded || res.eligible; }
    } catch (e: any) {
      if (e?.code !== "23505") throw e;
      if (p) await query(`UPDATE apify_results SET skip_reason = 'Already in the CRM (same website or company number)' WHERE id = $1`, [p.id]);
      else if (q) await query(`UPDATE cqc_results SET skip_reason = 'Already in the CRM (same website or company number)' WHERE id = $1`, [q.id]);
      skipped++;
    }
  }
  if (healthNeeded) checkHealthInBackground();
  await logActivity("sourcer_added", { channel: "sourcer", body: `${added} added from a Lead Sourcer search (${m.run.niche}, ${m.run.location})` });
  revalidatePath("/companies"); revalidatePath("/sourcer");
  return added ? { ok: `Added ${added} to the CRM${skipped ? ` (${skipped} were duplicates)` : ""}. Filing health and fit scores are filled in from Companies House.` } : { error: skipped ? "Those were already in the CRM." : "Nothing was added." };
}

export async function sourcerBudgetAction(): Promise<Budget> { await requireLogin(); return getBudget(); }
