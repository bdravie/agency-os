"use server";

import { revalidatePath } from "next/cache";
import { query } from "./db";
import { requireLogin } from "./auth";
import { logActivity } from "./activity";
import { nicheBlockFor } from "./nicheGate";
import { apolloRoles } from "./apolloConfig";
import { searchPeople, ApolloError } from "./apollo";
import { apolloPreflight } from "./apolloPreflight";
import { parsePeople } from "./apolloMath";
import { WEEK_DAY, eligibleCompanies, emailNiches, listSize } from "./weeklyList";
import { pickCompanies, readCandidates, splitByNiche, suggestPerson } from "./weeklyListMath";

// Lead Sourcer > This week. Building the list and finding people are both free: the list is made from companies already in the CRM,
// and Apollo's people search uses no credits. Nothing here reveals an email, spends a credit or sends anything.

const PATH = "/sourcer";

/** Fills this week's list up to its size with the best companies waiting, shared between the niches that use email. Free; adds nothing twice. */
export async function buildWeeklyListAction(): Promise<{ error?: string; added?: number; total?: number }> {
  await requireLogin();
  const [size, niches] = await Promise.all([listSize(), emailNiches()]);
  if (niches.length === 0) return { error: "No niche uses email right now, so there is nothing to build a list from. Set a niche to active with email on the Niches screen." };
  const have = await query<{ niche: string; n: string }>(`SELECT niche, count(*) AS n FROM weekly_leads WHERE week_start = ${WEEK_DAY} GROUP BY niche`);
  const taken: Record<string, number> = {};
  let onList = 0;
  for (const h of have) { taken[h.niche] = Number(h.n); onList += Number(h.n); }
  if (onList >= size) return { added: 0, total: onList };
  const picked = pickCompanies(splitByNiche(size, niches), await eligibleCompanies(niches.map((n) => n.key)), taken).slice(0, size - onList);
  if (picked.length === 0) return { error: onList ? "No more companies are waiting: every eligible one is already on the list." : "No companies are ready yet. A company needs to be verified on Companies House, have a website and not have been contacted. Add more from Search." };
  const rows = await query<{ id: string }>(
    `INSERT INTO weekly_leads (week_start, company_id, niche, suitability)
     SELECT ${WEEK_DAY}, x.id, x.niche, x.suitability FROM jsonb_to_recordset($1::jsonb) AS x(id bigint, niche text, suitability integer)
     ON CONFLICT (week_start, company_id) DO NOTHING RETURNING id`, [JSON.stringify(picked)]);
  await logActivity("weekly_list_built", { body: `This week's list: ${rows.length} compan${rows.length === 1 ? "y" : "ies"} added`, meta: { added: rows.length } });
  revalidatePath(PATH);
  return { added: rows.length, total: onList + rows.length };
}

/**
 * Free (0 credits). Apollo's people search for one company on the list; saves the few most senior people it found (first name, last initial, job title)
 * and suggests one. The same checks as the company page's search, plus the niche gate, are made again here.
 */
export async function searchWeeklyLeadAction(id: number): Promise<{ error?: string; found?: number; chosen?: boolean }> {
  await requireLogin();
  const [row] = await query<{ company_id: string }>(`SELECT company_id FROM weekly_leads WHERE id = $1 AND week_start = ${WEEK_DAY}`, [id]);
  if (!row) return { error: "That company is not on this week's list." };
  const companyId = Number(row.company_id);
  const pre = await apolloPreflight(companyId);
  if ("error" in pre) return pre;
  const nicheBlock = await nicheBlockFor(companyId, "email");
  if (nicheBlock) return { error: nicheBlock };
  try {
    const roles = await apolloRoles();
    const people = parsePeople(await searchPeople({ domain: pre.domain, titles: roles.titles, seniorities: roles.seniorities, includeSimilar: roles.includeSimilar, perPage: 25 }));
    await query(`INSERT INTO apollo_calls (company_id, kind, credits, people, note) VALUES ($1,'search',0,$2,$3)`, [companyId, people.length, `weekly list: ${pre.domain}`]);
    const s = suggestPerson(people);
    await query(`UPDATE weekly_leads SET searched_at = now(), search_note = $2, candidates = $3::jsonb, apollo_id = $4 WHERE id = $1`,
      [id, s.note, JSON.stringify(s.candidates.map(({ id: pid, firstName, lastInitial, title, hasEmail }) => ({ id: pid, firstName, lastInitial, title, hasEmail }))), s.chosen]);
    return { found: people.length, chosen: !!s.chosen };
  } catch (e) { return { error: e instanceof ApolloError ? e.message : "The Apollo search failed." }; }
}

/** Swaps the suggested person for another of the people the free search found (or none, to leave the company out of the reveal). */
export async function chooseWeeklyPersonAction(id: number, apolloId: string | null): Promise<{ error?: string } | void> {
  await requireLogin();
  const [row] = await query<{ candidates: unknown; contact_id: string | null }>(`SELECT candidates, contact_id FROM weekly_leads WHERE id = $1`, [id]);
  if (!row) return { error: "That company is not on the list any more." };
  if (row.contact_id) return { error: "This person's email has already been revealed." };
  if (apolloId !== null && !readCandidates(row.candidates).some((p) => p.id === apolloId)) return { error: "Pick one of the people found for this company." };
  await query(`UPDATE weekly_leads SET apollo_id = $2 WHERE id = $1`, [id, apolloId]);
  revalidatePath(PATH);
}

/** Takes a company off this week's list (it stays in the CRM, and what the free search found for it is deleted with the row). */
export async function removeWeeklyLeadAction(id: number): Promise<{ error?: string } | void> {
  await requireLogin();
  await query(`DELETE FROM weekly_leads WHERE id = $1`, [id]);
  revalidatePath(PATH);
}
