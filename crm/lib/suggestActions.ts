"use server";

import { revalidatePath } from "next/cache";
import { query } from "./db";
import { requireLogin } from "./auth";
import { logActivity } from "./activity";
import { latestResearch, runResearch } from "./research";
import { suggestOffers } from "./offerSuggest";

const FRESH_DAYS = 7;
const refresh = (id: number) => revalidatePath(`/companies/${id}`);
type Out = { error?: string; warnings?: string[] };

/** Free: read their public website (and optionally search the web) and work out the gaps. No AI. */
export async function researchAction(companyId: number, web: boolean): Promise<Out> {
  await requireLogin();
  try { const r = await runResearch(companyId, { web }); refresh(companyId); return { warnings: r.limits.filter((l) => /failed|skipped|Couldn't/.test(l)) }; }
  catch (err) { return { error: err instanceof Error ? err.message : String(err) }; }
}

/** Uses Claude credits, so only on click and within a daily cap. Re-uses research under a week old, otherwise researches first. */
export async function suggestAction(companyId: number, web: boolean): Promise<Out> {
  await requireLogin();
  const cap = Number(process.env.SUGGEST_DAILY_CAP ?? 15) || 15;
  const [{ n }] = await query<{ n: string }>(`SELECT count(*) AS n FROM activities WHERE type = 'offer_suggested' AND occurred_at::date = current_date`);
  if (Number(n) >= cap) return { error: `Daily cap of ${cap} AI suggestions reached. Read the earlier ones, or try again tomorrow.` };
  try {
    let research = await latestResearch(companyId);
    if (!research || Date.now() - new Date(research.created_at).getTime() > FRESH_DAYS * 86_400_000 || (web && !research.web)) research = await runResearch(companyId, { web });
    const { result, model, warnings } = await suggestOffers(companyId, research);
    await query(`INSERT INTO offer_suggestions (company_id, research_id, model, result) VALUES ($1,$2,$3,$4)`, [companyId, research.id, model, JSON.stringify(result)]);
    await logActivity("offer_suggested", { company_id: companyId, body: `${result.suggestions.length} offer idea${result.suggestions.length === 1 ? "" : "s"} drafted (${model})` });
    refresh(companyId);
    return { warnings };
  } catch (err) { return { error: err instanceof Error ? err.message : String(err) }; }
}

export async function deleteSuggestionAction(form: FormData): Promise<void> {
  await requireLogin();
  const [r] = await query<{ company_id: number }>(`DELETE FROM offer_suggestions WHERE id = $1 RETURNING company_id`, [Number(form.get("id"))]);
  if (r) refresh(Number(r.company_id));
}

/** Appends a short summary of a suggestion to the company's notes. */
export async function saveToNotesAction(form: FormData): Promise<{ error?: string } | void> {
  await requireLogin();
  const [r] = await query<{ company_id: number; result: any; created_at: Date }>(`SELECT company_id, result, created_at FROM offer_suggestions WHERE id = $1`, [Number(form.get("id"))]);
  if (!r) return { error: "Suggestion not found." };
  const i = Math.min(2, Math.max(0, Number(form.get("index")) || 0)), s = r.result?.suggestions?.[i];
  if (!s) return { error: "Nothing to save." };
  const stamp = new Date(r.created_at).toLocaleDateString("en-GB", { dateStyle: "medium" });
  const note = `Offer idea (${stamp}): ${s.title}\nAutomation: ${s.automation}\nOutcome: ${s.outcome}\nMeasure: ${s.kpi}\nPilot: ${s.pilot}`;
  await query(`UPDATE companies SET owner_notes = CASE WHEN owner_notes IS NULL OR owner_notes = '' THEN $2 ELSE owner_notes || E'\\n\\n' || $2 END WHERE id = $1`, [r.company_id, note]);
  refresh(Number(r.company_id));
}
