import { query } from "./db";
import { logActivity } from "./activity";
import { getConnection, calendarToken } from "./gcalAuth";
import { createMeetEvent } from "./gcal";
import { buildDescription, buildEventBody, checkBooking, clashes, dayLabel, timeLabel } from "./meetingMath";
import { bookedToday, dailyCap, eventsBetween } from "./meetings";

// The booking itself (plain server module: the action in meetingActions.ts checks you are logged in first, then calls this).
// One meeting at a time, only for a saved person with an email who has not opted out, and only after the owner ticks that they agreed to the call.
// Google sends the invitation with the Meet link.

const txt = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

export type Booked = { id: number; companyId: number | null; deal: { id: number; stage: string } | null };

export async function createBooking(form: FormData, now = new Date()): Promise<{ error: string } | Booked> {
  if (form.get("agreed") !== "on") return { error: "Tick the box to confirm they have agreed to a call. The CRM does not invite people who have not." };
  const contactId = Number(form.get("contact_id")) || 0;
  const [p] = await query<any>(
    `SELECT ct.id, ct.name, ct.email, ct.company_id, c.name AS company_name, COALESCE(g.blocked_person, false) AS blocked, COALESCE(c.opted_out, false) AS company_out,
            EXISTS (SELECT 1 FROM suppression s WHERE lower(s.domain) = lower(split_part(ct.email, '@', 2)) OR lower(s.email) = lower(ct.email)) AS suppressed
       FROM contacts ct LEFT JOIN companies c ON c.id = ct.company_id LEFT JOIN contact_gate g ON g.contact_id = ct.id WHERE ct.id = $1`, [contactId]);
  if (!p) return { error: "Choose who the meeting is with." };
  if (!p.email) return { error: `${p.name} has no email saved. Add one on the company page first.` };
  if (p.blocked || p.company_out || p.suppressed) return { error: `${p.name} has opted out or is on the suppression list, so no invitation can be sent.` };

  const sender = process.env.SENDER_NAME?.trim(), business = process.env.BUSINESS_NAME?.trim();
  if (!sender || !business) return { error: "Set SENDER_NAME and BUSINESS_NAME in the env file first. Every invitation carries your real name and business name." };
  const conn = await getConnection();
  if (!conn) return { error: "Connect your Google Calendar first (Calendar page)." };

  const check = checkBooking({ title: txt(form, "title"), notes: txt(form, "notes"), date: txt(form, "date"), time: txt(form, "time"), length: Number(form.get("length")), email: p.email }, now);
  if ("error" in check) return check;

  if ((await bookedToday()) >= dailyCap()) return { error: `That is today's limit of ${dailyCap()} meetings booked. Raise CALENDAR_DAILY_CAP if you really need more.` };
  const [dupe] = await query(`SELECT 1 FROM meetings WHERE contact_id = $1 AND status IN ('booking', 'scheduled') AND starts_at < $3 AND ends_at > $2`, [p.id, check.start, check.end]);
  if (dupe) return { error: `${p.name} already has a meeting at that time.` };

  try {
    if (form.get("allow_clash") !== "on") {
      const found = clashes(await eventsBetween(new Date(check.start.getTime() - 3_600_000), new Date(check.end.getTime() + 3_600_000)), check.start, check.end);
      if (found.length) return { error: `That clashes with "${found[0].title}" at ${timeLabel(found[0].start)} on ${dayLabel(found[0].start)}. Pick another time, or tick "Book it anyway".` };
    }
  } catch (e) { return { error: e instanceof Error ? e.message : "The calendar could not be checked." }; }

  const [deal] = await query<{ id: number; stage: string }>(
    `SELECT id, stage::text AS stage FROM deals WHERE company_id = $1 AND stage NOT IN ('Won', 'Lost') ORDER BY updated_at DESC LIMIT 1`, [p.company_id]);

  let id: number;
  try {
    const [row] = await query<{ id: number }>(
      `INSERT INTO meetings (connection_id, company_id, contact_id, deal_id, title, notes, starts_at, ends_at, attendee_email, status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'booking') RETURNING id`,
      [conn.id, p.company_id, p.id, deal?.id ?? null, check.title, check.notes || null, check.start, check.end, check.email]);
    id = Number(row.id);
  } catch (e) {
    const m = e instanceof Error ? e.message : "";
    return { error: m.startsWith("Blocked") ? m : "The meeting could not be saved. Try again." };
  }

  try {
    const body = buildEventBody({ title: check.title, description: buildDescription(check.notes, sender, business), start: check.start, end: check.end, email: check.email, requestId: `crm-meeting-${id}`, meetingId: id });
    const ev = await createMeetEvent(await calendarToken(conn), conn.calendar_id, body);
    await query(`UPDATE meetings SET status = 'scheduled', google_event_id = $2, meet_url = $3, html_link = $4 WHERE id = $1`, [id, ev.id, ev.meetUrl, ev.link]);
  } catch (e) {
    const m = e instanceof Error ? e.message : "Google could not create the event.";
    await query(`UPDATE meetings SET status = 'failed', error = $2 WHERE id = $1`, [id, m.slice(0, 300)]);
    return { error: `Nothing was sent. ${m}` };
  }

  await logActivity("meeting_booked", { company_id: p.company_id, contact_id: p.id, deal_id: deal?.id ?? null, body: `${check.title} · ${dayLabel(check.start)} ${timeLabel(check.start)}`, meta: { meeting_id: id } });
  return { id, companyId: p.company_id, deal: deal ?? null };
}
