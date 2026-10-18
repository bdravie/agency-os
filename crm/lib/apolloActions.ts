"use server";

import { revalidatePath } from "next/cache";
import { query, tx } from "./db";
import { requireLogin } from "./auth";
import { logActivity } from "./activity";
import { loadGate } from "./complianceGate";
import { apolloRoles } from "./apolloConfig";
import { apolloKey, revealPerson, searchPeople, ApolloError } from "./apollo";
import { apolloSettings, consentText, linkedinProfile, parsePeople, planReveal, rankPeople, workEmail, type Person } from "./apolloMath";

// Finding decision-makers through Apollo. The search is free; revealing a work email uses a credit, so it only runs when you click,
// for people you ticked, inside a per-click and a daily limit. Only for verified active limited companies that pass the outreach gate.
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export type ApolloStatus = {
  configured: boolean; domain: string | null; sendable: boolean; blockedReason: string | null;
  used: number; cap: number; left: number; maxPerClick: number; seniorities: string[]; titles: string[]; saved: number;
};

async function creditsUsedToday(): Promise<number> {
  const [r] = await query<{ n: string }>(`SELECT coalesce(sum(credits), 0) AS n FROM apollo_calls WHERE created_at::date = current_date`);
  return Number(r.n);
}

export async function apolloStatusAction(companyId: number): Promise<ApolloStatus> {
  await requireLogin();
  const s = apolloSettings(), roles = await apolloRoles();
  const [c] = await query<{ domain: string | null }>(`SELECT domain FROM companies WHERE id = $1`, [companyId]);
  const gate = await loadGate(companyId);
  const used = await creditsUsedToday();
  const [{ n }] = await query<{ n: string }>(`SELECT count(*) AS n FROM contacts WHERE company_id = $1 AND source = 'Apollo'`, [companyId]);
  return { configured: !!apolloKey(), domain: c?.domain ?? null, sendable: !!gate?.sendable, blockedReason: gate && !gate.sendable ? gate.reasons.join(" ") : null,
    used, cap: s.dailyCredits, left: Math.max(0, s.dailyCredits - used), maxPerClick: s.maxPerClick, seniorities: roles.seniorities, titles: roles.titles, saved: Number(n) };
}

type Preflight = { error: string } | { domain: string };
async function preflight(companyId: number): Promise<Preflight> {
  if (!apolloKey()) return { error: "The server can't see APOLLO_API_KEY. Add it to .env (or as a Codespaces secret) and restart the CRM." };
  const [c] = await query<{ domain: string | null }>(`SELECT domain FROM companies WHERE id = $1`, [companyId]);
  if (!c) return { error: "Company not found." };
  const gate = await loadGate(companyId);
  if (!gate?.sendable) return { error: `Apollo is only used for verified active limited companies that can be contacted. ${gate?.reasons.join(" ") ?? ""}`.trim() };
  if (!c.domain) return { error: "Add the company's website first: Apollo finds people by their website address." };
  return { domain: c.domain.toLowerCase().replace(/^www\./, "") };
}

export type FoundPerson = Person & { saved: boolean };

/** Free (0 credits). Senior people at the company, with their first name, last initial, job title and whether Apollo holds an email. */
export async function apolloSearchAction(companyId: number): Promise<{ error?: string; people?: FoundPerson[]; total?: number }> {
  await requireLogin();
  const pre = await preflight(companyId);
  if ("error" in pre) return pre;
  try {
    const roles = await apolloRoles();
    const raw: any = await searchPeople({ domain: pre.domain, titles: roles.titles, seniorities: roles.seniorities, includeSimilar: roles.includeSimilar, perPage: 25 });
    await query(`INSERT INTO apollo_calls (company_id, kind, credits, people, note) VALUES ($1,'search',0,$2,$3)`, [companyId, parsePeople(raw).length, pre.domain]);
    const people = rankPeople(parsePeople(raw)).slice(0, 12);
    const have = await query<{ apollo_id: string }>(`SELECT apollo_id FROM contacts WHERE apollo_id = ANY($1)`, [people.map((p) => p.id)]);
    const saved = new Set(have.map((h) => h.apollo_id));
    return { people: people.map((p) => ({ ...p, saved: saved.has(p.id) })), total: Number(raw?.total_entries ?? people.length) };
  } catch (e) { return { error: e instanceof ApolloError ? e.message : "The Apollo search failed." }; }
}

export type RevealResult = { error?: string; saved?: { name: string; title: string | null; email: string; status: string | null }[]; noEmail?: number; skipped?: string[]; credits?: number; note?: string };

