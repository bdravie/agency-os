"use server";

import { revalidatePath } from "next/cache";
import { query } from "./db";
import { requireLogin } from "./auth";
import { logActivity } from "./activity";
import { checkSite, fetchPage, guessWebsite, verifyPage, type Verified } from "./sitecheck";
import { findCompanyOnline } from "./findCompany";
import { lookupWebsite } from "./places";
import { creditUsage } from "./usage";
import { normaliseEmail, normaliseSocial } from "./contact";
import { safeDomain } from "./websites";
import { gapUpdates, reachable, type GapField, type GapValues } from "./fillGapsMath";
import type { FoundBy } from "./siteMatchMath";

// Lead Sourcer > Enrich > Fill in the gaps (docs/LEAD_SOURCER_PLAN.md, step 3). One company per call, so the screen can show progress and stop.
// The chain stops at the first confident website: (1) a guess from the trading and registered names, kept only if the page shows the company
// number or full name (free); (2) a web search (one search credit, inside SEARCH_DAILY_CAP); (3) Google Places (inside PLACES_DAILY_CAP), kept only
// if the page then shows the company. Steps 2 and 3 run only when you ticked "use paid lookups". Then their own website is read (free) for generic
// emails, company social pages and a contact page. Only empty fields are filled, and every save records which step found what.

export type GapResult = { error?: string; found: string[]; tried: string[]; reachable: boolean; note?: string };

export async function fillGapsAction(companyId: number, paid: boolean): Promise<GapResult> {
  await requireLogin();
  const [c] = await query<any>(
    `SELECT c.id, c.display_name, c.name, c.postcode, c.phone, c.company_number, c.domain, c.generic_email, c.linkedin_url, c.instagram_url, c.facebook_url, c.contact_url,
            g.opted_out, g.suppressed
       FROM companies c JOIN lead_gate g ON g.company_id = c.id WHERE c.id = $1`, [companyId]);
  if (!c) return { error: "Company not found.", found: [], tried: [], reachable: false };
  if (c.opted_out || c.suppressed) return { error: "Opted out or on your suppression list, so nothing is looked up for it.", found: [], tried: [], reachable: false };

  const tried: string[] = [], steps: Partial<Record<GapField, FoundBy[string]>> = {};
  const names = [...new Set([c.display_name, c.name].filter(Boolean) as string[])];
  let domain: string | null = c.domain, verified: Verified | null = null, note: string | undefined;

  if (!domain) {   // 1. free guess, from the trading name first
    tried.push("website guess");
    for (const name of names) {
      const g = await guessWebsite({ name, company_number: c.company_number }).catch(() => null);
      if (g) { domain = g.domain; verified = g.verified; steps.domain = "website guess"; break; }
    }
  }
  const usage = paid && !domain ? await creditUsage() : null;
  if (!domain && usage?.search.enabled && usage.search.used < usage.search.cap) {   // 2. web search (paid)
    tried.push("web search");
    const f = await findCompanyOnline({ name: names[0], place: c.postcode ?? "", pasted: "", web: true, knownNumber: c.company_number }).catch(() => null);
    const w = f?.links.find((l) => l.kind === "website" && (l.confidence === "high" || l.confidence === "medium"));
    if (w && safeDomain(w.value)) { domain = w.value; verified = /company number/.test(w.how) ? "company number" : "name"; steps.domain = "web search"; }
  }
  if (!domain && usage && usage.places.used < usage.places.cap && process.env.GOOGLE_PLACES_API_KEY) {   // 3. Google Places (paid)
    tried.push("Google Places");
    const hit = await lookupWebsite({ name: names[0], postcode: c.postcode }).catch(() => null);
    await logActivity("places_lookup", { company_id: c.id, channel: "google_places", body: hit ? `${hit.domain} (matched "${hit.matchedName}")` : "no confident match" });
    if (hit && safeDomain(hit.domain)) {
      const html = await fetchPage(hit.domain).catch(() => null);
      const v = html ? names.map((name) => verifyPage(html, { name, company_number: c.company_number })).find(Boolean) ?? null : null;
      if (v) { domain = hit.domain; verified = v; steps.domain = "google places"; }
      else note = `Google suggested ${hit.domain}, but that page doesn't show the company's number or name, so it wasn't saved.`;
    }
  }

  // 4. Their own website (free): generic emails on its domain, company social pages, a contact page.
  const found: GapValues = { domain: domain !== c.domain ? domain : null };
  if (domain) {
    tried.push("their website");
    const f = await checkSite(domain).catch(() => null);
    if (f) {
      const put = (k: GapField, v: string | null) => { if (v) { found[k] = v; steps[k] = "website"; } };
      put("generic_email", normaliseEmail(f.emails[0] ?? "").value);
      put("linkedin_url", normaliseSocial("linkedin", f.linkedin ?? "").value);
      put("instagram_url", normaliseSocial("instagram", f.instagram ?? "").value);
      put("facebook_url", normaliseSocial("facebook", f.facebook ?? "").value);
      put("contact_url", normaliseSocial("contact", f.contact_url ?? "").value);
    } else note ??= `${domain} couldn't be read (it may block automated readers).`;
  }
  if (found.domain || found.generic_email) {   // never save a suppressed website or email
    const bad = await query<{ d: string | null; e: string | null }>(`SELECT lower(domain) AS d, lower(email) AS e FROM suppression WHERE ($1::text IS NOT NULL AND lower(domain) = $1) OR ($2::text IS NOT NULL AND lower(email) = $2)`,
      [found.domain?.toLowerCase() ?? null, found.generic_email?.toLowerCase() ?? null]);
    if (bad.some((b) => b.d)) return { error: `${found.domain} is on your suppression list, so nothing was saved.`, found: [], tried, reachable: false };
    if (bad.some((b) => b.e)) found.generic_email = null;
  }

  const plan = gapUpdates(c, found, steps);
  const write = async (set: GapValues) => {
    const keys = Object.keys(set) as GapField[];
    if (!keys.length) return;
    // COALESCE again in SQL, so a value typed in another tab meanwhile is never overwritten.
    await query(`UPDATE companies SET ${keys.map((k, i) => `${k} = COALESCE(NULLIF(${k}, ''), $${i + 2})`).join(", ")}${set.domain ? `, domain_verified = COALESCE(domain_verified, $${keys.length + 2})` : ""} WHERE id = $1`,
      [c.id, ...keys.map((k) => set[k]), ...(set.domain ? [verified] : [])]);
  };
  try { await write(plan.set); }
  catch (e: any) {
    if (!String(e?.message ?? "").includes("companies_domain_uniq")) throw e;
    const { domain: _dup, ...rest } = plan.set;   // another company already has that website: keep the rest, flag the likely duplicate
    await write(rest); plan.labels.splice(plan.labels.indexOf("website"), 1); delete plan.foundBy.website;
    note = `Another company in the CRM already has ${found.domain}: it may be a duplicate.`;
  }
  const after = { ...c, ...Object.fromEntries(Object.entries(plan.set).filter(([, v]) => v)) };
  await logActivity("contact_details_found", { company_id: c.id, channel: "enrich", body: `Fill in the gaps: ${plan.labels.length ? plan.labels.join(", ") : "nothing new found"}`,
    meta: { found_by: plan.foundBy, tried, via: "fill gaps", paid } });
  revalidatePath("/sourcer"); revalidatePath(`/companies/${c.id}`);
  return { found: plan.labels, tried, reachable: reachable(after), note };
}
