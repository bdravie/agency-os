import { query } from "./db";
import { sessionStatus, type SessionStatus } from "./enablementMath";
import { todayIso } from "./outcomeData";

export type TrainingRow = {
  id: number; name: string; retained: boolean; since: string | null; lastSession: string | null; nextScheduled: string | null;
  staff: number; avgSkill: number | null; status: SessionStatus;
};

/** Every client with a service or any training on record, with the 30-day check. Bigint columns arrive as strings, so numbers are converted here. */
export async function loadTraining(): Promise<TrainingRow[]> {
  const today = todayIso();
  const rows = await query<any>(`
    SELECT c.id, c.name,
           COALESCE(bool_or(s.status = 'Active' AND s.monthly_fee_gbp > 0), false) AS retained,
           to_char(min(s.start_date) FILTER (WHERE s.status = 'Active' AND s.monthly_fee_gbp > 0), 'YYYY-MM-DD') AS since,
           (SELECT to_char(max(e.held_on), 'YYYY-MM-DD') FROM enablement_sessions e WHERE e.company_id = c.id) AS last_session,
           (SELECT to_char(min(h.next_on), 'YYYY-MM-DD') FROM enablement_schedules h WHERE h.company_id = c.id AND h.status = 'active') AS next_scheduled,
           (SELECT count(*) FROM enablement_staff t WHERE t.company_id = c.id AND t.active) AS staff,
           (SELECT avg(t.skill_level)::float8 FROM enablement_staff t WHERE t.company_id = c.id AND t.active) AS avg_skill
      FROM companies c LEFT JOIN client_services s ON s.company_id = c.id
     WHERE EXISTS (SELECT 1 FROM client_services x WHERE x.company_id = c.id)
        OR EXISTS (SELECT 1 FROM enablement_sessions x WHERE x.company_id = c.id)
        OR EXISTS (SELECT 1 FROM enablement_staff x WHERE x.company_id = c.id)
     GROUP BY c.id, c.name ORDER BY c.name`);
  return rows.map((r: any) => ({
    id: Number(r.id), name: r.name, retained: r.retained, since: r.since, lastSession: r.last_session, nextScheduled: r.next_scheduled,
    staff: Number(r.staff), avgSkill: r.avg_skill === null ? null : Math.round(r.avg_skill * 10) / 10,
    status: sessionStatus({ retained: r.retained, lastSession: r.last_session, since: r.since, today }),
  }));
}

/** Retained clients that are 30+ days without a session, longest gap first. */
export const dueForSession = (rows: TrainingRow[]) =>
  rows.filter((r) => r.status.due).sort((a, b) => (b.status.days ?? 9999) - (a.status.days ?? 9999));
