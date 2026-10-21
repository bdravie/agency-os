"use server";

import { revalidatePath } from "next/cache";
import { query } from "./db";
import { requireLogin } from "./auth";
import { logActivity } from "./activity";
import { isMethodKind, methodLabel, normaliseMethod } from "./contactMethods.ts";
import { safeDomain } from "./websites";

const MAX_PER_COMPANY = 20;

/** Adds one extra contact method (TikTok, other social page, secondary email or phone…) to a company. Company-level only, checked again here. */
export async function addContactMethodAction(companyId: number, kind: string, value: string, note?: string, source: "manual" | "auto-search" = "manual"): Promise<{ error?: string; added?: string }> {
  await requireLogin();
  if (!isMethodKind(kind)) return { error: "Choose a type." };
  const r = normaliseMethod(kind, value);
  if (!r.value) return { error: r.error ?? "That value isn't valid." };
  const [c] = await query<{ id: number }>(`SELECT id FROM companies WHERE id = $1`, [companyId]);
  if (!c) return { error: "Company not found." };
  if (/^https?:\/\//.test(r.value)) { let h = ""; try { h = new URL(r.value).hostname; } catch { /* checked below */ } if (!h || !safeDomain(h.replace(/^www\./, ""))) return { error: "That isn't a normal public web address." }; }
  if (kind === "email_secondary") {
    const [sup] = await query(`SELECT 1 FROM suppression WHERE lower(email) = $1 OR lower(domain) = $2 LIMIT 1`, [r.value, r.value.split("@")[1]]);
    if (sup) return { error: "That email or its domain is on your suppression list. Don't contact it." };
  }
  const [{ n }] = await query<{ n: string }>(`SELECT count(*) AS n FROM company_contact_methods WHERE company_id = $1`, [companyId]);
  if (Number(n) >= MAX_PER_COMPANY) return { error: `That's the limit of ${MAX_PER_COMPANY} extra contact methods for one company.` };
  const rows = await query<{ id: number }>(
    `INSERT INTO company_contact_methods (company_id, kind, value, note, source) VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING RETURNING id`,
    [companyId, kind, r.value, (note ?? "").replace(/\s+/g, " ").trim().slice(0, 80) || null, source]);
  if (rows.length === 0) return { error: "That one is already saved for this company." };
  await logActivity("contact_details_updated", { company_id: companyId, body: `Added ${methodLabel(kind)}` });
  revalidatePath(`/companies/${companyId}`);
  return { added: r.value };
}

export async function removeContactMethodAction(form: FormData): Promise<{ error?: string } | void> {
  await requireLogin();
  const [r] = await query<{ company_id: number; kind: string }>(`DELETE FROM company_contact_methods WHERE id = $1 RETURNING company_id, kind`, [Number(form.get("id")) || 0]);
  if (!r) return { error: "Not found." };
  await logActivity("contact_details_updated", { company_id: Number(r.company_id), body: `Removed ${methodLabel(r.kind)}` });
  revalidatePath(`/companies/${r.company_id}`);
}
