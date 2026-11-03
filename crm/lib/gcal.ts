// Talks to Google Calendar: read the week, create one event with a Google Meet link (Google emails the invitation), cancel one.
// Server-side only. The functions take an access token and never touch the database, so a stand-in server can test them.
import { normaliseEvent, type CalEvent } from "./meetingMath.ts";

const base = () => process.env.GOOGLE_CALENDAR_API_BASE?.trim() || "https://www.googleapis.com/calendar/v3";

export class CalendarAuthError extends Error {}

function explain(status: number, json: any): Error {
  const msg: string = json?.error?.message ?? "";
  if (status === 401) return new CalendarAuthError("Google rejected the saved access. Connect the calendar again.");
  if (status === 403 && /has not been used|is disabled|accessNotConfigured/i.test(msg + JSON.stringify(json?.error?.errors ?? ""))) {
    return new Error("Google Calendar is switched off for your Google Cloud project. Turn on the Google Calendar API there, wait a minute, then try again.");
  }
  if (status === 403 && /insufficient|scope/i.test(msg)) return new CalendarAuthError("The calendar permission was not granted. Connect the calendar again and tick every box.");
  return new Error(`Google Calendar said ${status}: ${msg || "no details"}`);
}

async function call<T>(token: string, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${base()}${path}`, { ...init, signal: AbortSignal.timeout(8000), headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  if (res.status === 204) return undefined as T;
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) throw explain(res.status, json);
  return json as T;
}

const cal = (id: string) => `/calendars/${encodeURIComponent(id)}`;

/** Events starting in a window, in order. Only titles, times, the Meet link and the Google link are requested: no guest lists. */
export async function listEvents(token: string, calendarId: string, from: Date, to: Date): Promise<CalEvent[]> {
  const q = new URLSearchParams({
    timeMin: from.toISOString(), timeMax: to.toISOString(), singleEvents: "true", orderBy: "startTime", maxResults: "250",
    fields: "items(id,summary,start,end,hangoutLink,htmlLink,status,visibility)",
  });
  const r = await call<{ items?: any[] }>(token, `${cal(calendarId)}/events?${q}`);
  return (r.items ?? []).map(normaliseEvent).filter((e): e is CalEvent => !!e);
}

export type CreatedEvent = { id: string; meetUrl: string | null; link: string | null };

/** Creates the event and asks Google for a Meet link. `sendUpdates=all` is what makes Google email the invitation to the guest. */
export async function createMeetEvent(token: string, calendarId: string, body: object): Promise<CreatedEvent> {
  const q = new URLSearchParams({ conferenceDataVersion: "1", sendUpdates: "all", fields: "id,hangoutLink,htmlLink,conferenceData(entryPoints,createRequest)" });
  let ev = await call<any>(token, `${cal(calendarId)}/events?${q}`, { method: "POST", body: JSON.stringify(body) });
  // The Meet link can be "pending" for a moment after creation: look again a few times.
  for (let i = 0; i < 5 && !ev.hangoutLink && ev.id; i++) {
    await new Promise((r) => setTimeout(r, Number(process.env.GOOGLE_MEET_POLL_MS ?? 700)));
    ev = await call<any>(token, `${cal(calendarId)}/events/${encodeURIComponent(ev.id)}?fields=id,hangoutLink,htmlLink`);
  }
  const meet = typeof ev.hangoutLink === "string" && /^https:\/\/meet\.google\.com\//.test(ev.hangoutLink) ? ev.hangoutLink : null;
  const link = typeof ev.htmlLink === "string" && /^https:\/\/(www\.)?google\.com\/calendar\//.test(ev.htmlLink) ? ev.htmlLink : null;
  return { id: String(ev.id), meetUrl: meet, link };
}

/** Deletes the event; `sendUpdates=all` makes Google email the guest that it was cancelled. A 404/410 (already gone) counts as done. */
export async function cancelEvent(token: string, calendarId: string, eventId: string): Promise<void> {
  try { await call<void>(token, `${cal(calendarId)}/events/${encodeURIComponent(eventId)}?sendUpdates=all`, { method: "DELETE" }); }
  catch (e) { if (e instanceof Error && /said (404|410)/.test(e.message)) return; throw e; }
}

// ---------- Keeping a copy in step (incremental sync) and mirroring tasks ----------

export class SyncTokenExpired extends Error {}
export class EventGone extends Error {}

export type ChangePage = { items: any[]; nextPageToken?: string; nextSyncToken?: string };

/** One page of changes. With a sync token Google returns only what changed since (including deleted events); without one, a window of events.
 *  Guest addresses are asked for only so they can be matched to saved contacts in memory: they are never saved. Descriptions and locations are never asked for. */
export async function listChanges(token: string, calendarId: string, o: { syncToken?: string; timeMin?: Date; timeMax?: Date; pageToken?: string }): Promise<ChangePage> {
  const q = new URLSearchParams({
    maxResults: "250", singleEvents: "true",
    fields: "nextPageToken,nextSyncToken,items(id,status,summary,start,end,hangoutLink,htmlLink,visibility,attendees(email,self,resource),extendedProperties/private)",
  });
  if (o.syncToken) q.set("syncToken", o.syncToken);
  else { if (o.timeMin) q.set("timeMin", o.timeMin.toISOString()); if (o.timeMax) q.set("timeMax", o.timeMax.toISOString()); }
  if (o.pageToken) q.set("pageToken", o.pageToken);
  try { return await call<ChangePage>(token, `${cal(calendarId)}/events?${q}`); }
  catch (e) { if (e instanceof Error && /said 410/.test(e.message)) throw new SyncTokenExpired("The saved sync position has expired."); throw e; }
}

/** A plain event with no guests: sendUpdates=none, so Google emails nobody. Returns the new event's id. */
export async function insertPlainEvent(token: string, calendarId: string, body: object): Promise<string> {
  const r = await call<{ id: string }>(token, `${cal(calendarId)}/events?sendUpdates=none&fields=id`, { method: "POST", body: JSON.stringify(body) });
  return String(r.id);
}

export async function patchPlainEvent(token: string, calendarId: string, id: string, body: object): Promise<void> {
  try { await call<unknown>(token, `${cal(calendarId)}/events/${encodeURIComponent(id)}?sendUpdates=none&fields=id`, { method: "PATCH", body: JSON.stringify(body) }); }
  catch (e) { if (e instanceof Error && /said (404|410)/.test(e.message)) throw new EventGone("The event is gone."); throw e; }
}

export async function deletePlainEvent(token: string, calendarId: string, id: string): Promise<void> {
  try { await call<void>(token, `${cal(calendarId)}/events/${encodeURIComponent(id)}?sendUpdates=none`, { method: "DELETE" }); }
  catch (e) { if (e instanceof Error && /said (404|410)/.test(e.message)) return; throw e; }
}
