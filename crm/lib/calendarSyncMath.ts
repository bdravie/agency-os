// The rules of the two-way calendar sync, as pure functions (no database, no network) so they are easy to test:
//  - which CRM tasks should exist as events in Google Calendar, and what those events look like
//  - how a change made in Google to one of those events is applied back to the task
//  - how an event from Google is reduced to what the CRM keeps (title, times, links; guests are only used to find a saved contact)
import { londonParts } from "./paceMath.ts";
import { addDays, dayKey, ukDayStart } from "./meetingMath.ts";

export const TASK_PREFIX = "☐ ";
export const TASK_MINUTES = 30;
export const TASK_PAST_DAYS = 1;      // tasks overdue by more than a day are not mirrored
export const TASK_FUTURE_DAYS = 400;  // matches the window the sync reads from Google

export type TaskRow = { id: number; title: string; due_at: Date | string | null; done_at: Date | string | null; google_event_id: string | null; google_hash: string | null; google_unlinked: boolean; company_name?: string | null };

/** A due moment as the calendar shows it: a date-only due (midnight UK time) is an all-day event, anything else a 30 minute slot. */
export function dueToSlot(due: Date): { allDay: boolean; date: string; start: Date; end: Date } {
  const p = londonParts(due);
  const date = dayKey(due);
  if (p.hour === 0 && p.minute === 0) return { allDay: true, date, start: ukDayStart(date), end: ukDayStart(addDays(date, 1)) };
  // Google keeps whole seconds, so a task time with fractions of a second would never match its own event.
  const start = new Date(Math.floor(due.getTime() / 1000) * 1000);
  return { allDay: false, date, start, end: new Date(start.getTime() + TASK_MINUTES * 60_000) };
}

/** A fingerprint of a task's title and time. If it differs from the one saved at the last sync, one side has changed since. */
export function taskHash(title: string, due: Date): string {
  const s = dueToSlot(due);
  return `${title.replace(/\s+/g, " ").trim().slice(0, 200)}|${s.allDay ? `d:${s.date}` : `t:${s.start.toISOString()}`}`;
}

export const stripTaskPrefix = (title: string) => title.replace(/^\s*[☐✓☑]\s*/, "").trim();

/** The Google event for a task: no guests (nothing is emailed), shown as free time, no pop-up reminders, tagged so it can be recognised. */
export function taskEventBody(t: Pick<TaskRow, "id" | "title" | "company_name">, due: Date) {
  const s = dueToSlot(due);
  const when = s.allDay
    ? { start: { date: s.date }, end: { date: dayKey(s.end) } }
    : { start: { dateTime: s.start.toISOString(), timeZone: "Europe/London" }, end: { dateTime: s.end.toISOString(), timeZone: "Europe/London" } };
  return {
    summary: TASK_PREFIX + t.title.replace(/\s+/g, " ").trim().slice(0, 200),
    description: `A task from your CRM${t.company_name ? ` (${t.company_name})` : ""}. Change the title or the time here and the CRM follows. Delete this event to stop syncing the task.`,
    ...when,
    transparency: "transparent",
    colorId: "6",
    reminders: { useDefault: false },
    extendedProperties: { private: { crm_kind: "task", crm_task_id: String(t.id) } },
  };
}

const asDate = (v: Date | string | null) => (v === null ? null : v instanceof Date ? v : new Date(v));

/** Which tasks need an event created, updated or removed in Google. */
export function planTaskSync(tasks: TaskRow[], now: Date): { create: TaskRow[]; update: TaskRow[]; remove: TaskRow[] } {
  const from = now.getTime() - TASK_PAST_DAYS * 86_400_000, to = now.getTime() + TASK_FUTURE_DAYS * 86_400_000;
  const plan = { create: [] as TaskRow[], update: [] as TaskRow[], remove: [] as TaskRow[] };
  for (const t of tasks) {
    const due = asDate(t.due_at);
    const wanted = !!due && !isNaN(due.getTime()) && !t.done_at && !t.google_unlinked && due.getTime() >= from && due.getTime() <= to;
    if (wanted && due) {
      if (!t.google_event_id) plan.create.push(t);
      else if (t.google_hash !== taskHash(t.title, due)) plan.update.push(t);
    } else if (t.google_event_id) plan.remove.push(t);
  }
  return plan;
}

export type SyncEvent = {
  id: string; status: "confirmed" | "tentative" | "cancelled"; title: string; start: Date | null; end: Date | null; allDay: boolean;
  meetUrl: string | null; link: string | null; crmKind: string | null; crmTaskId: number | null; guests: string[];
};

/** One item from Google's change list. Cancelled items carry little more than an id, so times may be null. */
export function normaliseSyncEvent(raw: any): SyncEvent | null {
  if (!raw || !raw.id) return null;
  const status = raw.status === "cancelled" ? "cancelled" : raw.status === "tentative" ? "tentative" : "confirmed";
  const allDay = !!raw.start?.date && !raw.start?.dateTime;
  const when = (x: any) => { const d = allDay ? (x?.date ? ukDayStart(String(x.date)) : null) : (x?.dateTime ? new Date(x.dateTime) : null); return d && !isNaN(d.getTime()) ? d : null; };
  const start = when(raw.start), end = when(raw.end) ?? (start && allDay ? ukDayStart(addDays(dayKey(start), 1)) : start);
  if (status !== "cancelled" && (!start || !end)) return null;
  const priv = raw.visibility === "private" || raw.visibility === "confidential";
  const meet = !priv && typeof raw.hangoutLink === "string" && /^https:\/\/meet\.google\.com\//.test(raw.hangoutLink) ? raw.hangoutLink : null;
  const link = !priv && typeof raw.htmlLink === "string" && /^https:\/\/(www\.)?google\.com\/calendar\//.test(raw.htmlLink) ? raw.htmlLink : null;
  const props = raw.extendedProperties?.private ?? {};
  const guests = (Array.isArray(raw.attendees) ? raw.attendees : []).filter((a: any) => a && !a.self && !a.resource && typeof a.email === "string").map((a: any) => String(a.email).trim().toLowerCase());
  return {
    id: String(raw.id), status, title: priv ? "Busy" : String(raw.summary ?? "(no title)").slice(0, 200), start, end, allDay, meetUrl: meet, link,
    crmKind: typeof props.crm_kind === "string" ? props.crm_kind : null, crmTaskId: Number(props.crm_task_id) || null, guests,
  };
}

export type TaskChange = { action: "noop" } | { action: "unlink" } | { action: "update"; title: string; due: Date; hash: string };

/** A change to a task's event in Google, compared with what the task looked like at the last sync. */
export function applyIncomingTask(task: Pick<TaskRow, "title" | "google_hash">, ev: SyncEvent): TaskChange {
  if (ev.status === "cancelled") return { action: "unlink" };
  if (!ev.start) return { action: "noop" };
  const title = stripTaskPrefix(ev.title) || task.title;
  const hash = taskHash(title, ev.start);
  return hash === task.google_hash ? { action: "noop" } : { action: "update", title, due: ev.start, hash };
}
