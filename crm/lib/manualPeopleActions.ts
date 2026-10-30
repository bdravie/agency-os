"use server";

import { revalidatePath } from "next/cache";
import { query } from "./db";
import { requireLogin } from "./auth";
import { logActivity } from "./activity";
import { loadGate } from "./complianceGate";
import { manualConsentText, parsePastedPeople } from "./manualPeople";

export type PasteResult = { error?: string; saved?: { name: string; role: string | null; via: string }[]; skipped?: string[] };

/** Saves decision-makers pasted in by hand. Same checks as the Apollo import: the company must pass the outreach gate, only a work email on its own domain or a LinkedIn profile is kept, suppressed and duplicate people are skipped. Nothing is ever sent. */
export async function addPastedPeopleAction(companyId: number, text: string): Promise<PasteResult> {
  await requireLogin();
  const [c] = await query<{ domain: string | null }>(`SELECT domain FROM companies WHERE id = $1`, [companyId]);
  if (!c) return { error: "Company not found." };
  const gate = await loadGate(companyId);
  if (!gate?.sendable) return { error: `People are only added for verified active limited companies that can be contacted. ${gate?.reasons.join(" ") ?? ""}`.trim() };
  const domain = c.domain ? c.domain.toLowerCase().replace(/^www\./, "") : null;
  const parsed = parsePastedPeople(text, domain);
  if (parsed.error) return { error: parsed.error };
  if (parsed.people.length === 0) return { error: parsed.skipped[0] ? "Nobody could be saved. See the notes below." : "Paste at least one person.", skipped: parsed.skipped };

  const saved: NonNullable<PasteResult["saved"]> = [], skipped = [...parsed.skipped];
  const today = new Date().toLocaleDateString("en-GB", { dateStyle: "medium" });
  for (const p of parsed.people) {
    if (p.email) {
      const [sup] = await query(`SELECT 1 FROM suppression WHERE lower(email) = $1 OR lower(domain) = $2 LIMIT 1`, [p.email, domain]);
      if (sup) { skipped.push(`${p.name}: on your suppression list`); continue; }
    }
    const [dup] = await query(`SELECT 1 FROM contacts WHERE company_id = $1 AND ((email IS NOT NULL AND lower(email) = $2) OR (linkedin_url IS NOT NULL AND linkedin_url = $3)) LIMIT 1`, [companyId, p.email, p.linkedin]);
    if (dup) { skipped.push(`${p.name}: already saved`); continue; }
    const [row] = await query<{ id: number }>(
      `INSERT INTO contacts (company_id, name, role, email, linkedin_url, consent_basis, source) VALUES ($1,$2,$3,$4,$5,$6,'Manual paste') RETURNING id`,
      [companyId, p.name, p.role, p.email, p.linkedin, manualConsentText(today)]);
    await logActivity("contact_added", { company_id: companyId, contact_id: Number(row.id), channel: "manual", body: `${p.name} (${p.role ?? "decision-maker"}) added by hand` });
    saved.push({ name: p.name, role: p.role, via: p.email ?? "LinkedIn" });
  }
  revalidatePath(`/companies/${companyId}`);
  return { saved, skipped };
}
