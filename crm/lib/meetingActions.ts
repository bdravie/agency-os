"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { query } from "./db";
import { requireLogin } from "./auth";
import { logActivity } from "./activity";
import { moveDeal } from "./actions";
import { decryptToken } from "./mailCrypto";
import { revokeToken } from "./gmail";
import { getConnection, calendarToken } from "./gcalAuth";
import { cancelEvent } from "./gcal";
import { createBooking } from "./meetingBook";

// Actions behind the Calendar screens. Booking is one meeting at a time, only on the owner's click (the form asks for confirmation first);
// the rules are in meetingBook.ts. Google sends the invitation with the Meet link.

const touch = (companyId?: number | null) => { revalidatePath("/"); revalidatePath("/calendar"); if (companyId) revalidatePath(`/companies/${companyId}`); };

export async function bookMeeting(_prev: string | null, form: FormData): Promise<string | null> {
  await requireLogin();
  const r = await createBooking(form);
  if ("error" in r) { touch(); return r.error; }
  // An early-stage deal moves to "Call booked" when the owner leaves the box ticked.
  if (r.deal && form.get("move_deal") === "on" && ["New", "Contacted", "Replied"].includes(r.deal.stage)) await moveDeal(r.deal.id, "Call booked");
  touch(r.companyId);
  redirect(`/calendar?booked=${r.id}`);
}

/** Cancels the meeting on Google (which emails the guest) and marks it cancelled here. */
export async function cancelMeeting(form: FormData): Promise<void> {
  await requireLogin();
  const id = Number(form.get("id")) || 0;
  const [m] = await query<any>(`SELECT id, company_id, contact_id, title, google_event_id, connection_id FROM meetings WHERE id = $1 AND status = 'scheduled'`, [id]);
  if (!m) redirect("/calendar?error=Meeting%20not%20found");
  const conn = await getConnection();
  if (m.google_event_id && conn) {
    try { await cancelEvent(await calendarToken(conn), conn.calendar_id, m.google_event_id); }
    catch (e) { redirect(`/calendar?error=${encodeURIComponent(e instanceof Error ? e.message.slice(0, 200) : "Could not cancel it on Google")}`); }
  }
  await query(`UPDATE meetings SET status = 'cancelled', cancelled_at = now() WHERE id = $1`, [id]);
  await logActivity("meeting_cancelled", { company_id: m.company_id, contact_id: m.contact_id, body: m.title });
  touch(m.company_id);
  redirect("/calendar?cancelled=1");
}

/** Forgets the token (and tells Google to cancel it). Meetings already booked stay in the CRM. */
export async function disconnectCalendar(): Promise<void> {
  await requireLogin();
  const conn = await getConnection();
  if (conn?.refresh_token_enc) { try { await revokeToken(decryptToken(conn.refresh_token_enc, process.env.SESSION_SECRET ?? "")); } catch { /* already unreadable: nothing to revoke */ } }
  if (conn) {
    await query(`UPDATE calendar_connections SET refresh_token_enc = NULL, last_error = NULL WHERE id = $1`, [conn.id]);
    // The saved copy of the calendar goes with the connection (tasks stay; their Google events are left as they are).
    await query(`DELETE FROM calendar_events WHERE connection_id = $1`, [conn.id]);
    await query(`DELETE FROM calendar_sync_state WHERE connection_id = $1`, [conn.id]);
  }
  touch();
  redirect("/calendar");
}
