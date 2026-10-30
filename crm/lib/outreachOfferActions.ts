"use server";

import { query } from "./db";
import { requireLogin } from "./auth";
import { logActivity } from "./activity";
import { loadGate } from "./complianceGate";
import { writeOfferParts } from "./outreachOfferCopy";
import { outreachDrafts, shortName } from "./outreach";
import { assembleOfferDrafts, type Assembled } from "./outreachOfferMath";
import type { SuggestionResult } from "./offerSuggestNormalise";

export type OfferOutreachResult = { error?: string; drafts?: Assembled; templateNote?: string };

/** Click-only. Writes the outreach email around ONE of the offers found for this company. The AI writes only the offer wording; the greeting, your name, business name and the opt-out
 *  line are added by code, and the result must pass hard checks (length, no numbers, links or boasts). Same gates as sending. Nothing is sent. */
export async function generateOfferOutreachAction(companyId: number, suggestionId: number, index: number, contactId: number | null): Promise<OfferOutreachResult> {
  await requireLogin();
  const gate = await loadGate(companyId);
  if (!gate?.sendable) return { error: `Outreach is blocked for this lead. ${gate?.reasons.join(" ") ?? ""}`.trim() };
  const [c] = await query<{ display_name: string; niche: string | null }>(`SELECT display_name, niche FROM companies WHERE id = $1`, [companyId]);
  if (!c) return { error: "Company not found." };
  let firstName: string | null = null;
  if (contactId) {
    const [ct] = await query<{ name: string; sendable: boolean }>(`SELECT ct.name, cg.sendable FROM contacts ct JOIN contact_gate cg ON cg.contact_id = ct.id WHERE ct.id = $1 AND ct.company_id = $2`, [contactId, companyId]);
    if (!ct) return { error: "That person isn't a contact at this company." };
    if (!ct.sendable) return { error: `${ct.name} has opted out, is suppressed, or has no email address, so no draft is written for them.` };
    firstName = ct.name.split(/\s+/)[0] || null;
  }
  const [row] = await query<{ result: SuggestionResult }>(`SELECT result FROM offer_suggestions WHERE id = $1 AND company_id = $2`, [suggestionId, companyId]);
  const s = row?.result?.suggestions?.[Math.max(0, Math.min(2, Math.floor(index) || 0))];
  if (!row || !s) return { error: "That offer idea wasn't found. Run the offer suggestion again." };

  const style = (await outreachDrafts(c.display_name, { niche: c.niche })).first;
  const { parts, problems } = await writeOfferParts(shortName(c.display_name), c.niche, s, style);
  if (!parts || problems.length) return { error: `The AI's email didn't pass the checks (${problems[0]}). Try again, or use the standard template.` };

  // The opening sentence is the research's own opener (tied to findings from their website) when it has one; otherwise a placeholder for you to fill in.
  const drafts = assembleOfferDrafts(parts, { firstName, company: shortName(c.display_name), opener: row.result.opener, name: process.env.SENDER_NAME?.trim() || null, business: process.env.BUSINESS_NAME?.trim() || null });
  await logActivity("outreach_drafted", { company_id: companyId, contact_id: contactId, channel: "email", body: `Outreach tailored to: ${s.title}` });
  return { drafts, templateNote: `Tailored to the offer: ${s.title}.${s.needs_dpa ? " This one needs a data processing agreement before anything touches their customers' details; the email says so." : ""}${row.result.opener ? "" : " Fill in the opening line: the research found nothing specific to open with."}` };
}
