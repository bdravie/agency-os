import { query } from "./db";
import { getConnection, calendarToken } from "./gcalAuth";
import { listEvents, CalendarAuthError } from "./gcal";
import { addDays, dayKey, groupByDay, ukDayStart, weekOf, type CalEvent } from "./meetingMath";

// Reads for the Calendar page and the Dashboard card. Events on the Google calendar are fetched live and kept only in memory for a minute:
// they are never saved in the database. Meetings booked from the CRM are saved (table `meetings`).

export type CalendarItem = {
  key: string; kind: "event" | "meeting" | "task" | "content"; title: string; sub: string | null;
  start: Date; end: Date; allDay: boolean; meetUrl: string | null; link: string | null; href: string | null; done?: boolean;
};

export type WeekView = {
  connected: boolean; calendarEmail: string | null; error: string | null;
  days: string[]; today: string; byDay: Record<string, CalendarItem[]>; next: CalendarItem | null;
};

const memo = new Map<string, { at: number; events: CalEvent[] }>();
export const forgetCalendarCache = () => memo.clear();

async function googleEvents(conn: NonNullable<Awaited<ReturnType<typeof getConnection>>>, from: Date, to: Date): Promise<CalEvent[]> {
  const key = `${conn.id}:${from.toISOString()}:${to.toISOString()}`;
  const hit = memo.get(key);
  if (hit && Date.now() - hit.at < 60_000) return hit.events;
  const events = await listEvents(await calendarToken(conn), conn.calendar_id, from, to);
  memo.set(key, { at: Date.now(), events });
  return events;
}

/** Events from Google within a window (for the clash check when booking). Throws if the calendar cannot be read. */
export async function eventsBetween(from: Date, to: Date): Promise<CalEvent[]> {
  const conn = await getConnection();
  if (!conn) throw new Error("Connect your Google Calendar first.");
  return listEvents(await calendarToken(conn), conn.calendar_id, from, to);
}

/** One week (Monday to Sunday, UK time) around `anchor`: Google events, meetings booked here, tasks due and content scheduled. */
export async function loadWeekView(anchor: string, now = new Date()): Promise<WeekView> {
  const { days, from, to } = weekOf(anchor);
  const conn = await getConnection();
  const [mine, tasks, content] = await Promise.all([
    query<any>(
      `SELECT m.id, m.title, m.starts_at, m.ends_at, m.meet_url, m.html_link, m.google_event_id, m.company_id, c.name AS company_name, ct.name AS contact_name
         FROM meetings m LEFT JOIN companies c ON c.id = m.company_id LEFT JOIN contacts ct ON ct.id = m.contact_id
        WHERE m.status = 'scheduled' AND m.starts_at < $2 AND m.ends_at > $1`, [from, to]),
    query<any>(`SELECT t.id, t.title, t.due_at, t.company_id FROM tasks t WHERE t.done_at IS NULL AND t.due_at >= $1 AND t.due_at < $2 ORDER BY t.due_at`, [from, to]),
    query<any>(`SELECT id, idea, scheduled_for::text AS day, status FROM content_items WHERE scheduled_for >= $1::date AND scheduled_for <= $2::date AND status <> 'Archived' ORDER BY scheduled_for`, [days[0], days[6]]),
  ]);

  let google: CalEvent[] = [], error: string | null = null;
  if (conn) {
    try { google = await googleEvents(conn, from, to); }
    catch (e) { error = e instanceof CalendarAuthError || e instanceof Error ? e.message : "The calendar could not be read."; }
  }
  const bookedHere = new Set(mine.map((m: any) => m.google_event_id).filter(Boolean));
  const allDay = (day: string) => ({ start: ukDayStart(day), end: ukDayStart(addDays(day, 1)), allDay: true, meetUrl: null, link: null });

  const items: CalendarItem[] = [
    ...google.filter((e) => !bookedHere.has(e.id)).map((e): CalendarItem => ({ key: `g${e.id}`, kind: "event", title: e.title, sub: null, start: e.start, end: e.end, allDay: e.allDay, meetUrl: e.meetUrl, link: e.link, href: null })),
    ...mine.map((m: any): CalendarItem => ({ key: `m${m.id}`, kind: "meeting", title: m.title, sub: [m.contact_name, m.company_name].filter(Boolean).join(" · ") || null, start: new Date(m.starts_at), end: new Date(m.ends_at), allDay: false, meetUrl: m.meet_url, link: m.html_link, href: m.company_id ? `/companies/${m.company_id}#meetings` : null })),
    ...tasks.map((t: any): CalendarItem => ({ key: `t${t.id}`, kind: "task", title: t.title, sub: null, ...allDay(dayKey(new Date(t.due_at))), href: t.company_id ? `/companies/${t.company_id}#tasks` : "/tasks" })),
    ...content.map((c: any): CalendarItem => ({ key: `c${c.id}`, kind: "content", title: c.idea.length > 70 ? c.idea.slice(0, 67) + "…" : c.idea, sub: c.status, ...allDay(c.day), href: `/content/${c.id}`, done: c.status === "Posted" })),
  ];
  const byDay = groupByDay(items, days);
  const upcoming = items.filter((i) => (i.kind === "meeting" || i.kind === "event") && !i.allDay && i.end > now).sort((a, b) => a.start.getTime() - b.start.getTime());
  return { connected: !!conn, calendarEmail: conn?.email ?? null, error, days, today: dayKey(now), byDay, next: upcoming[0] ?? null };
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
