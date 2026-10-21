"use server";

import { revalidatePath } from "next/cache";
import { query } from "./db";
import { requireLogin } from "./auth";
import { logActivity } from "./activity";
import { companyChangedSince, latestResearch, runResearch } from "./research";
import { suggestOffers } from "./offerSuggest";
import { loadGate } from "./complianceGate";
import { recomputeDeal } from "./offerActions";
import { buildPlan, contactRoutes, planTasks } from "./dealPlan";
import { checklistFrom } from "./dealOffers";

const FRESH_DAYS = 7;
const refresh = (id: number) => revalidatePath(`/companies/${id}`);
type Out = { error?: string; warnings?: string[] };

/** Free: read their public website (and optionally search the web) and work out the gaps. No AI. */
export async function researchAction(companyId: number, web: boolean): Promise<Out> {
  await requireLogin();
  try { const r = await runResearch(companyId, { web }); refresh(companyId); return { warnings: r.limits.filter((l) => /failed|skipped|Couldn't/.test(l)) }; }
  catch (err) { return { error: err instanceof Error ? err.message : String(err) }; }
}

/** Uses Claude credits, so only on click and within a daily cap. Re-uses research under a week old that is still up to date with the company's record, otherwise researches first. */
export async function suggestAction(companyId: number, web: boolean): Promise<Out> {
  await requireLogin();
  const cap = Number(process.env.SUGGEST_DAILY_CAP ?? 15) || 15;
  const [{ n }] = await query<{ n: string }>(`SELECT count(*) AS n FROM activities WHERE type = 'offer_suggested' AND occurred_at::date = current_date`);
  if (Number(n) >= cap) return { error: `Daily cap of ${cap} AI suggestions reached. Read the earlier ones, or try again tomorrow.` };
  try {
    let research = await latestResearch(companyId);
    if (!research || Date.now() - new Date(research.created_at).getTime() > FRESH_DAYS * 86_400_000 || (web && !research.web) || await companyChangedSince(companyId, research)) research = await runResearch(companyId, { web });
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

/** Turns one AI suggestion into a deal: the catalogue offer (if it matched) with its price, a written plan with the best way to contact them as a note, and two first tasks. Free: no AI call, and nothing is sent. */
export async function addSuggestionAsDealAction(suggestionId: number, index: number): Promise<{ id?: number; error?: string }> {
  await requireLogin();
  const [r] = await query<{ company_id: number; result: any; research_id: number | null; created_at: Date }>(`SELECT company_id, result, research_id, created_at FROM offer_suggestions WHERE id = $1`, [suggestionId]);
  const s = r?.result?.suggestions?.[Math.min(2, Math.max(0, Math.floor(index) || 0))];
  if (!r || !s) return { error: "Suggestion not found." };
  const companyId = Number(r.company_id);
  const [c] = await query<any>(`SELECT name, generic_email, instagram_url, linkedin_url, facebook_url, contact_url, phone FROM companies WHERE id = $1`, [companyId]);
  if (!c) return { error: "Company not found." };
  const [dup] = await query(`SELECT 1 FROM deals WHERE company_id = $1 AND lower(title) = lower($2) LIMIT 1`, [companyId, s.title]);
  if (dup) return { error: "A deal with this title is already on the Deals tab for this company." };

  const gate = await loadGate(companyId);
  const contacts = await query<any>(`SELECT id, name, role, email, opted_out FROM contacts WHERE company_id = $1 AND email IS NOT NULL ORDER BY id`, [companyId]);
  const routes = contactRoutes({ ...c, sendable: !!gate?.sendable, contacts });
  const research = r.research_id ? await query<{ findings: any }>(`SELECT findings FROM company_research WHERE id = $1`, [r.research_id]) : [];
  const titles = new Map<string, string>((Array.isArray(research[0]?.findings) ? research[0].findings : []).map((f: any) => [String(f.id), String(f.title)]));
  const plan = buildPlan({ companyName: c.name, suggestion: s, findingTitles: (s.finding_ids ?? []).map((id: string) => titles.get(id)).filter(Boolean) as string[],
    opener: r.result.opener ?? null, questions: Array.isArray(r.result.questions) ? r.result.questions : [], routes, blockedReason: gate && !gate.sendable ? gate.reasons.join(" ") : undefined,
    date: new Date(r.created_at).toLocaleDateString("en-GB", { dateStyle: "medium" }) });

  const best = routes[0];
  const [deal] = await query<{ id: number }>(
    `INSERT INTO deals (company_id, contact_id, title, source, channel) VALUES ($1,$2,$3,'ai_suggestion',$4) RETURNING id`, [companyId, best?.contactId ?? null, String(s.title).slice(0, 120), best?.channel ?? null]);
  const dealId = Number(deal.id);
  const [o] = s.offer_name ? await query<any>(`SELECT id, billing, setup_price_gbp, monthly_price_gbp, default_duration_days, deliverables FROM offers WHERE lower(name) = lower($1) AND active`, [s.offer_name]) : [];
  if (o && ["one_off", "setup", "monthly"].includes(o.billing)) {
    await query(`INSERT INTO deal_offers (deal_id, offer_id, billing, price_gbp, duration_days, checklist) VALUES ($1,$2,$3,$4,$5,$6::jsonb)`,
      [dealId, o.id, o.billing, Number(o.billing === "monthly" ? o.monthly_price_gbp : o.setup_price_gbp), o.default_duration_days, JSON.stringify(checklistFrom(o.deliverables))]);
    await recomputeDeal(dealId);
  }
  for (const t of planTasks(routes)) await query(`INSERT INTO tasks (title, due_at, company_id, deal_id) VALUES ($1, now() + make_interval(days => $2), $3, $4)`, [t.title, t.dueInDays, companyId, dealId]);
  await logActivity("deal_created", { company_id: companyId, deal_id: dealId, body: `${s.title} (from an AI suggestion)` });
  await logActivity("note_logged", { company_id: companyId, deal_id: dealId, channel: "note", body: plan });
  refresh(companyId); revalidatePath("/deals"); revalidatePath("/tasks"); revalidatePath("/");
  return { id: dealId };
}
