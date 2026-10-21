"use server";

import { revalidatePath } from "next/cache";
import { query } from "./db";
import { requireLogin } from "./auth";
import { logActivity } from "./activity";
import { containsContactDetails } from "./audit";
import { DEFAULT_CONSENT_BASIS, classifyCompany } from "./compliance";
import { fetchProfile, normaliseNumber } from "./companiesHouse";
import { normaliseEmail, normaliseSocial, normaliseWebsite } from "./contact";
import { findCompanyOnline, type Extra, type Found } from "./findCompany";
import { listNiches } from "./leadConfig";
import { runResearch } from "./research";
import { checkHealthInBackground } from "./apifyAdd";
import { safeDomain } from "./websites";
import { tidyName } from "./apifyMath";

export type FindState = { found?: Found; error?: string } | null;

/** Free (the optional web search uses your search credits). Looks the company up and returns the closest links. Saves nothing. */
export async function findCompanyAction(_prev: FindState, form: FormData): Promise<FindState> {
  await requireLogin();
  const name = String(form.get("name") ?? "").replace(/\s+/g, " ").trim(), place = String(form.get("place") ?? "").replace(/[^A-Za-z0-9 .,'-]/g, "").trim().slice(0, 60);
  if (name.length < 2 || name.length > 100) return { error: "Type the company's name (at least 2 characters)." };
  if (containsContactDetails(name)) return { error: "Type just the company name, without emails or phone numbers." };
  try { return { found: await findCompanyOnline({ name, place, pasted: String(form.get("pasted") ?? "").slice(0, 4000), web: form.get("web") === "on" }) }; }
  catch (e) { return { error: e instanceof Error ? e.message : "The search failed." }; }
}

export type AddInput = { name: string; chNumber: string | null; website: string | null; linkedin: string | null; instagram: string | null; facebook: string | null; email: string | null; niche: string | null; research: boolean };
export type AddResult = { ok?: string; id?: number; existing?: boolean; error?: string };

/**
 * Adds the company, or fills in the blanks of one already in the CRM (it never overwrites what you have). Every value is checked again here: company pages only,
 * generic emails only, and the Companies House record is fetched afresh rather than trusted from the screen.
 */
export async function addFoundAction(input: AddInput): Promise<AddResult> {
  await requireLogin();
  const name = String(input.name ?? "").replace(/\s+/g, " ").trim().slice(0, 100);
  if (name.length < 2 || containsContactDetails(name)) return { error: "Give the company's name, without emails or phone numbers." };

  let profile: Awaited<ReturnType<typeof fetchProfile>> = null;
  const number = input.chNumber ? normaliseNumber(input.chNumber) : null;
  if (input.chNumber && !number) return { error: "That isn't a valid company number." };
  if (number) { try { profile = await fetchProfile(number); } catch (e) { return { error: e instanceof Error ? e.message : "Companies House couldn't be reached." }; } if (!profile) return { error: `Companies House has no company ${number}.` }; }
  const cls = profile ? classifyCompany(profile.type, profile.status) : null;

  const site = input.website ? normaliseWebsite(input.website) : { value: null };
  if (input.website && (site.error || !site.value || !safeDomain(site.value))) return { error: site.error ?? "That isn't a normal public website address." };
  const social = (k: "linkedin" | "instagram" | "facebook") => { const r = normaliseSocial(k, input[k]); return r.error && input[k] ? { error: r.error } : { value: r.value }; };
  const li = social("linkedin"), ig = social("instagram"), fb = social("facebook");
  for (const r of [li, ig, fb]) if ("error" in r) return { error: r.error };
  const em = input.email ? normaliseEmail(input.email) : { value: null };
  if (input.email && em.error) return { error: em.error };
  let niche: string | null = null;
  if (input.niche) { if (!(await listNiches()).some((n) => n.key === input.niche)) return { error: "Choose a niche from the list." }; niche = input.niche; }

  const [blocked] = await query(`SELECT 1 FROM suppression WHERE ($1::text IS NOT NULL AND lower(domain) = $1) OR ($2::text IS NOT NULL AND lower(email) = $2) OR ($3::text IS NOT NULL AND company_number = $3) LIMIT 1`, [site.value, em.value, number]);
  if (blocked) return { error: "This company is on your suppression list, so it can't be added." };

  const [existing] = await query<{ id: number }>(`SELECT id FROM companies WHERE ($1::text IS NOT NULL AND company_number = $1) OR ($2::text IS NOT NULL AND lower(domain) = $2) OR lower(name) = lower($3) ORDER BY id LIMIT 1`, [number, site.value, name]);
  const eligible = cls?.status === "eligible";
  let id: number;
  try {
    if (existing) {
      id = Number(existing.id);
      await query(`UPDATE companies SET domain = COALESCE(domain, $2), linkedin_url = COALESCE(linkedin_url, $3), instagram_url = COALESCE(instagram_url, $4), facebook_url = COALESCE(facebook_url, $5),
          generic_email = COALESCE(generic_email, $6), niche = COALESCE(niche, $7), contact_source = COALESCE(contact_source, 'Lead Sourcer: found by company name') WHERE id = $1`, [id, site.value, li.value, ig.value, fb.value, em.value, niche]);
      if (profile && number) {   // a company number is only filled in when the company has none, and only if nothing else uses it
        const [clash] = await query(`SELECT 1 FROM companies WHERE company_number = $1 AND id <> $2`, [number, id]);
        if (!clash) await query(`UPDATE companies SET company_number = $2, company_type = $3, company_status = $4, is_ltd = $5, compliance_status = $6, compliance_checked_at = now(), consent_basis = COALESCE(consent_basis, $7)
            WHERE id = $1 AND company_number IS NULL`, [id, number, profile.type || null, profile.status || null, ["ltd", "llp", "plc"].includes(profile.type), cls!.status, eligible ? DEFAULT_CONSENT_BASIS : null]);
      }
    } else {
      const [row] = await query<{ id: number }>(
        `INSERT INTO companies (name, domain, linkedin_url, instagram_url, facebook_url, generic_email, niche, company_number, is_ltd, company_type, company_status, compliance_status, compliance_checked_at, consent_basis, source, contact_source, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'Lead Sourcer (single company)','Lead Sourcer: found by company name','New') RETURNING id`,
        [profile ? tidyName(profile.name) : name, site.value, li.value, ig.value, fb.value, em.value, niche, number, profile ? ["ltd", "llp", "plc"].includes(profile.type) : null, profile?.type || null, profile?.status || null,
         cls?.status ?? "unchecked", profile ? new Date().toISOString() : null, eligible ? DEFAULT_CONSENT_BASIS : null]);
      id = Number(row.id);
      await logActivity("lead_added", { company_id: id, channel: "sourcer", body: `${name} added by name search` });
    }
  } catch (e: any) {
    if (e?.code === "23505") return { error: "Something with that website or company number is already in the CRM." };
    throw e;
  }
  if (number) checkHealthInBackground();
  if (input.research) { try { await runResearch(id, { web: false }); } catch { /* the company is saved either way */ } }
  revalidatePath("/companies"); revalidatePath(`/companies/${id}`);
  return { ok: existing ? "Filled in the missing details on the existing company." : eligible ? "Added: a verified active limited company, ready to contact once you have a way to reach them." : number ? `Added, but it is blocked from outreach: ${cls?.reason}` : "Added. It isn't matched to a limited company yet, so outreach stays blocked until you look it up on Companies House.", id, existing: !!existing };
}

export type AutoField = "domain" | "generic_email" | "linkedin_url" | "instagram_url" | "facebook_url" | "contact_url";
export type AutoResult = {
  error?: string; fields?: Partial<Record<AutoField, { value: string; confidence: string; how: string }>>; verified?: string | null;
  signals?: Record<string, boolean> | null; notes?: string[]; ranWeb?: boolean; emails?: string[];
  web?: { ran: boolean; results: number; matched: string[]; query: string | null };
  extras?: Extra[];
};

/**
 * The Contact details auto-search. Free: guesses the website (it must prove it is theirs), reads the site for its social pages, generic email and contact page.
 * Paid: also searches the web (1 search credit, inside your daily cap) for what guessing can't find. It only suggests; you check the boxes and click Save.
 */
export async function autoSearchAction(companyId: number, current: Record<string, string>, paid: boolean): Promise<AutoResult> {
  await requireLogin();
  const [c] = await query<{ name: string; postcode: string | null; company_number: string | null; opted_out: boolean; suppressed: boolean }>(
    `SELECT c.name, c.postcode, c.company_number, g.opted_out, g.suppressed FROM companies c JOIN lead_gate g ON g.company_id = c.id WHERE c.id = $1`, [companyId]);
  if (!c) return { error: "Company not found." };
  if (c.opted_out || c.suppressed) return { error: "This company has opted out or is on your suppression list, so nothing is searched for it." };
  const pasted = ["domain", "linkedin_url", "instagram_url", "facebook_url", "contact_url"].map((k) => String(current[k] ?? "").slice(0, 300)).filter(Boolean).join("\n");   // what you already have counts as given
  let found: Found;
  try { found = await findCompanyOnline({ name: c.name, place: c.postcode ?? "", pasted, web: paid, knownNumber: c.company_number }); }
  catch (e) { return { error: e instanceof Error ? e.message : "The search failed." }; }
  const fields: AutoResult["fields"] = {};
  const set = (k: AutoField, value: string | null | undefined, t: { confidence: string; how: string }) => { if (value) fields[k] = { value, confidence: t.confidence, how: t.how }; };
  for (const l of found.links) {
    if (l.confidence === "given") continue;   // already in your boxes
    set(l.kind === "website" ? "domain" : (`${l.kind}_url` as AutoField), l.value, l);
  }
  if (found.emails[0]) set("generic_email", found.emails[0], { confidence: "high", how: "shown on their website (company addresses only)" });
  if (found.contactUrl) set("contact_url", found.contactUrl, { confidence: "high", how: "their contact page" });
  const web = found.links.find((l) => l.kind === "website");
  return { fields, verified: web && web.confidence !== "given" && /company number/.test(web.how) ? "company number" : web && web.confidence !== "given" && /name/.test(web.how) ? "name" : null, signals: found.signals, extras: found.extras, notes: found.notes, ranWeb: found.webRan, emails: found.emails, web: found.web };
}
