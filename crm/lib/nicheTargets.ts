import { readFile } from "node:fs/promises";
import path from "node:path";
import { parse } from "yaml";
import { query } from "./db";
import { nicheTable } from "./nicheGate";
import { elapsedFractions } from "./paceMath";
import { LINKEDIN_FORMAT } from "./linkedinMath";
import { contentMix, nichePaceRows, parseNicheTargets, stopRuleHit, type MixRow, type MixWarning, type NichePaceRow, type NicheTargets, type NicheWeekActual } from "./nicheTargetsMath";

// Per-niche weekly targets, the stop rule and the content mix (docs/NICHE_FOCUS_PLAN.md, N4). Server side; the maths is nicheTargetsMath.ts.

const ROOT = path.resolve(process.cwd(), "..");
/** Monday 00:00 this week, UK time, as a timestamptz (the same week as the Dashboard's cards). */
const WEEK_START = `(date_trunc('week', now() AT TIME ZONE 'Europe/London') AT TIME ZONE 'Europe/London')`;
/** The same Monday as a plain date, for scheduled_for (a date column; casting WEEK_START would use the database's time zone). */
const WEEK_DAY = `(date_trunc('week', now() AT TIME ZONE 'Europe/London'))::date`;

export async function loadNicheTargets(): Promise<NicheTargets> {
  const raw = await readFile(path.join(ROOT, "config/targets.yaml"), "utf8").then((t) => parse(t)).catch(() => ({}));
  return parseNicheTargets(raw);
}

/** The Dashboard's "This week by niche" rows. */
export async function loadNichePace(now = new Date()): Promise<NichePaceRow[]> {
  const [t, targets, sends, posts] = await Promise.all([
    nicheTable(),
    loadNicheTargets(),
    query<{ key: string; type: string; n: string }>(
      `SELECT c.niche AS key, a.type, count(*) AS n FROM activities a JOIN companies c ON c.id = a.company_id
        WHERE a.type IN ('email_logged', 'dm_logged', 'linkedin_note_logged') AND a.occurred_at >= ${WEEK_START} AND c.niche IS NOT NULL
        GROUP BY c.niche, a.type`),
    query<{ key: string; platform: string; n: string }>(
      `SELECT i.niche AS key, p.platform, count(*) AS n FROM posts p JOIN content_items i ON i.id = p.content_item_id
        WHERE p.posted_at >= ${WEEK_START} AND i.niche IS NOT NULL GROUP BY i.niche, p.platform`),
  ]);
  const actual: Record<string, NicheWeekActual> = {};
  const row = (k: string) => (actual[k] ??= { emails: 0, instagram_dms: 0, linkedin_notes: 0, posts: {} });
  const kind: Record<string, "emails" | "instagram_dms" | "linkedin_notes"> = { email_logged: "emails", dm_logged: "instagram_dms", linkedin_note_logged: "linkedin_notes" };
  for (const s of sends) row(s.key)[kind[s.type]] += Number(s.n);
  for (const p of posts) { const r = row(p.key); (r.posts as Record<string, number>)[p.platform] = Number(p.n); }
  return nichePaceRows(t, targets, actual, elapsedFractions(now).week);
}

export type StopRow = { key: string; label: string; touches: number; calls: number; since: string | null; hit: boolean };

/**
 * For each active niche: touches (logged emails, DMs and LinkedIn notes) since its offer or promise last changed on the Niches screen,
 * and calls booked from it in the same time (CRM meetings, deals moved to Call booked, calendar events with a saved contact the CRM did not book).
 */
export async function loadStopRule(): Promise<StopRow[]> {
  const t = await nicheTable();
  const active = Object.values(t).filter((n) => n.status === "active");
  if (!active.length) return [];
  const rows = await query<{ key: string; since: string | null; touches: string; calls: string }>(
    `WITH n AS (
       SELECT k AS key, (SELECT max(occurred_at) FROM activities WHERE type = 'niche_offer_changed' AND meta->>'niche' = k) AS since FROM unnest($1::text[]) AS k
     )
     SELECT n.key, n.since,
       (SELECT count(*) FROM activities a JOIN companies c ON c.id = a.company_id
         WHERE c.niche = n.key AND a.type IN ('email_logged', 'dm_logged', 'linkedin_note_logged') AND a.occurred_at >= COALESCE(n.since, '-infinity')) AS touches,
       (SELECT count(*) FROM (
          SELECT COALESCE(m.company_id, ct.company_id) AS company_id FROM meetings m LEFT JOIN contacts ct ON ct.id = m.contact_id
           WHERE m.status = 'scheduled' AND m.created_at >= COALESCE(n.since, '-infinity')
          UNION ALL
          SELECT d.company_id FROM stage_history h JOIN deals d ON d.id = h.deal_id
           WHERE h.to_stage = 'Call booked' AND h.source = 'app' AND h.changed_at >= COALESCE(n.since, '-infinity')
          UNION ALL
          SELECT e.company_id FROM calendar_events e
           WHERE e.company_id IS NOT NULL AND e.meeting_id IS NULL AND e.status <> 'cancelled' AND e.starts_at >= COALESCE(n.since, '-infinity')
        ) x JOIN companies c ON c.id = x.company_id WHERE c.niche = n.key) AS calls
     FROM n`, [active.map((n) => n.key)]);
  return rows.map((r) => {
    const touches = Number(r.touches), calls = Number(r.calls);
    return { key: r.key, label: t[r.key].label, touches, calls, since: r.since, hit: stopRuleHit("active", touches, calls) };
  });
}

/** This week's planned content per platform against posts_by_platform, with a warning for anything planned on a platform its niche does not use. */
export async function loadContentMix(): Promise<{ rows: MixRow[]; warnings: MixWarning[] }> {
  const [t, targets, items] = await Promise.all([
    nicheTable(),
    loadNicheTargets(),
    query<{ id: string; idea: string; niche: string | null; format: string | null; platforms: string[] | null }>(
      `SELECT id, idea, niche, format, platforms FROM content_items
        WHERE status <> 'Archived' AND scheduled_for >= ${WEEK_DAY} AND scheduled_for < ${WEEK_DAY} + 7 ORDER BY scheduled_for, id`),
  ]);
  return contentMix(t, targets, items.map((i) => ({ ...i, id: Number(i.id) })), LINKEDIN_FORMAT);
}
