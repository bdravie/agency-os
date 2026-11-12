import { query } from "./db";
import { getConnection, calendarToken, type Connection } from "./gcalAuth";
import { EventGone, SyncTokenExpired, deletePlainEvent, insertPlainEvent, listChanges, patchPlainEvent } from "./gcal";
import { applyIncomingTask, normaliseSyncEvent, planTaskSync, taskEventBody, taskHash, type SyncEvent, type TaskRow } from "./calendarSyncMath";

// Keeps the CRM and the owner's business Google Calendar in step, both ways, by asking Google only for what changed since last time
// (an incremental sync). The CRM calls this about once a minute while it is open (see LiveCalendar), and when a Calendar page loads.
//
//  Google -> CRM: events are saved (title, times, links, and which saved contact/company a guest matches). Descriptions, locations, guest lists and
//                 guest addresses are never saved: guests are compared with saved contacts in memory and forgotten.
//                 A meeting booked from the CRM that is moved or deleted in Google is updated here.
//  CRM -> Google: tasks with a due date appear as events with no guests (so nothing is emailed to anyone). Change the title or time in the CRM or in
//                 Google and the other follows; ticking a task off removes its event; deleting the event in Google stops syncing that task.

const WINDOW_PAST_DAYS = 30, WINDOW_FUTURE_DAYS = 400, FULL_RESYNC_DAYS = 14, MAX_PUSH = 30, MIN_GAP_MS = 20_000;

export type SyncResult = { connected: boolean; changed: boolean; at: string | null; error: string | null; skipped?: boolean };

let running: Promise<SyncResult> | null = null;
let lastRun = 0;
let lastResult: SyncResult | null = null;

/** Runs a sync now, or returns the one already running, or the last answer if one ran in the last 20 seconds (unless forced). */
export function runSync(opts: { force?: boolean } = {}): Promise<SyncResult> {
  if (running) return running;
  if (!opts.force && lastResult && Date.now() - lastRun < MIN_GAP_MS) return Promise.resolve({ ...lastResult, changed: false, skipped: true });
  running = (async (): Promise<SyncResult> => {
    const conn = await getConnection();
    if (!conn) return { connected: false, changed: false, at: null, error: null };
    try {
      const changed = await syncConnection(conn);
      return { connected: true, changed, at: new Date().toISOString(), error: null };
    } catch (e) {
      const error = e instanceof Error ? e.message.slice(0, 300) : "The sync failed.";
      await query(`INSERT INTO calendar_sync_state (connection_id, last_error) VALUES ($1, $2) ON CONFLICT (connection_id) DO UPDATE SET last_error = EXCLUDED.last_error`, [conn.id, error]);
      return { connected: true, changed: false, at: null, error };
    }
  })().then((r) => { lastRun = Date.now(); lastResult = r; return r; }).finally(() => { running = null; });
  return running;
}

export async function syncStatus(): Promise<{ last_sync_at: Date | null; last_error: string | null } | null> {
  const [s] = await query<any>(`SELECT s.last_sync_at, s.last_error FROM calendar_sync_state s JOIN calendar_connections c ON c.id = s.connection_id WHERE c.refresh_token_enc IS NOT NULL ORDER BY c.connected_at DESC LIMIT 1`);
  return s ?? null;
}

async function syncConnection(conn: Connection): Promise<boolean> {
  const token = await calendarToken(conn);
  const [state] = await query<any>(`SELECT sync_token, last_full_sync_at FROM calendar_sync_state WHERE connection_id = $1`, [conn.id]);
  const stale = !state?.last_full_sync_at || Date.now() - new Date(state.last_full_sync_at).getTime() > FULL_RESYNC_DAYS * 86_400_000;
  let changed = false;
  let full = !state?.sync_token || stale;
  for (let attempt = 0; attempt < 2; attempt++) {
    try { changed = (await pull(conn, token, full ? null : state.sync_token)) || changed; break; }
    catch (e) { if (e instanceof SyncTokenExpired && !full) { full = true; continue; } throw e; }
  }
  await push(conn, token);
  return changed;
}

