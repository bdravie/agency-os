import { query } from "./db";
import { getConnection, calendarToken } from "./gcalAuth";
import { listEvents } from "./gcal";
import { addDays, dayKey, groupByDay, ukDayStart, weekOf, type CalEvent } from "./meetingMath";

// Reads for the Calendar page and the Dashboard card. Events come from the saved copy of the owner's business calendar (table `calendar_events`,
// kept up to date by calendarSync.ts about once a minute), so these pages never wait on Google. Meetings booked from the CRM are in `meetings`.

export type CalendarItem = {
  key: string; kind: "event" | "meeting" | "task" | "content"; title: string; sub: string | null;
  start: Date; end: Date; allDay: boolean; meetUrl: string | null; link: string | null; href: string | null; done?: boolean;
};

export type WeekView = {
  connected: boolean; calendarEmail: string | null; error: string | null; lastSync: Date | null;
  days: string[]; today: string; byDay: Record<string, CalendarItem[]>; next: CalendarItem | null;
};

/** Events from Google within a window (for the clash check when booking). Throws if the calendar cannot be read. */
export async function eventsBetween(from: Date, to: Date): Promise<CalEvent[]> {
  const conn = await getConnection();
  if (!conn) throw new Error("Connect your Google Calendar first.");
  return listEvents(await calendarToken(conn), conn.calendar_id, from, to);
}

/** One week (Monday to Sunday, UK time) around `anchor`: calendar events, meetings booked here, tasks due and content scheduled. */
export async function loadWeekView(anchor: string, now = new Date()): Promise<WeekView> {
  const { days, from, to } = weekOf(anchor);
  const conn = await getConnection();
  const [synced, mine, tasks, content, state] = await Promise.all([
    query<any>(
      `SELECT e.id, e.google_event_id, e.title, e.starts_at, e.ends_at, e.all_day, e.meet_url, e.html_link, e.meeting_id, e.company_id, c.name AS company_name, ct.name AS contact_name
         FROM calendar_events e LEFT JOIN companies c ON c.id = e.company_id LEFT JOIN contacts ct ON ct.id = e.contact_id
        WHERE e.status <> 'cancelled' AND e.starts_at < $2 AND e.ends_at > $1`, [from, to]),
    query<any>(
      `SELECT m.id, m.title, m.starts_at, m.ends_at, m.meet_url, m.html_link, m.google_event_id, m.company_id, c.name AS company_name, ct.name AS contact_name
         FROM meetings m LEFT JOIN companies c ON c.id = m.company_id LEFT JOIN contacts ct ON ct.id = m.contact_id
        WHERE m.status = 'scheduled' AND m.starts_at < $2 AND m.ends_at > $1`, [from, to]),
    query<any>(`SELECT t.id, t.title, t.due_at, t.company_id FROM tasks t WHERE t.done_at IS NULL AND t.due_at >= $1 AND t.due_at < $2 ORDER BY t.due_at`, [from, to]),
    query<any>(`SELECT id, idea, scheduled_for::text AS day, status FROM content_items WHERE scheduled_for >= $1::date AND scheduled_for <= $2::date AND status <> 'Archived' ORDER BY scheduled_for`, [days[0], days[6]]),
    query<any>(`SELECT s.last_sync_at, s.last_error FROM calendar_sync_state s JOIN calendar_connections c ON c.id = s.connection_id WHERE c.refresh_token_enc IS NOT NULL ORDER BY c.connected_at DESC LIMIT 1`),
  ]);

  const have = new Set(synced.map((e: any) => e.google_event_id));
  const allDay = (day: string) => ({ start: ukDayStart(day), end: ukDayStart(addDays(day, 1)), allDay: true, meetUrl: null, link: null });
  const items: CalendarItem[] = [
    // Anything with a saved contact or company, or booked here, is shown as a meeting; the rest as an event.
    ...synced.map((e: any): CalendarItem => ({
      key: `g${e.id}`, kind: e.meeting_id || e.company_id ? "meeting" : "event", title: e.title,
      sub: [e.contact_name, e.company_name].filter(Boolean).join(" · ") || null,
      start: new Date(e.starts_at), end: new Date(e.ends_at), allDay: e.all_day, meetUrl: e.meet_url, link: e.html_link, href: e.company_id ? `/companies/${e.company_id}#meetings` : null,
    })),
    // Booked a moment ago and not yet seen by the sync.
    ...mine.filter((m: any) => !m.google_event_id || !have.has(m.google_event_id)).map((m: any): CalendarItem => ({
      key: `m${m.id}`, kind: "meeting", title: m.title, sub: [m.contact_name, m.company_name].filter(Boolean).join(" · ") || null,
      start: new Date(m.starts_at), end: new Date(m.ends_at), allDay: false, meetUrl: m.meet_url, link: m.html_link, href: m.company_id ? `/companies/${m.company_id}#meetings` : null,
    })),
    ...tasks.map((t: any): CalendarItem => ({ key: `t${t.id}`, kind: "task", title: t.title, sub: null, ...allDay(dayKey(new Date(t.due_at))), href: t.company_id ? `/companies/${t.company_id}#tasks` : "/tasks" })),
    ...content.map((c: any): CalendarItem => ({ key: `c${c.id}`, kind: "content", title: c.idea.length > 70 ? c.idea.slice(0, 67) + "…" : c.idea, sub: c.status, ...allDay(c.day), href: `/content/${c.id}`, done: c.status === "Posted" })),
  ];
  const byDay = groupByDay(items, days);
  const upcoming = items.filter((i) => (i.kind === "meeting" || i.kind === "event") && !i.allDay && i.end > now).sort((a, b) => a.start.getTime() - b.start.getTime());
  return {
    connected: !!conn, calendarEmail: conn?.email ?? null, error: state[0]?.last_error ?? conn?.last_error ?? null, lastSync: state[0]?.last_sync_at ? new Date(state[0].last_sync_at) : null,
    days, today: dayKey(now), byDay, next: upcoming[0] ?? null,
  };
}

