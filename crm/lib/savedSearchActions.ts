"use server";

import { revalidatePath } from "next/cache";
import { query } from "./db";
import { requireLogin } from "./auth";
import { listNiches } from "./leadConfig";
import { parseSourcerForm, type SourcerFilters } from "./sourcerFilters";

// Saved Lead Sourcer searches: the brief only (niche, area, sources, filters), never results. Loading one fills in the form and runs nothing.

const MAX_SAVED = 30;

export type SavedSearch = { id: number; name: string; filters: SourcerFilters };
export type SaveState = { ok?: string; error?: string };

export async function listSavedSearches(): Promise<SavedSearch[]> {
  await requireLogin();
  const rows = await query<{ id: number; name: string; filters: SourcerFilters }>(`SELECT id, name, filters FROM saved_searches ORDER BY lower(name)`);
  return rows.map((r) => ({ id: Number(r.id), name: r.name, filters: r.filters }));
}

/** Saves what is in the form now. Re-reads it with the same rules as a real search, so only valid choices are stored. Saving the same name again replaces it. */
export async function saveSearchAction(name: string, form: FormData): Promise<SaveState> {
  await requireLogin();
  const parsed = parseSourcerForm((k) => { const v = form.get(k); return typeof v === "string" ? v : null; });
  if (!parsed.ok) return { error: parsed.error };
  const f = parsed.filters;
  const niche = (await listNiches()).find((n) => n.key === f.niche);
  if (!niche) return { error: "Choose a niche from the list." };
  const label = (name.trim() || `${niche.label} in ${f.location}`).slice(0, 80);
  const [{ n, same }] = await query<{ n: number; same: boolean }>(`SELECT count(*)::int AS n, bool_or(lower(btrim(name)) = lower(btrim($1))) AS same FROM saved_searches`, [label]);
  if (n >= MAX_SAVED && !same) return { error: `You can keep ${MAX_SAVED} saved searches. Delete one first.` };
  await query(
    `INSERT INTO saved_searches (name, niche, location, filters) VALUES ($1,$2,$3,$4)
     ON CONFLICT (lower(btrim(name))) DO UPDATE SET name = EXCLUDED.name, niche = EXCLUDED.niche, location = EXCLUDED.location, filters = EXCLUDED.filters, updated_at = now()`,
    [label, f.niche, f.location, JSON.stringify(f)]);
  revalidatePath("/sourcer");
  return { ok: `Saved as "${label}".` };
}

export async function deleteSavedSearchAction(id: number): Promise<SaveState> {
  await requireLogin();
  await query(`DELETE FROM saved_searches WHERE id = $1`, [id]);
  revalidatePath("/sourcer");
  return { ok: "Deleted." };
}
