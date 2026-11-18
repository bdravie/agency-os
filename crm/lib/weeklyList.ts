import { readFile } from "node:fs/promises";
import path from "node:path";
import { parse } from "yaml";
import { query } from "./db";
import { nicheTable } from "./nicheGate";
import { canOutreach } from "./nicheStatus";
import { loadNicheTargets } from "./nicheTargets";
import { apolloKey } from "./apollo";
import { parseListSize, readCandidates, splitByNiche, type NicheShare } from "./weeklyListMath";
import type { Person } from "./apolloMath";

// Lead Sourcer > This week, server side (not actions: nothing here is callable from the browser). The rules are weeklyListMath.ts.

const ROOT = path.resolve(process.cwd(), "..");
/** Monday of this week, UK time, as a date (the same week as the Dashboard's cards). */
export const WEEK_DAY = `(date_trunc('week', now() AT TIME ZONE 'Europe/London'))::date`;

export async function listSize(): Promise<number> {
  const raw = await readFile(path.join(ROOT, "config/targets.yaml"), "utf8").then((t) => parse(t)).catch(() => ({}));
  return parseListSize(raw);
}

/** The niches a list may draw from: the ones whose status and channels allow email right now, each with its weekly email target. */
export async function emailNiches(): Promise<(NicheShare & { label: string })[]> {
  const [t, targets] = await Promise.all([nicheTable(), loadNicheTargets()]);
  return Object.values(t).filter((n) => canOutreach(t, n.key, "email")).map((n) => ({ key: n.key, label: n.label, emails: targets.byNiche[n.key]?.emails ?? 0 }));
}

/**
 * Companies that could go on a list: in one of these niches, verified on Companies House and passing the outreach gate (a bypass does not count:
 * Apollo keeps the strict rule), with a website, not skipped by the suitability score, never contacted, with no deal, and not already on this week's list.
 */
export async function eligibleCompanies(niches: string[]): Promise<{ id: number; niche: string; suitability: number }[]> {
  if (niches.length === 0) return [];
  const rows = await query<{ id: string; niche: string; score: number }>(
    `SELECT co.id, co.niche, su.score
       FROM companies co JOIN lead_gate g ON g.company_id = co.id JOIN lead_suitability su ON su.company_id = co.id
      WHERE g.sendable AND co.compliance_status = 'eligible' AND co.domain IS NOT NULL AND co.niche = ANY($1) AND su.tier <> 'Skip'
        AND NOT EXISTS (SELECT 1 FROM activities a WHERE a.company_id = co.id AND a.type IN ('email_logged', 'dm_logged', 'linkedin_note_logged'))
        AND NOT EXISTS (SELECT 1 FROM deals d WHERE d.company_id = co.id)
        AND NOT EXISTS (SELECT 1 FROM weekly_leads w WHERE w.company_id = co.id AND w.week_start = ${WEEK_DAY})
      ORDER BY su.score DESC, co.id LIMIT 2000`, [niches]);
  return rows.map((r) => ({ id: Number(r.id), niche: r.niche, suitability: Number(r.score) }));
}

export type WeeklyRow = {
  id: number; companyId: number; company: string; domain: string | null; niche: string; nicheLabel: string; suitability: number; tier: string;
  searched: boolean; note: string | null; candidates: Person[]; chosen: string | null; contactId: number | null;
  /** When the build that added it ran: a sortable key (exact to the microsecond, shared by one build) and a UK-time label. */
  addedKey: string; addedLabel: string;
  /** Why this company can no longer be worked on (it opted out, was suppressed or its niche changed since the list was built), or null. */
  blocked: string | null;
};
export type WeeklyView = {
  rows: WeeklyRow[]; size: number; weekStart: string; apolloReady: boolean;
  niches: { key: string; label: string; share: number; onList: number; waiting: number }[];
};

export async function loadWeeklyList(): Promise<WeeklyView> {
  const [size, niches, t] = await Promise.all([listSize(), emailNiches(), nicheTable()]);
  const [raw, [wk], waiting] = await Promise.all([
    query<any>(
      `SELECT w.id, w.company_id, co.name, co.domain, w.niche, w.suitability, su.tier, w.searched_at, w.search_note, w.candidates, w.apollo_id, w.contact_id,
              g.sendable, co.compliance_status, co.niche AS niche_now,
              to_char(w.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US') AS added_key,
              to_char(w.created_at AT TIME ZONE 'Europe/London', 'FMDay HH24:MI') AS added_label
         FROM weekly_leads w JOIN companies co ON co.id = w.company_id JOIN lead_gate g ON g.company_id = co.id JOIN lead_suitability su ON su.company_id = co.id
        WHERE w.week_start = ${WEEK_DAY} ORDER BY w.suitability DESC, w.id`),
    query<{ d: string }>(`SELECT to_char(${WEEK_DAY}, 'YYYY-MM-DD') AS d`),
    eligibleCompanies(niches.map((n) => n.key)),
  ]);
  const rows: WeeklyRow[] = raw.map((r) => ({
    id: Number(r.id), companyId: Number(r.company_id), company: r.name, domain: r.domain, niche: r.niche, nicheLabel: t[r.niche]?.label ?? r.niche, suitability: Number(r.suitability), tier: r.tier,
    searched: !!r.searched_at, note: r.search_note, candidates: readCandidates(r.candidates), chosen: r.apollo_id, contactId: r.contact_id === null ? null : Number(r.contact_id),
    addedKey: r.added_key, addedLabel: r.added_label,
    blocked: !r.sendable || r.compliance_status !== "eligible" ? "No longer passes the outreach gate." : !canOutreach(t, r.niche_now, "email") ? "Its niche no longer uses email." : null,
  }));
  const alloc = splitByNiche(size, niches);
  return {
    rows, size, weekStart: wk.d, apolloReady: !!apolloKey(),
    niches: niches.map((n) => ({ key: n.key, label: n.label, share: alloc[n.key] ?? 0, onList: rows.filter((r) => r.niche === n.key).length, waiting: waiting.filter((w) => w.niche === n.key).length })),
  };
}
