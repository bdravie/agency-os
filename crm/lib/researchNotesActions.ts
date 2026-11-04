"use server";

import { revalidatePath } from "next/cache";
import { query } from "./db";
import { requireLogin } from "./auth";
import { checkResearchNotes } from "./researchNotes";

/** Saves the owner's notes on a company. Costs nothing and calls no AI: they are read the next time Suggest is clicked. */
export async function saveResearchNotesAction(companyId: number, text: string): Promise<{ error?: string }> {
  await requireLogin();
  const { notes, error } = checkResearchNotes(text);
  if (error) return { error };
  if (notes) await query(`INSERT INTO company_research_notes (company_id, notes) VALUES ($1,$2) ON CONFLICT (company_id) DO UPDATE SET notes = EXCLUDED.notes, updated_at = now()`, [companyId, notes]);
  else await query(`DELETE FROM company_research_notes WHERE company_id = $1`, [companyId]);
  revalidatePath(`/companies/${companyId}`);
  return {};
}
