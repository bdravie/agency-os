// Meeting and calendar maths: turning what the owner typed into a valid booking, building the Google event, finding clashes and
// laying a week out in UK time. Pure functions (no database, no network, no clock unless passed in) so they are easy to test.
import { londonParts } from "./paceMath.ts";

export const LENGTHS = [15, 30, 45, 60, 90] as const;
export const EARLIEST_HOUR = 6;      // the first start the form accepts, UK time (catches am/pm slips)
export const LATEST_START_HOUR = 21; // the last start, UK time (21:30 at the latest)
export const MAX_DAYS_AHEAD = 183;

export type Booking = { title: string; notes: string; date: string; time: string; length: number; email: string };

const pad = (n: number) => String(n).padStart(2, "0");
const EMAIL = /^[^\s@<>,;"']+@[^\s@<>,;"']+\.[^\s@<>,;"']{2,}$/;

/** "2026-11-12" and "14:30" typed in UK time, as the real moment in time. Null for a date or time that does not exist (including the hour skipped when the clocks go forward). */
export function ukToInstant(date: string, time: string): Date | null {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date), t = /^(\d{2}):(\d{2})$/.exec(time);
  if (!d || !t) return null;
  const [y, mo, da, h, mi] = [Number(d[1]), Number(d[2]), Number(d[3]), Number(t[1]), Number(t[2])];
  if (mo < 1 || mo > 12 || da < 1 || da > 31 || h > 23 || mi > 59) return null;
  const wall = Date.UTC(y, mo - 1, da, h, mi);
  if (new Date(wall).getUTCDate() !== da) return null;               // 31 November and the like
  // London is UTC or UTC+1; try both and keep the one whose London wall clock matches what was typed.
  for (const offsetH of [0, 1]) {
    const candidate = new Date(wall - offsetH * 3_600_000);
    const p = londonParts(candidate);
    if (p.year === y && p.month === mo && p.day === da && p.hour === h && p.minute === mi) return candidate;
  }
  return null;
}

/** Midnight at the start of this UK calendar day, as a moment in time. */
export const ukDayStart = (date: string): Date => ukToInstant(date, "00:00") ?? ukToInstant(date, "01:00") as Date;

