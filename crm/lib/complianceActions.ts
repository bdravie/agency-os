"use server";

import { revalidatePath } from "next/cache";
import { query, tx } from "./db";
import { requireLogin } from "./auth";
import { logActivity } from "./activity";
import { containsContactDetails } from "./audit";
import { DEFAULT_CONSENT_BASIS, classifyCompany, normalisePhone, parseSuppressionLines, typeLabel, type SuppressionEntry } from "./compliance";
import { fetchProfile, normaliseNumber, pickExact, searchByName, type ChCandidate, type ChProfile } from "./companiesHouse";

const str = (f: FormData, k: string) => { const v = String(f.get(k) ?? "").trim(); return v === "" ? null : v; };
const num = (f: FormData, k: string) => Number(str(f, k) ?? 0) || 0;
const refresh = (companyId?: number) => { revalidatePath("/companies"); revalidatePath("/suppression"); revalidatePath("/"); if (companyId) revalidatePath(`/companies/${companyId}`); };

// ---------- Companies House lookup ----------

export type LookupState = { ok?: string; error?: string; candidates?: ChCandidate[]; eligible?: boolean } | null;

/** Writes what Companies House says onto the lead. Returns an error instead of throwing, for the screen to show. */
async function apply(companyId: number, p: ChProfile): Promise<{ error?: string; ok?: string; eligible?: boolean }> {
  const c = classifyCompany(p.type, p.status);
  const eligible = c.status === "eligible";
  try {
    await query(
      `UPDATE companies SET company_number = $2, company_type = $3, company_status = $4, is_ltd = $5, ch_status_detail = $6, compliance_status = $7, compliance_checked_at = now(),
              consent_basis = COALESCE(consent_basis, $8) WHERE id = $1`,
      [companyId, p.number, p.type || null, p.status || null, ["ltd", "llp", "plc"].includes(p.type), p.statusDetail, c.status, eligible ? DEFAULT_CONSENT_BASIS : null]);
  } catch (e: any) {
    if (e?.code === "23505") {
      const [other] = await query<{ id: number; name: string }>(`SELECT id, name FROM companies WHERE company_number = $1 AND id <> $2`, [p.number, companyId]);
      return { error: `Company number ${p.number} is already on another lead${other ? `: ${other.name} (#${other.id})` : ""}. Delete or merge the duplicate first.` };
    }
    throw e;
  }
  await logActivity("compliance_checked", { company_id: companyId, channel: "companies_house", body: `${p.name} (${p.number}): ${typeLabel(p.type)}, ${p.status}${eligible ? " - eligible" : ` - NOT eligible: ${c.reason}`}` });
  refresh(companyId);
  return { eligible, ok: eligible ? `Verified: ${typeLabel(p.type)}, active (${p.number}). This lead can be contacted.` : `Checked, but this lead is blocked: ${c.reason}` };
}

/** Look a lead up on Companies House by number (typed, or already saved) or, failing that, by name. Free; never saves a guess. */
export async function lookupCompanyAction(_prev: LookupState, form: FormData): Promise<LookupState> {
  await requireLogin();
  const companyId = num(form, "company_id");
  const [co] = await query<{ name: string; company_number: string | null }>(`SELECT name, company_number FROM companies WHERE id = $1`, [companyId]);
  if (!co) return { error: "Company not found." };
  try {
    const typed = str(form, "number");
    let number = typed ? normaliseNumber(typed) : co.company_number ? normaliseNumber(co.company_number) : null;
    if (typed && !number) return { error: "That doesn't look like a company number (8 characters, e.g. 01234567 or SC123456)." };
    if (!number) {
      const candidates = await searchByName(co.name);
      const hit = pickExact(co.name, candidates);
      if (!hit) return candidates.length
        ? { candidates, error: "No exact match for the name. Choose the right company below, or type its number." }
        : { error: "Nothing found for that name. Type the company number instead." };
      number = normaliseNumber(hit.number);
    }
    const profile = number ? await fetchProfile(number) : null;
    if (!profile) return { error: `Companies House has no company numbered ${number}.` };
    return await apply(companyId, profile);
  } catch (err) { return { error: err instanceof Error ? err.message : String(err) }; }
}

export type VerifyState = { message: string; error?: boolean } | null;

/** Checks up to 25 unchecked leads that already have a company number (paced to respect the API limit). */
export async function verifyUncheckedAction(): Promise<VerifyState> {
  await requireLogin();
  const rows = await query<{ id: number; company_number: string }>(`SELECT id, company_number FROM companies WHERE compliance_status = 'unchecked' AND company_number IS NOT NULL ORDER BY id LIMIT 25`);
  const [{ n }] = await query<{ n: string }>(`SELECT count(*) AS n FROM companies WHERE compliance_status = 'unchecked'`);
  if (rows.length === 0) return { message: Number(n) ? `${n} unchecked lead${Number(n) === 1 ? " has" : "s have"} no company number. Open each and look it up by name.` : "Everything has been checked." };
  let eligible = 0, blocked = 0, notFound = 0;
  try {
    for (const r of rows) {
      const p = await fetchProfile(r.company_number);
      if (!p) { notFound++; continue; }
      const res = await apply(Number(r.id), p);
      if (res.error) { notFound++; continue; }
      res.eligible ? eligible++ : blocked++;
      await new Promise((ok) => setTimeout(ok, 550));
    }
  } catch (err) { return { message: err instanceof Error ? err.message : String(err), error: true }; }
  return { message: `Checked ${rows.length}: ${eligible} eligible, ${blocked} blocked, ${notFound} not found. ${Math.max(0, Number(n) - rows.length)} left to check.` };
}

export async function saveComplianceNotes(form: FormData): Promise<{ error?: string } | void> {
  await requireLogin();
  const id = num(form, "id"), basis = str(form, "consent_basis"), source = str(form, "contact_source");
  if (containsContactDetails(basis) || containsContactDetails(source)) return { error: "Describe the source in words, without email addresses or phone numbers." };
  await query(`UPDATE companies SET consent_basis = $2, contact_source = $3 WHERE id = $1`, [id, basis?.slice(0, 300) ?? null, source?.slice(0, 200) ?? null]);
  refresh(id);
}

// ---------- opting out ----------

/** Records an opt-out: blocks the lead, adds it to the global suppression list, and cancels its follow-up tasks. */
export async function optOutAction(form: FormData): Promise<{ error?: string } | void> {
  await requireLogin();
  const id = num(form, "id"), note = str(form, "note");
  if (containsContactDetails(note)) return { error: "Describe how they opted out in words, without email addresses or phone numbers." };
  const [co] = await query<any>(`SELECT name, domain, generic_email, company_number, phone, opted_out FROM companies WHERE id = $1`, [id]);
  if (!co) return { error: "Company not found." };
  if (co.opted_out) return { error: "Already marked as opted out." };
  await tx(async (c) => {
    await c.query(`UPDATE companies SET opted_out = true, opted_out_at = now(), opt_out_note = $2 WHERE id = $1`, [id, note?.slice(0, 300) ?? null]);
    const reason = `Opted out${note ? `: ${note.slice(0, 120)}` : ""} (${co.name})`;
    for (const e of [co.domain && { domain: String(co.domain).toLowerCase() }, co.generic_email && { email: String(co.generic_email).toLowerCase() }, co.company_number && { company_number: co.company_number }, co.phone && normalisePhone(co.phone) && { phone: normalisePhone(co.phone)! }].filter(Boolean) as SuppressionEntry[]) {
      await c.query(`INSERT INTO suppression (domain, email, phone, company_number, reason, source) VALUES ($1,$2,$3,$4,$5,'opt_out') ON CONFLICT DO NOTHING`, [e.domain ?? null, e.email ?? null, e.phone ?? null, e.company_number ?? null, reason]);
    }
    await c.query(`UPDATE tasks SET done_at = now() WHERE company_id = $1 AND done_at IS NULL AND title ILIKE '%follow-up%'`, [id]);
  });
  await logActivity("opted_out", { company_id: id, body: `${co.name} opted out${note ? `: ${note}` : ""}. Added to the suppression list.` });
  refresh(id);
}

/** For a mistake only. Removes the flag and the suppression entries that the opt-out created. */
export async function clearOptOutAction(form: FormData): Promise<{ error?: string } | void> {
  await requireLogin();
  const id = num(form, "id");
  const [co] = await query<any>(`SELECT name, domain, generic_email, company_number, phone FROM companies WHERE id = $1 AND opted_out`, [id]);
  if (!co) return { error: "This lead isn't marked as opted out." };
  await tx(async (c) => {
    await c.query(`UPDATE companies SET opted_out = false, opted_out_at = NULL, opt_out_note = NULL WHERE id = $1`, [id]);
    await c.query(`DELETE FROM suppression WHERE source = 'opt_out' AND (lower(domain) = lower($1) OR lower(email) = lower($2) OR company_number = $3 OR phone = $4)`, [co.domain, co.generic_email, co.company_number, normalisePhone(co.phone)]);
  });
  await logActivity("opt_out_cleared", { company_id: id, body: `Opt-out cleared for ${co.name} (recorded as a mistake)` });
  refresh(id);
}

// ---------- the global suppression list ----------

async function insertEntries(entries: SuppressionEntry[], reason: string | null, source: "manual" | "import"): Promise<number> {
  let added = 0;
  await tx(async (c) => {
    for (const e of entries) {
      const r = await c.query(`INSERT INTO suppression (domain, email, phone, company_number, reason, source) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING`, [e.domain ?? null, e.email ?? null, e.phone ?? null, e.company_number ?? null, reason, source]);
      added += r.rowCount ?? 0;
    }
  });
  return added;
}

export type SuppressionState = { ok?: string; error?: string; rejected?: string[] } | null;

/** Add one or many entries (email, domain, phone number or company number, one per line). */
export async function addSuppressionAction(_prev: SuppressionState, form: FormData): Promise<SuppressionState> {
  await requireLogin();
  const { entries, rejected } = parseSuppressionLines(String(form.get("entries") ?? ""));
  const reason = str(form, "reason")?.slice(0, 200) ?? null;
  if (containsContactDetails(reason)) return { error: "Keep the reason short and in words (no emails or phone numbers)." };
  if (entries.length === 0) return { error: "Paste at least one email, website, phone number or company number.", rejected };
  const added = await insertEntries(entries, reason, entries.length > 1 ? "import" : "manual");
  await logActivity("suppression_added", { body: `${added} entr${added === 1 ? "y" : "ies"} added to the suppression list` });
  refresh();
  return { ok: `Added ${added} (${entries.length - added} already on the list).`, rejected };
}

export async function removeSuppressionAction(form: FormData): Promise<void> {
  await requireLogin();
  const [r] = await query<any>(`DELETE FROM suppression WHERE id = $1 RETURNING domain, email, phone, company_number`, [num(form, "id")]);
  if (r) await logActivity("suppression_removed", { body: `Removed from the suppression list: ${r.email ?? r.domain ?? r.phone ?? r.company_number}` });
  refresh();
}