/** Reads every changed event (or, with no token, the whole window) and applies it. Returns whether anything in the CRM changed. */
async function pull(conn: Connection, token: string, syncToken: string | null): Promise<boolean> {
  const now = Date.now();
  const seen = new Set<string>();
  let changed = false, page: string | undefined, next: string | undefined;
  do {
    const r = await listChanges(token, conn.calendar_id, syncToken
      ? { syncToken, pageToken: page }
      : { timeMin: new Date(now - WINDOW_PAST_DAYS * 86_400_000), timeMax: new Date(now + WINDOW_FUTURE_DAYS * 86_400_000), pageToken: page });
    const events = r.items.map(normaliseSyncEvent).filter((e): e is SyncEvent => !!e);
    events.forEach((e) => seen.add(e.id));
    changed = (await applyBatch(conn, token, events)) || changed;
    page = r.nextPageToken; if (r.nextSyncToken) next = r.nextSyncToken;
  } while (page);
  if (!syncToken) {   // a full read: anything we hold that Google no longer lists is gone
    const gone = await query(`DELETE FROM calendar_events WHERE connection_id = $1 AND NOT (google_event_id = ANY($2::text[])) RETURNING id`, [conn.id, [...seen]]);
    changed = changed || gone.length > 0;
  }
  await query(
    `INSERT INTO calendar_sync_state (connection_id, sync_token, last_sync_at, last_full_sync_at, last_error) VALUES ($1, $2, now(), $3, NULL)
     ON CONFLICT (connection_id) DO UPDATE SET sync_token = COALESCE(EXCLUDED.sync_token, calendar_sync_state.sync_token), last_sync_at = now(),
       last_full_sync_at = COALESCE(EXCLUDED.last_full_sync_at, calendar_sync_state.last_full_sync_at), last_error = NULL`,
    [conn.id, next ?? null, syncToken ? null : new Date()]);
  return changed;
}

async function applyBatch(conn: Connection, token: string, events: SyncEvent[]): Promise<boolean> {
  if (events.length === 0) return false;
  const ids = events.map((e) => e.id);
  const [taskRows, meetingRows] = await Promise.all([
    query<any>(`SELECT id, title, google_hash, google_event_id FROM tasks WHERE google_event_id = ANY($1::text[])`, [ids]),
    query<any>(`SELECT id, google_event_id, contact_id, company_id, status, starts_at, ends_at FROM meetings WHERE google_event_id = ANY($1::text[])`, [ids]),
  ]);
  const taskByEvent = new Map(taskRows.map((t: any) => [t.google_event_id, t]));
  const meetingByEvent = new Map(meetingRows.map((m: any) => [m.google_event_id, m]));

  // Guests are compared with saved contacts, in memory. Only a match is kept (which contact and company); nobody else is stored.
  const own = conn.email.toLowerCase();
  const wanted = [...new Set(events.filter((e) => e.status !== "cancelled" && !taskByEvent.has(e.id)).flatMap((e) => e.guests).filter((g) => g !== own))];
  const contactByEmail = new Map<string, { id: number; company_id: number | null }>();
  if (wanted.length) {
    for (const c of await query<any>(`SELECT id, company_id, lower(email) AS email FROM contacts WHERE lower(email) = ANY($1::text[]) ORDER BY id DESC`, [wanted])) {
      contactByEmail.set(c.email, { id: Number(c.id), company_id: c.company_id === null ? null : Number(c.company_id) });   // the oldest contact wins
    }
  }

  let changed = false;
  const orphans: string[] = [];
  for (const ev of events) {
    const task = taskByEvent.get(ev.id);
    if (task) {
      const c = applyIncomingTask(task, ev);
      if (c.action === "unlink") { await query(`UPDATE tasks SET google_unlinked = true, google_event_id = NULL, google_hash = NULL WHERE id = $1`, [task.id]); changed = true; }
      else if (c.action === "update") {
        await query(`UPDATE tasks SET title = $2, due_at = $3, google_hash = $4 WHERE id = $1`, [task.id, c.title, c.due, c.hash]);
        // A "post this" reminder moved in Google moves the LinkedIn post's planned day and time with it (an all-day event has no time).
        await query(
          `UPDATE content_items SET scheduled_for = ($2::timestamptz AT TIME ZONE 'Europe/London')::date,
                  scheduled_time = NULLIF(($2::timestamptz AT TIME ZONE 'Europe/London')::time, time '00:00')
            WHERE reminder_task_id = $1 AND status NOT IN ('Posted','Archived')`, [task.id, c.due]);
        changed = true;
      }
      continue;
    }
    if (ev.crmKind === "task") { if (ev.status !== "cancelled") orphans.push(ev.id); continue; }   // the task is gone: clean up its event

    const meeting = meetingByEvent.get(ev.id);
    if (ev.status === "cancelled") {
      const del = await query(`DELETE FROM calendar_events WHERE connection_id = $1 AND google_event_id = $2 RETURNING id`, [conn.id, ev.id]);
      if (meeting && meeting.status === "scheduled") await query(`UPDATE meetings SET status = 'cancelled', cancelled_at = now() WHERE id = $1`, [meeting.id]);
      changed = changed || del.length > 0 || !!meeting;
      continue;
    }
    if (!ev.start || !ev.end || ev.end <= ev.start) continue;
    let company: number | null = null, contact: number | null = null;
    if (meeting) { company = meeting.company_id === null ? null : Number(meeting.company_id); contact = meeting.contact_id === null ? null : Number(meeting.contact_id); }
    else { const g = ev.guests.map((x) => contactByEmail.get(x)).find(Boolean); if (g) { company = g.company_id; contact = g.id; } }
    const up = await query(
      `INSERT INTO calendar_events (connection_id, google_event_id, title, starts_at, ends_at, all_day, meet_url, html_link, status, company_id, contact_id, meeting_id, synced_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12, now())
       ON CONFLICT (connection_id, google_event_id) DO UPDATE SET title = EXCLUDED.title, starts_at = EXCLUDED.starts_at, ends_at = EXCLUDED.ends_at, all_day = EXCLUDED.all_day,
         meet_url = EXCLUDED.meet_url, html_link = EXCLUDED.html_link, status = EXCLUDED.status, company_id = EXCLUDED.company_id, contact_id = EXCLUDED.contact_id,
         meeting_id = EXCLUDED.meeting_id, synced_at = now()
       WHERE (calendar_events.title, calendar_events.starts_at, calendar_events.ends_at, calendar_events.all_day, calendar_events.meet_url, calendar_events.html_link, calendar_events.status,
              calendar_events.company_id, calendar_events.contact_id, calendar_events.meeting_id)
         IS DISTINCT FROM (EXCLUDED.title, EXCLUDED.starts_at, EXCLUDED.ends_at, EXCLUDED.all_day, EXCLUDED.meet_url, EXCLUDED.html_link, EXCLUDED.status,
              EXCLUDED.company_id, EXCLUDED.contact_id, EXCLUDED.meeting_id)
       RETURNING id`,
      [conn.id, ev.id, ev.title, ev.start, ev.end, ev.allDay, ev.meetUrl, ev.link, ev.status, company, contact, meeting ? meeting.id : null]);
    changed = changed || up.length > 0;
    // A meeting booked here and moved in Google keeps its new time here too.
    if (meeting && meeting.status === "scheduled" && !ev.allDay && (new Date(meeting.starts_at).getTime() !== ev.start.getTime() || new Date(meeting.ends_at).getTime() !== ev.end.getTime())) {
      await query(`UPDATE meetings SET starts_at = $2, ends_at = $3 WHERE id = $1`, [meeting.id, ev.start, ev.end]);
      changed = true;
    }
  }
  for (const id of orphans) { try { await deletePlainEvent(token, conn.calendar_id, id); } catch { /* it is only a stray event: try again next time */ } }
  return changed;
}