/** Calendar events linked to a company because one of their guests is a saved contact there (not the ones booked from the CRM, which are listed as meetings). */
export async function loadLinkedEvents(companyId: number): Promise<{ id: number; title: string; starts_at: Date; ends_at: Date; all_day: boolean; meet_url: string | null; contact_name: string | null }[]> {
  return query(
    `SELECT e.id, e.title, e.starts_at, e.ends_at, e.all_day, e.meet_url, ct.name AS contact_name FROM calendar_events e LEFT JOIN contacts ct ON ct.id = e.contact_id
      WHERE e.company_id = $1 AND e.meeting_id IS NULL AND e.status <> 'cancelled' ORDER BY e.starts_at DESC LIMIT 15`, [companyId]);
}

export type MeetingRow = {
  id: number; title: string; starts_at: Date; ends_at: Date; status: string; meet_url: string | null; html_link: string | null; attendee_email: string;
  company_id: number | null; company_name: string | null; contact_name: string | null; error: string | null;
};

/** Meetings booked from the CRM: upcoming first, then the most recent past ones. Optionally for one company. */
export async function loadMeetings(companyId?: number): Promise<{ upcoming: MeetingRow[]; past: MeetingRow[] }> {
  const rows = await query<MeetingRow>(
    `SELECT m.id, m.title, m.starts_at, m.ends_at, m.status, m.meet_url, m.html_link, m.attendee_email, m.company_id, c.name AS company_name, ct.name AS contact_name, m.error
       FROM meetings m LEFT JOIN companies c ON c.id = m.company_id LEFT JOIN contacts ct ON ct.id = m.contact_id
      WHERE m.status IN ('scheduled', 'cancelled', 'failed') AND ($1::bigint IS NULL OR m.company_id = $1) ORDER BY m.starts_at DESC LIMIT 60`, [companyId ?? null]);
  const now = Date.now();
  return {
    upcoming: rows.filter((r) => r.status === "scheduled" && new Date(r.ends_at).getTime() >= now).reverse(),
    past: rows.filter((r) => !(r.status === "scheduled" && new Date(r.ends_at).getTime() >= now)).slice(0, 15),
  };
}

export type BookableContact = { id: number; name: string; role: string | null; email: string; company_id: number | null; company: string | null };

/** Saved people with an email who may be invited: not opted out, not suppressed, at a company that has not opted out. */
export async function bookableContacts(): Promise<BookableContact[]> {
  const rows = await query<BookableContact>(
    `SELECT ct.id, ct.name, ct.role, ct.email, ct.company_id, c.name AS company
       FROM contacts ct LEFT JOIN companies c ON c.id = ct.company_id LEFT JOIN contact_gate g ON g.contact_id = ct.id
      WHERE ct.email IS NOT NULL AND ct.email <> '' AND NOT COALESCE(g.blocked_person, false) AND NOT COALESCE(c.opted_out, false)
        AND NOT EXISTS (SELECT 1 FROM suppression s WHERE lower(s.domain) = lower(split_part(ct.email, '@', 2)))
      ORDER BY c.name NULLS LAST, ct.name LIMIT 600`);
  // bigint ids arrive from the database as strings
  return rows.map((r) => ({ ...r, id: Number(r.id), company_id: r.company_id === null ? null : Number(r.company_id) }));
}

export const dailyCap = () => Math.max(1, Math.min(50, Number(process.env.CALENDAR_DAILY_CAP) || 10));

export async function bookedToday(): Promise<number> {
  const [r] = await query<{ n: string }>(
    `SELECT count(*) AS n FROM meetings WHERE status IN ('booking', 'scheduled') AND created_at >= (date_trunc('day', now() AT TIME ZONE 'Europe/London') AT TIME ZONE 'Europe/London')`);
  return Number(r.n);
}
