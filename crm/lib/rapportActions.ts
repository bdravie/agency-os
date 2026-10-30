"use server";

import { revalidatePath } from "next/cache";
import { query } from "./db";
import { requireLogin } from "./auth";
import { runRapport, type RapportResult } from "./rapport";

/** Click-only. Looks for professional things this saved decision-maker has said, done or published, with a source for each. Nothing is sent. */
export async function findRapportAction(contactId: number): Promise<{ error?: string; result?: RapportResult }> {
  await requireLogin();
  try {
    const result = await runRapport(contactId);
    const [c] = await query<{ company_id: number | null }>(`SELECT company_id FROM contacts WHERE id = $1`, [contactId]);
    if (c?.company_id) revalidatePath(`/companies/${c.company_id}`);
    return { result };
  } catch (e) { return { error: e instanceof Error ? e.message : "The search failed." }; }
}

/** Removes everything saved about this person's rapport points (for example if they ask). */
export async function clearRapportAction(contactId: number): Promise<{ error?: string }> {
  await requireLogin();
  const [c] = await query<{ company_id: number | null }>(`SELECT company_id FROM contacts WHERE id = $1`, [contactId]);
  if (!c) return { error: "Contact not found." };
  await query(`DELETE FROM contact_rapport WHERE contact_id = $1`, [contactId]);
  if (c.company_id) revalidatePath(`/companies/${c.company_id}`);
  return {};
}