/** Sends the CRM's side to Google: tasks with a due date become (or stay) events, finished or changed ones are removed or updated. */
async function push(conn: Connection, token: string): Promise<void> {
  const rows = await query<TaskRow & { id: number | string }>(
    `SELECT t.id, t.title, t.due_at, t.done_at, t.google_event_id, t.google_hash, t.google_unlinked, c.name AS company_name
       FROM tasks t LEFT JOIN companies c ON c.id = t.company_id
      WHERE t.google_event_id IS NOT NULL OR (t.done_at IS NULL AND t.due_at IS NOT NULL AND NOT t.google_unlinked AND t.due_at > now() - interval '2 days' AND t.due_at < now() + interval '401 days')`);
  const plan = planTaskSync(rows.map((r) => ({ ...r, id: Number(r.id) })), new Date());
  let budget = MAX_PUSH;
  const create = async (t: TaskRow) => {
    const due = new Date(t.due_at as string);
    const id = await insertPlainEvent(token, conn.calendar_id, taskEventBody(t, due));
    await query(`UPDATE tasks SET google_event_id = $2, google_hash = $3 WHERE id = $1`, [t.id, id, taskHash(t.title, due)]);
  };
  for (const t of plan.create) { if (budget-- <= 0) return; await create(t); }
  for (const t of plan.update) {
    if (budget-- <= 0) return;
    const due = new Date(t.due_at as string);
    try { await patchPlainEvent(token, conn.calendar_id, t.google_event_id as string, taskEventBody(t, due)); await query(`UPDATE tasks SET google_hash = $2 WHERE id = $1`, [t.id, taskHash(t.title, due)]); }
    catch (e) { if (e instanceof EventGone) await create(t); else throw e; }
  }
  for (const t of plan.remove) {
    if (budget-- <= 0) return;
    await deletePlainEvent(token, conn.calendar_id, t.google_event_id as string);
    await query(`UPDATE tasks SET google_event_id = NULL, google_hash = NULL WHERE id = $1`, [t.id]);
  }
}
