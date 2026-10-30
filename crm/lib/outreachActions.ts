"use server";

import { query } from "./db";
import { requireLogin } from "./auth";
import { loadGate } from "./complianceGate";
import { outreachDrafts, type Draft } from "./outreach";

export type OutreachResult = { error?: string; drafts?: { first: Draft; followup: Draft; social: Draft } };

/** Writes the outreach drafts, only when you click. Same gate as sending: the company must be a verified active limited company that may be contacted,
 *  and a named person must not have opted out or be suppressed. Nothing is sent; the drafts are for you to read, edit and send yourself. */
export async function generateOutreachAction(companyId: number, contactId: number | null): Promise<OutreachResult> {
  await requireLogin();
  const gate = await loadGate(companyId);
  if (!gate?.sendable) return { error: `Outreach is blocked for this lead. ${gate?.reasons.join(" ") ?? ""}`.trim() };
  const [c] = await query<{ display_name: string }>(`SELECT display_name FROM companies WHERE id = $1`, [companyId]);
  if (!c) return { error: "Company not found." };
  let firstName: string | null = null;
  if (contactId) {
    const [ct] = await query<{ name: string; sendable: boolean }>(`SELECT ct.name, cg.sendable FROM contacts ct JOIN contact_gate cg ON cg.contact_id = ct.id WHERE ct.id = $1 AND ct.company_id = $2`, [contactId, companyId]);
    if (!ct) return { error: "That person isn't a contact at this company." };
    if (!ct.sendable) return { error: `${ct.name} has opted out, is suppressed, or has no email address, so no draft is written for them.` };
    firstName = ct.name.split(/\s+/)[0] || null;
  }
  const d = await outreachDrafts(c.display_name, { firstName });
  return { drafts: { first: d.first, followup: d.followUp, social: d.social } };
}
