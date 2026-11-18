"use server";

import { revalidatePath } from "next/cache";
import { query, tx } from "./db";
import { requireLogin } from "./auth";
import { logActivity } from "./activity";
import { classifyCompany, normalisePhone } from "./compliance";
import { fetchProfile, searchByName } from "./companiesHouse";
import { readSiteForMatch, type SiteRead } from "./sitecheck";
import { sameBusiness } from "./siteMatchMath";
import { safeDomain } from "./websites";
import { listNiches } from "./leadConfig";
import { apifyToken, getItems, getRun, abortRun, ApifyError } from "./apify";
import { STALE_MINUTES, scrub } from "./launch";
import { parsePlace, matchCompanyHouse, priorityScore, cleanMapsTitle, type Eligibility } from "./apifyMath";

// Google Maps lead search through Apify. It spends credits, so: only on click, one run at a time, a hard spend cap sent to Apify with every run,
// and daily and monthly limits worked out from what was really spent. Nothing reaches the companies table until you choose and click Add.
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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
    const sics = (await listNiches()).find((n) => n.key === run.niche)?.sic ?? [];
    const left = await processBatch(runId, 4, sics);   // 4, not 6: each one now has its website read too
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

/**
 * Matches a few results: first the database checks (already in the CRM, suppressed), then each remaining business's own website is read at
 * once (free, robots.txt respected), then Companies House. A trading name rarely equals the registered name, so when the exact-name match fails,
 * the company number the website shows is looked up instead, and used only if it plausibly is the same business (sameBusiness). The website
 * also supplies generic emails, company social pages and a contact page, so Apify's paid contact add-on is rarely needed.
 */