/** Uses credits. Reveals work emails for the people you ticked and saves each as a contact with the lawful basis recorded. */
export async function apolloRevealAction(companyId: number, ids: string[]): Promise<RevealResult> {
  await requireLogin();
  const pre = await preflight(companyId);
  if ("error" in pre) return pre;
  const wanted = [...new Set(ids.filter((i) => typeof i === "string" && /^[A-Za-z0-9_-]{1,60}$/.test(i)))].slice(0, 20);
  if (wanted.length === 0) return { error: "Tick at least one person." };
  const s = apolloSettings(), used = await creditsUsedToday();
  const plan = planReveal({ wanted: wanted.length, creditsLeft: s.dailyCredits - used, maxPerClick: s.maxPerClick });
  if (plan.count === 0) return { error: `Today's Apollo credit limit is used up (${used} of ${s.dailyCredits}). Try again tomorrow, or raise APOLLO_DAILY_CREDITS.` };
  try {
    // Only people who really work at this company: re-run the free search and keep the ticked people who appear in it.
    const roles = await apolloRoles();
    const valid = new Set(parsePeople(await searchPeople({ domain: pre.domain, titles: roles.titles, seniorities: roles.seniorities, includeSimilar: roles.includeSimilar, perPage: 25 })).map((p) => p.id));
    const chosen = wanted.filter((i) => valid.has(i)).slice(0, plan.count);
    if (chosen.length === 0) return { error: "Those people weren't found at this company any more. Search again." };

    const saved: NonNullable<RevealResult["saved"]> = [], skipped: string[] = [];
    let credits = 0, noEmail = 0;
    const today = new Date().toLocaleDateString("en-GB", { dateStyle: "medium" });
    for (const id of chosen) {
      const p = await revealPerson(id);
      await sleep(400);
      if (!p?.email) { noEmail++; continue; }
      credits++;   // Apollo charges 1 credit when it returns an email
      const email = workEmail(p.email, pre.domain), name = String(p.name ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
      if (!email || !name) { skipped.push(`${name || "A person"}: the address isn't a work address on ${pre.domain}, so it wasn't saved`); continue; }
      const [sup] = await query(`SELECT 1 FROM suppression WHERE lower(email) = $1 LIMIT 1`, [email]);
      if (sup) { skipped.push(`${name}: on your suppression list`); continue; }
      const [dup] = await query(`SELECT 1 FROM contacts WHERE apollo_id = $1 OR (company_id = $2 AND lower(email) = $3) LIMIT 1`, [id, companyId, email]);
      if (dup) { skipped.push(`${name}: already saved`); continue; }
      const [row] = await query<{ id: number }>(
        `INSERT INTO contacts (company_id, name, role, email, linkedin_url, consent_basis, source, apollo_id, email_status, revealed_at) VALUES ($1,$2,$3,$4,$5,$6,'Apollo',$7,$8,now()) RETURNING id`,
        [companyId, name, String(p.title ?? "").slice(0, 100) || null, email, linkedinProfile(p.linkedin_url), consentText(today), id, String(p.email_status ?? "").slice(0, 30) || null]);
      await logActivity("contact_added", { company_id: companyId, contact_id: Number(row.id), channel: "apollo", body: `${name} (${p.title ?? "senior contact"}) found via Apollo` });
      saved.push({ name, title: p.title ?? null, email, status: p.email_status ?? null });
    }
    await query(`INSERT INTO apollo_calls (company_id, kind, credits, people, note) VALUES ($1,'reveal',$2,$3,$4)`, [companyId, credits, chosen.length, `${saved.length} saved`]);
    revalidatePath(`/companies/${companyId}`);
    return { saved, noEmail, skipped, credits, note: plan.limitedBy ? `Revealed ${chosen.length} of the ${wanted.length} you ticked, to stay inside your ${plan.limitedBy === "credits" ? "daily credit" : "per-click"} limit.` : undefined };
  } catch (e) { return { error: e instanceof ApolloError ? e.message : "Revealing emails failed." }; }
}

// ---------- opting a person out ----------

/** A person asks not to be contacted: they are blocked everywhere and their address goes on the suppression list. */
export async function contactOptOutAction(form: FormData): Promise<{ error?: string } | void> {
  await requireLogin();
  const id = Number(form.get("id")) || 0;
  const [ct] = await query<{ company_id: number | null; name: string; email: string | null; opted_out: boolean }>(`SELECT company_id, name, email, opted_out FROM contacts WHERE id = $1`, [id]);
  if (!ct) return { error: "Contact not found." };
  if (ct.opted_out) return { error: "Already marked as opted out." };
  await tx(async (c) => {
    await c.query(`UPDATE contacts SET opted_out = true, opted_out_at = now() WHERE id = $1`, [id]);
    if (ct.email) await c.query(`INSERT INTO suppression (email, reason, source) VALUES ($1, $2, 'opt_out') ON CONFLICT DO NOTHING`, [ct.email.toLowerCase(), `Opted out: ${ct.name}`]);
  });
  await logActivity("contact_opted_out", { company_id: ct.company_id, contact_id: id, body: `${ct.name} opted out and was added to the suppression list` });
  if (ct.company_id) revalidatePath(`/companies/${ct.company_id}`);
}

/** For a mistake only. */
export async function contactClearOptOutAction(form: FormData): Promise<{ error?: string } | void> {
  await requireLogin();
  const id = Number(form.get("id")) || 0;
  const [ct] = await query<{ company_id: number | null; email: string | null; opted_out: boolean }>(`SELECT company_id, email, opted_out FROM contacts WHERE id = $1`, [id]);
  if (!ct?.opted_out) return { error: "This contact isn't marked as opted out." };
  await tx(async (c) => {
    await c.query(`UPDATE contacts SET opted_out = false, opted_out_at = NULL WHERE id = $1`, [id]);
    if (ct.email) await c.query(`DELETE FROM suppression WHERE source = 'opt_out' AND lower(email) = lower($1)`, [ct.email]);
  });
  await logActivity("contact_opt_out_cleared", { company_id: ct.company_id, contact_id: id, body: "Contact opt-out cleared (recorded by mistake)" });
  if (ct.company_id) revalidatePath(`/companies/${ct.company_id}`);
}
