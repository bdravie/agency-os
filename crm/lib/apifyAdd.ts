import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { query, tx } from "./db";
import { logActivity } from "./activity";
import { DEFAULT_CONSENT_BASIS } from "./compliance";
import { normaliseSocial } from "./contact";
import { tidyName } from "./apifyMath";
import { ROOT } from "./launch";

// Turning a Google Maps result into a company in the CRM. A plain server module: the actions that call it check you are logged in first.

type MapsRow = Record<string, any>;
const social = (r: MapsRow, k: "linkedin" | "instagram" | "facebook") => normaliseSocial(k, (r.socials ?? {})[k]).value;
const contactSource = (r: MapsRow) => ["Google Maps listing (via Apify)", (r.emails ?? [])[0] ? "company website (via Apify contact enrichment)" : ""].filter(Boolean).join(" + ");

/** Inserts a company from a Maps result (verified limited companies arrive ready to contact, others blocked until checked). Throws a unique-violation (23505) if it is already in the CRM. */
export async function insertApifyRow(r: MapsRow, niche: string | null): Promise<{ id: number; eligible: boolean }> {
  const eligible = r.eligible === "eligible" && !!r.ch_number;
  const cols: Record<string, unknown> = {
    name: eligible ? tidyName(r.ch_name) : tidyName(r.title), domain: r.domain, phone: r.phone, address: r.address, postcode: r.postcode, city: r.city, latitude: r.latitude, longitude: r.longitude,
    niche, company_number: eligible ? r.ch_number : null, is_ltd: eligible ? true : null, source: "Apify Google Maps", status: "New", generic_email: (r.emails ?? [])[0] ?? null,
    linkedin_url: social(r, "linkedin"), instagram_url: social(r, "instagram"), facebook_url: social(r, "facebook"), contact_source: contactSource(r),
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
  await logActivity("lead_added", { company_id: Number(co.id), channel: "apify", body: `${r.title}${r.priority != null ? ` (priority ${r.priority})` : ""}` });
  return { id: Number(co.id), eligible };
}

/** Adds the Google Maps details to a company that already exists (one that came in through Companies House). Existing values are never overwritten. */
export async function patchCompanyFromMaps(companyNumber: string, r: MapsRow): Promise<void> {
  const base = `UPDATE companies SET phone = COALESCE(phone, $2), generic_email = COALESCE(generic_email, $3), city = COALESCE(city, $4), latitude = COALESCE(latitude, $5), longitude = COALESCE(longitude, $6),
    linkedin_url = COALESCE(linkedin_url, $7), instagram_url = COALESCE(instagram_url, $8), facebook_url = COALESCE(facebook_url, $9),
    maps_place_id = COALESCE(maps_place_id, $10), maps_url = $11, maps_rating = $12, maps_reviews = $13, maps_categories = $14,
    contact_source = CASE WHEN contact_source ILIKE '%Google Maps%' THEN contact_source ELSE concat_ws(' + ', contact_source, $15::text) END WHERE company_number = $1`;
  const args = [companyNumber, r.phone, (r.emails ?? [])[0] ?? null, r.city, r.latitude, r.longitude, social(r, "linkedin"), social(r, "instagram"), social(r, "facebook"), r.place_id, r.maps_url, r.rating, r.reviews, r.categories, contactSource(r)];
  await query(base, args);
  if (r.domain) {   // the website has its own unique index: skip it quietly if another company already has it
    try { await query(`UPDATE companies SET domain = $2 WHERE company_number = $1 AND domain IS NULL`, [companyNumber, r.domain]); } catch (e: any) { if (e?.code !== "23505") throw e; }
  }
  await query(`UPDATE apify_results SET added_at = now() WHERE id = $1`, [r.id]);
}

/** Fetches filing health and the fit score for newly added limited companies (free, in the background). */
export function checkHealthInBackground() {
  const venv = path.join(ROOT, ".venv", "bin", "python");
  const [cmd, args] = existsSync(venv) ? [venv, ["-m", "agency.ch_health"]] : ["uv", ["run", "python", "-m", "agency.ch_health"]];
  execFile(cmd, args, { cwd: ROOT, env: process.env, timeout: 600_000 }, () => { /* results land in the database */ });
}