/** The UK calendar day (YYYY-MM-DD) a moment falls on. */
export function dayKey(d: Date): string {
  const p = londonParts(d);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** Calendar arithmetic on YYYY-MM-DD (no clock involved). */
export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** The Monday on or before a day. */
export function mondayOf(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 Sunday
  return addDays(date, -((dow + 6) % 7));
}

/** A week (Monday to Sunday) around any day, with the real start and end moments. */
export function weekOf(date: string): { days: string[]; from: Date; to: Date } {
  const monday = mondayOf(date);
  return { days: Array.from({ length: 7 }, (_, i) => addDays(monday, i)), from: ukDayStart(monday), to: ukDayStart(addDays(monday, 7)) };
}

export type BookingCheck = { error: string } | { start: Date; end: Date; email: string; title: string; notes: string };

/** Everything the form needs to hold before anything is sent to Google. */
export function checkBooking(b: Booking, now: Date): BookingCheck {
  const email = b.email.trim().toLowerCase();
  if (!EMAIL.test(email) || email.length > 200) return { error: "This person has no usable email address saved." };
  const title = b.title.replace(/\s+/g, " ").trim();
  if (title.length < 3 || title.length > 120) return { error: "Give the meeting a title of 3 to 120 characters." };
  const notes = b.notes.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").replace(/[<>]/g, "").trim();
  if (notes.length > 1000) return { error: "Keep the note under 1,000 characters." };
  if (!(LENGTHS as readonly number[]).includes(b.length)) return { error: "Choose one of the meeting lengths." };
  const start = ukToInstant(b.date, b.time);
  if (!start) return { error: "That date or time does not exist. Check them and try again." };
  const [h, m] = b.time.split(":").map(Number);
  if (h < EARLIEST_HOUR || h > LATEST_START_HOUR || (h === LATEST_START_HOUR && m > 30)) return { error: `Pick a start between ${pad(EARLIEST_HOUR)}:00 and ${LATEST_START_HOUR}:30 (UK time).` };
  if (start.getTime() < now.getTime() + 5 * 60_000) return { error: "Pick a time in the future." };
  if (start.getTime() > now.getTime() + MAX_DAYS_AHEAD * 86_400_000) return { error: "That is more than six months away." };
  return { start, end: new Date(start.getTime() + b.length * 60_000), email, title, notes };
}

/** The description Google shows in the invitation: the owner's note, who booked it, and the one-line opt-out. */
export function buildDescription(notes: string, sender: string, business: string): string {
  return [
    notes,
    `Booked by ${sender}, ${business}. A Google Meet link is attached to this invitation.`,
    `Can't make this time? Just reply and we'll find another. Reply 'no' and I won't email again.`,
  ].filter(Boolean).join("\n\n");
}

/** The body for Google's events.insert: a Meet link is requested, the person is the only guest, and they cannot change or forward it. */
export function buildEventBody(o: { title: string; description: string; start: Date; end: Date; email: string; requestId: string; meetingId?: number }) {
  return {
    summary: o.title,
    description: o.description,
    start: { dateTime: o.start.toISOString(), timeZone: "Europe/London" },
    end: { dateTime: o.end.toISOString(), timeZone: "Europe/London" },
    attendees: [{ email: o.email }],
    guestsCanModify: false, guestsCanInviteOthers: false, guestsCanSeeOtherGuests: false,
    reminders: { useDefault: true },
    conferenceData: { createRequest: { requestId: o.requestId, conferenceSolutionKey: { type: "hangoutsMeet" } } },
    ...(o.meetingId ? { extendedProperties: { private: { crm_kind: "meeting", crm_meeting_id: String(o.meetingId) } } } : {}),
  };
}

export type CalEvent = { id: string; title: string; start: Date; end: Date; allDay: boolean; meetUrl: string | null; link: string | null };

/** One event from Google's list, reduced to what the dashboard shows. Private events show as "Busy"; cancelled ones and anything malformed are dropped. */
export function normaliseEvent(raw: any): CalEvent | null {
  if (!raw || raw.status === "cancelled" || !raw.id) return null;
  const allDay = !!raw.start?.date && !raw.start?.dateTime;
  const start = new Date(allDay ? ukDayStart(String(raw.start.date)) : raw.start?.dateTime);
  const end = new Date(allDay ? ukDayStart(String(raw.end?.date ?? raw.start.date)) : raw.end?.dateTime);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return null;
  const priv = raw.visibility === "private" || raw.visibility === "confidential";
  const meet = typeof raw.hangoutLink === "string" && /^https:\/\/meet\.google\.com\//.test(raw.hangoutLink) ? raw.hangoutLink : null;
  const link = typeof raw.htmlLink === "string" && /^https:\/\/(www\.)?google\.com\/calendar\//.test(raw.htmlLink) ? raw.htmlLink : null;
  return { id: String(raw.id), title: priv ? "Busy" : String(raw.summary ?? "(no title)").slice(0, 120), start, end, allDay, meetUrl: priv ? null : meet, link: priv ? null : link };
}

/** Timed events (not all-day) that overlap a proposed meeting. */
export function clashes(events: CalEvent[], start: Date, end: Date): CalEvent[] {
  return events.filter((e) => !e.allDay && e.start < end && e.end > start);
}

/** Puts items on the UK days they start (an all-day event shows on every day it covers). Days with nothing still appear. */
export function groupByDay<T extends { start: Date; end: Date; allDay?: boolean }>(items: T[], days: string[]): Record<string, T[]> {
  const out: Record<string, T[]> = Object.fromEntries(days.map((d) => [d, []]));
  for (const it of items) {
    if (it.allDay) {
      for (const d of days) { const s = ukDayStart(d), e = ukDayStart(addDays(d, 1)); if (it.start < e && it.end > s) out[d].push(it); }
    } else if (out[dayKey(it.start)]) out[dayKey(it.start)].push(it);
  }
  for (const d of days) out[d].sort((a, b) => Number(!!b.allDay) - Number(!!a.allDay) || a.start.getTime() - b.start.getTime());
  return out;
}

export const timeLabel = (d: Date) => d.toLocaleTimeString("en-GB", { timeZone: "Europe/London", hour: "2-digit", minute: "2-digit", hour12: false });
export const dayLabel = (d: Date) => d.toLocaleDateString("en-GB", { timeZone: "Europe/London", weekday: "short", day: "numeric", month: "short" });