async function processBatch(runId: number, size: number, nicheSics: string[]): Promise<number> {
  return tx(async (c) => {
    const { rows } = await c.query(`SELECT * FROM apify_results WHERE run_id = $1 AND match IS NULL ORDER BY id LIMIT $2 FOR UPDATE SKIP LOCKED`, [runId, size]);
    const pre: { phone: string | null; dom: string | null; skip: string | null; existing: number | null }[] = [];
    for (const r of rows) {
      const phone = normalisePhone(r.phone), dom = r.domain ? String(r.domain).toLowerCase() : null;
      const { rows: [ex] } = await c.query(
        `SELECT id FROM companies WHERE maps_place_id = $1 OR ($2::text IS NOT NULL AND lower(domain) = $2) OR ($3::text IS NOT NULL AND normalise_phone(phone) = $3)
            OR (lower(name) = lower($4) AND $5::text IS NOT NULL AND postcode ILIKE $5 || '%') LIMIT 1`, [r.place_id, dom, phone, r.title, r.postcode ? String(r.postcode).split(" ")[0] : null]);
      const { rows: [sup] } = await c.query(`SELECT 1 FROM suppression WHERE ($1::text IS NOT NULL AND lower(domain) = $1) OR ($2::text IS NOT NULL AND phone = $2) OR lower(email) = ANY($3::text[]) LIMIT 1`, [dom, phone, r.emails ?? []]);
      pre.push({ phone, dom, skip: sup ? "On your suppression list" : ex ? "Already in the CRM" : null, existing: ex ? Number(ex.id) : null });
    }
    const sites: (SiteRead | null)[] = await Promise.all(pre.map((p) => (p.skip || !p.dom || !safeDomain(p.dom) ? null : readSiteForMatch(p.dom).catch(() => null))));

    for (const [i, r] of rows.entries()) {
      let { skip, existing } = pre[i];
      const site = sites[i];
      let m: ReturnType<typeof matchCompanyHouse> = { match: "none", candidate: null }, siteWhy: string | null = null, siteNumber: string | null = null;
      if (!skip) {
        const cands = await searchByName(r.title);
        await sleep(550);   // Companies House allows 600 requests per 5 minutes
        m = matchCompanyHouse({ title: r.title, postcode: r.postcode }, cands);
        const short = cleanMapsTitle(r.title);
        if (!m.candidate && short !== r.title) {   // the name without Google's advertising text ("Skin Clinix | Chorlton Skin & Aesthetic Clinic")
          const more = await searchByName(short);
          await sleep(550);
          m = matchCompanyHouse({ title: short, postcode: r.postcode }, more);
        }
        if (!m.candidate && site?.numbers.length) {
          for (const n of site.numbers.slice(0, 2)) {
            const prof = await fetchProfile(n);
            await sleep(550);
            if (!prof) continue;
            const same = sameBusiness(prof, { title: r.title, postcode: r.postcode, domain: pre[i].dom }, nicheSics);
            if (same.ok) { m = { match: "website", candidate: { number: prof.number, name: prof.name, type: prof.type, status: prof.status, address: prof.address } }; siteNumber = prof.number; siteWhy = same.why; break; }
            siteWhy = `the website shows ${prof.number} (${prof.name}), but ${same.why}, so it was not used`;
          }
        }
        if (m.candidate) {
          const { rows: [dup] } = await c.query(`SELECT id FROM companies WHERE company_number = $1`, [m.candidate.number]);
          if (dup) { skip = "Already in the CRM"; existing = Number(dup.id); }
          else if ((await c.query(`SELECT 1 FROM suppression WHERE company_number = $1`, [m.candidate.number])).rows.length) skip = "On your suppression list";
        }
      }
      // What the website adds: Maps' own details win; the site fills the gaps. Emails are generic ones on the site's own domain, re-checked against suppression.
      const f = site?.findings ?? null;
      let siteEmails = (r.emails ?? []).length ? [] : (f?.emails ?? []);
      if (siteEmails.length) { const { rows: bad } = await c.query(`SELECT lower(email) AS e FROM suppression WHERE lower(email) = ANY($1::text[])`, [siteEmails]); siteEmails = siteEmails.filter((e: string) => !bad.some((b: any) => b.e === e)); }
      const emails = [...(r.emails ?? []), ...siteEmails].slice(0, 3);
      const fromSite = (["linkedin", "instagram", "facebook"] as const).filter((k) => f?.[k] && !(r.socials ?? {})[k]);
      const socials = { ...(r.socials ?? {}), ...Object.fromEntries(fromSite.map((k) => [k, f![k]])) };
      const siteRead = site ? { pages: site.pages, numbers: site.numbers, matched: siteNumber, why: siteWhy, emails: siteEmails.length, socials: fromSite, contact_url: f?.contact_url ?? null } : null;

      const eligibility: Eligibility = m.candidate ? classifyCompany(m.candidate.type, m.candidate.status).status : "unmatched";
      const pr = priorityScore({ website: r.website, phone: r.phone, emails, rating: r.rating === null ? null : Number(r.rating), reviews: r.reviews, closed: r.closed }, eligibility, m.candidate ? { type: m.candidate.type, status: m.candidate.status } : null);
      if (siteNumber) pr.reasons.unshift(`Matched to Companies House through its website: ${siteWhy}`);
      else if (siteWhy) pr.reasons.push(`Not matched: ${siteWhy}`);
      await c.query(`UPDATE apify_results SET match = $2, ch_number = $3, ch_name = $4, ch_type = $5, ch_status = $6, eligible = $7, priority = $8, reasons = $9, skip_reason = $10, existing_company_id = $11,
                       emails = $12, socials = $13, site_read = $14 WHERE id = $1`,
        [r.id, m.match, m.candidate?.number ?? null, m.candidate?.name ?? null, m.candidate?.type ?? null, m.candidate?.status ?? null, eligibility, skip ? null : pr.score, JSON.stringify(pr.reasons), skip, existing,
         emails, JSON.stringify(socials), siteRead ? JSON.stringify(siteRead) : null]);
    }
    const { rows: [left] } = await c.query(`SELECT count(*) AS n FROM apify_results WHERE run_id = $1 AND match IS NULL`, [runId]);
    return Number(left.n);
  });
}
