import { query, tx } from "./db";
import { logActivity } from "./activity";
import { classifyCompany, DEFAULT_CONSENT_BASIS, normalisePhone } from "./compliance";
import { normaliseName, searchByName } from "./companiesHouse";
import { matchCompanyHouse, tidyName } from "./apifyMath";
import { robotsAllows, safeDomain } from "./websites";
import { ATTRIBUTION, CQC_DATA_PAGE, REFRESH_DAYS, findDirectoryUrl, fileDate, fitsNiche, inArea, parseDirectory, type CqcLocation, type CqcNiche } from "./cqcMath";
import type { RelevanceRules } from "./nicheRelevance";

// CQC register as a Lead Sourcer source (docs/LEAD_SOURCER_PLAN.md, step 4). A plain server module: the actions that call it check you are
// logged in first. Free: the care directory is a public file under the Open Government Licence, fetched on your click at most once a week
// (robots.txt respected), and Companies House is free too. Company-level only: the trading name, address, business phone, website and the
// registered company that runs it. Nothing reaches the companies table until you choose and click Add.

const UA = "AgencyOSBot";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** The latest download if it is fresh and kept every service type now needed; otherwise downloads the directory again. Returns a note for the screen. */
export async function ensureDirectory(types: string[]): Promise<{ importId: number; note: string | null }> {
  const [last] = await query<any>(`SELECT id, file_date, service_types, imported_at FROM cqc_imports ORDER BY id DESC LIMIT 1`);
  const fresh = last && Date.now() - new Date(last.imported_at).getTime() < REFRESH_DAYS * 86_400_000 && types.every((t) => last.service_types.includes(t));
  if (fresh) return { importId: Number(last.id), note: null };

  let url = process.env.CQC_DIRECTORY_URL?.trim() || null;
  if (!url) {
    if (!(await robotsAllows("www.cqc.org.uk", new URL(CQC_DATA_PAGE).pathname))) throw new Error("CQC's robots.txt doesn't allow reading its data page, so the directory can't be found. Set CQC_DIRECTORY_URL to the CSV link instead.");
    const page = await fetch(CQC_DATA_PAGE, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(20_000) });
    url = page.ok ? findDirectoryUrl(await page.text()) : null;
    if (!url) throw new Error("Couldn't find this week's CQC care directory link on CQC's data page. Set CQC_DIRECTORY_URL to the CSV link instead.");
  }
  const u = new URL(url);
  if (u.protocol !== "https:" || !/(^|\.)cqc\.org\.uk$/.test(u.hostname)) throw new Error("CQC_DIRECTORY_URL must be an https address on cqc.org.uk.");
  if (!(await robotsAllows(u.hostname, u.pathname))) throw new Error("CQC's robots.txt doesn't allow downloading the directory.");
  const res = await fetch(url, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(120_000) });
  if (!res.ok) throw new Error(`CQC's directory download failed (${res.status}).`);
  const text = await res.text();
  const parsed = parseDirectory(text, types);
  if (parsed.missing.length) throw new Error(`CQC's directory has changed shape (missing: ${parsed.missing.join(", ")}). Nothing was imported.`);
  if (parsed.kept.length === 0) throw new Error("CQC's directory had no rows for these service types. Nothing was imported.");

  const id = await tx(async (c) => {
    const { rows: [imp] } = await c.query(`INSERT INTO cqc_imports (file_url, file_date, service_types, rows_read, rows_kept) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [url, fileDate(text), types, parsed.read, parsed.kept.length]);
    for (let i = 0; i < parsed.kept.length; i += 1000) {
      await c.query(
        `INSERT INTO cqc_locations (location_id, import_id, name, also_known_as, address, postcode, phone, website, domain, service_types, local_authority, region, provider_id, provider_name, provider_locations)
         SELECT x.location_id, $2, x.name, x.also_known_as, x.address, x.postcode, x.phone, x.website, x.domain, x.service_types, x.local_authority, x.region, x.provider_id, x.provider_name, x.provider_locations
           FROM jsonb_to_recordset($1::jsonb) AS x(location_id text, name text, also_known_as text, address text, postcode text, phone text, website text, domain text, service_types text[],
                local_authority text, region text, provider_id text, provider_name text, provider_locations integer)
         ON CONFLICT (location_id) DO UPDATE SET import_id = EXCLUDED.import_id, name = EXCLUDED.name, also_known_as = EXCLUDED.also_known_as, address = EXCLUDED.address, postcode = EXCLUDED.postcode,
           phone = EXCLUDED.phone, website = EXCLUDED.website, domain = EXCLUDED.domain, service_types = EXCLUDED.service_types, local_authority = EXCLUDED.local_authority, region = EXCLUDED.region,
           provider_id = EXCLUDED.provider_id, provider_name = EXCLUDED.provider_name, provider_locations = EXCLUDED.provider_locations`,
        [JSON.stringify(parsed.kept.slice(i, i + 1000)), imp.id]);
    }
    await c.query(`DELETE FROM cqc_locations WHERE import_id <> $1`, [imp.id]);   // a cache of the latest file only: locations CQC no longer lists go
    return Number(imp.id);
  });
  await logActivity("cqc_directory_imported", { channel: "cqc", body: `CQC care directory: ${parsed.kept.length} of ${parsed.read} locations kept. Cost: £0.` });
  return { importId: id, note: `Downloaded CQC's latest care directory (${parsed.kept.length.toLocaleString("en-GB")} limited-company locations kept). Free.` };
}

/** Starts a search of the register: picks the niche's locations in the area and stages them for matching to Companies House. */
export async function launchCqcSearch(o: { niche: string; location: string; limit: number; cfg: CqcNiche; rules: RelevanceRules }): Promise<{ id?: number; error?: string; note?: string | null }> {
  let note: string | null;
  try { ({ note } = await ensureDirectory(await allCqcTypes(o.cfg))); } catch (e) { return { error: e instanceof Error ? e.message : "The CQC directory couldn't be downloaded." }; }
  const rows = await query<CqcLocation>(`SELECT * FROM cqc_locations WHERE service_types && $1::text[]`, [o.cfg.serviceTypes]);
  const local = rows.filter((r) => inArea(r, o.location));
  let chains = 0;
  const fit = local.filter((r) => { const why = fitsNiche(r, o.cfg, o.rules); if (why === "chain") chains++; return why === "ok"; })
    .sort((a, b) => Number(!!b.domain) - Number(!!a.domain) || a.name.localeCompare(b.name)).slice(0, o.limit);
  const [s] = await query<{ id: number }>(`INSERT INTO cqc_searches (niche, location, import_id, found, chains, status) VALUES ($1,$2,(SELECT max(id) FROM cqc_imports),$3,$4,$5) RETURNING id`,
    [o.niche, o.location, fit.length, chains, fit.length ? "processing" : "done"]);
  if (fit.length) await query(
    `INSERT INTO cqc_results (search_id, location_id, name, provider_name, address, postcode, phone, website, domain, service_types, local_authority)
     SELECT $2, x.location_id, x.name, x.provider_name, x.address, x.postcode, x.phone, x.website, x.domain, x.service_types, x.local_authority
       FROM jsonb_to_recordset($1::jsonb) AS x(location_id text, name text, provider_name text, address text, postcode text, phone text, website text, domain text, service_types text[], local_authority text)
     ON CONFLICT DO NOTHING`, [JSON.stringify(fit), s.id]);
  if (!local.length) note = [note, `CQC lists no locations in "${o.location}". Try the town or the council area as CQC names it (for example "Leeds" or "Kirklees"), or a postcode area such as LS6.`].filter(Boolean).join(" ");
  else if (chains) note = [note, `${chains} location${chains === 1 ? "" : "s"} left out because the company runs more than ${o.cfg.maxProviderLocations} (a chain).`].filter(Boolean).join(" ");
  return { id: Number(s.id), note };
}

/** Every service type any niche needs, so one download serves them all. */
async function allCqcTypes(extra: CqcNiche): Promise<string[]> {
  const { listNiches } = await import("./leadConfig");
  return [...new Set([...extra.serviceTypes, ...(await listNiches()).flatMap((n) => n.cqc?.serviceTypes ?? [])])].sort();
}

export type CqcPoll = { state: "processing" | "done" | "failed"; processed: number; total: number; message?: string };

/** Moves a search along: matches a few locations to Companies House by the provider's name and postcode (free; 600 requests per 5 minutes). */
export async function cqcPoll(searchId: number): Promise<CqcPoll> {
  const counts = async () => { const [c] = await query<any>(`SELECT count(*) AS total, count(*) FILTER (WHERE match IS NOT NULL) AS done FROM cqc_results WHERE search_id = $1`, [searchId]); return { total: Number(c.total), processed: Number(c.done) }; };
  const [s] = await query<any>(`SELECT status, error FROM cqc_searches WHERE id = $1`, [searchId]);
  if (!s) return { state: "failed", processed: 0, total: 0, message: "Search not found." };
  if (s.status !== "processing") return { state: s.status, ...(await counts()), message: s.error ?? undefined };
  try {
    const left = await tx(async (c) => {
      const { rows } = await c.query(`SELECT * FROM cqc_results WHERE search_id = $1 AND match IS NULL ORDER BY id LIMIT 6 FOR UPDATE SKIP LOCKED`, [searchId]);
      for (const r of rows) {
        const phone = normalisePhone(r.phone), dom = r.domain ? String(r.domain).toLowerCase() : null;
        const { rows: [ex] } = await c.query(
          `SELECT id FROM companies WHERE ($1::text IS NOT NULL AND lower(domain) = $1) OR ($2::text IS NOT NULL AND normalise_phone(phone) = $2)
              OR ((lower(name) = lower($3) OR lower(display_name) = lower($4)) AND $5::text IS NOT NULL AND postcode ILIKE $5 || '%') LIMIT 1`,
          [dom, phone, r.provider_name, r.name, r.postcode ? String(r.postcode).split(" ")[0] : null]);
        const { rows: [sup] } = await c.query(`SELECT 1 FROM suppression WHERE ($1::text IS NOT NULL AND lower(domain) = $1) OR ($2::text IS NOT NULL AND phone = $2) LIMIT 1`, [dom, phone]);
        let skip: string | null = sup ? "On your suppression list" : ex ? "Already in the CRM" : null, existing: number | null = ex ? Number(ex.id) : null;
        let m: ReturnType<typeof matchCompanyHouse> = { match: "none", candidate: null };
        if (!skip) {
          m = matchCompanyHouse({ title: r.provider_name, postcode: r.postcode }, await searchByName(r.provider_name));
          await sleep(550);
          if (m.candidate) {
            const { rows: [dup] } = await c.query(`SELECT id FROM companies WHERE company_number = $1`, [m.candidate.number]);
            if (dup) { skip = "Already in the CRM"; existing = Number(dup.id); }
            else if ((await c.query(`SELECT 1 FROM suppression WHERE company_number = $1`, [m.candidate.number])).rows.length) skip = "On your suppression list";
          }
        }
        const eligible = m.candidate ? classifyCompany(m.candidate.type, m.candidate.status).status : "unmatched";
        await c.query(`UPDATE cqc_results SET match = $2, ch_number = $3, ch_name = $4, ch_type = $5, ch_status = $6, eligible = $7, skip_reason = $8, existing_company_id = $9 WHERE id = $1`,
          [r.id, m.match, m.candidate?.number ?? null, m.candidate?.name ?? null, m.candidate?.type ?? null, m.candidate?.status ?? null, eligible, skip, existing]);
      }
      const { rows: [n] } = await c.query(`SELECT count(*) AS n FROM cqc_results WHERE search_id = $1 AND match IS NULL`, [searchId]);
      return Number(n.n);
    });
    if (left === 0) await query(`UPDATE cqc_searches SET status = 'done', finished_at = now() WHERE id = $1`, [searchId]);
    return { state: left === 0 ? "done" : "processing", ...(await counts()) };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/rate limit|not responding/i.test(msg)) return { state: "processing", ...(await counts()), message: msg };   // Companies House busy: the next poll tries again
    await query(`UPDATE cqc_searches SET status = 'failed', error = $2, finished_at = now() WHERE id = $1`, [searchId, msg.slice(0, 300)]);
    return { state: "failed", ...(await counts()), message: msg };
  }
}

type CqcRow = Record<string, any>;
const FOUND_BY = (r: CqcRow) => ({ ...(r.domain ? { website: "cqc register" } : {}), ...(r.phone ? { phone: "cqc register" } : {}), trading_name: "cqc register", ...(r.ch_number ? { company_number: "name match" } : {}) });
/** CQC's location name is what the business trades as; keep it when it differs from the registered name. */
const tradingName = (r: CqcRow, registered: string | null) => (registered && normaliseName(r.name) !== normaliseName(registered) ? String(r.name).slice(0, 160) : null);
const SOURCE = `CQC care directory (${ATTRIBUTION})`;

/** Adds a company from a CQC result (verified limited companies arrive ready to contact, others blocked until checked). Throws 23505 if it is already in the CRM. */
export async function insertCqcRow(r: CqcRow, niche: string): Promise<{ id: number; eligible: boolean }> {
  const eligible = r.eligible === "eligible" && !!r.ch_number;
  const registered = eligible ? r.ch_name : r.provider_name;
  const cols: Record<string, unknown> = {
    name: tidyName(registered), trading_name: tradingName(r, registered), domain: r.domain && safeDomain(r.domain) ? r.domain : null, phone: r.phone, address: r.address, postcode: r.postcode,
    niche, company_number: eligible ? r.ch_number : null, is_ltd: eligible ? true : null, source: "CQC register", status: "New", contact_source: SOURCE,
    consent_basis: eligible ? DEFAULT_CONSENT_BASIS : null, company_type: eligible ? r.ch_type : null, company_status: eligible ? r.ch_status : null,
    compliance_status: eligible ? "eligible" : "unchecked", compliance_checked_at: eligible ? new Date().toISOString() : null,
  };
  const keys = Object.keys(cols);
  const { rows: [co] } = await tx(async (c) => {
    const res = await c.query(`INSERT INTO companies (${keys.join(", ")}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(", ")}) RETURNING id`, keys.map((k) => cols[k]));
    await c.query(`UPDATE cqc_results SET added_at = now() WHERE id = $1`, [r.id]);
    return res;
  });
  await logActivity("lead_added", { company_id: Number(co.id), channel: "cqc", body: `${r.name} (CQC register)`, meta: { found_by: FOUND_BY(r) } });
  return { id: Number(co.id), eligible };
}

/** Adds CQC's details to a company that already exists (added through Companies House or Google Maps in the same search). Existing values are never overwritten. */
export async function patchCompanyFromCqc(where: { companyNumber?: string | null; companyId?: number | null }, r: CqcRow): Promise<void> {
  const [co] = await query<{ id: number; name: string }>(`SELECT id, name FROM companies WHERE ${where.companyId ? "id = $1" : "company_number = $1"}`, [where.companyId ?? where.companyNumber]);
  if (!co) return;
  await query(`UPDATE companies SET trading_name = COALESCE(NULLIF(trading_name, ''), $2), phone = COALESCE(phone, $3), address = COALESCE(address, $4), postcode = COALESCE(postcode, $5),
                 contact_source = CASE WHEN contact_source ILIKE '%CQC%' THEN contact_source ELSE concat_ws(' + ', contact_source, $6::text) END WHERE id = $1`,
    [co.id, tradingName(r, co.name), r.phone, r.address, r.postcode, SOURCE]);
  if (r.domain && safeDomain(r.domain)) {   // the website has its own unique index: skip it quietly if another company already has it
    try { await query(`UPDATE companies SET domain = $2 WHERE id = $1 AND domain IS NULL`, [co.id, r.domain]); } catch (e: any) { if (e?.code !== "23505") throw e; }
  }
  await query(`UPDATE cqc_results SET added_at = now() WHERE id = $1`, [r.id]);
  await logActivity("contact_details_found", { company_id: co.id, channel: "cqc", body: "CQC register details added", meta: { found_by: FOUND_BY(r), via: "lead sourcer" } });
}
