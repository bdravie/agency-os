// Checks the two-way calendar sync end to end against a stand-in Google Calendar that behaves like the real one (sync tokens, deleted events, 410 on an expired token).
// Nothing real is called and nothing is sent. Run from crm/: npx tsx --env-file=../<the env file> scripts/checkCalendarSync.mts
// Throwaway rows are prefixed ZZ and removed in a finally. Your real tasks are also pushed to the stand-in during the run, so their sync columns are reset at the end (only the ones holding the stand-in's ids).
import http from "node:http";

type Ev = any;
const store = new Map<string, Ev>();
let version = 0, counter = 0, expire = false;
let calls: { method: string; path: string; query: URLSearchParams; body: any }[] = [];
const bump = (e: Ev) => { e.rev = ++version; return e; };
const gAdd = (id: string, e: Ev) => { store.set(id, bump({ id, status: "confirmed", ...e })); };
const gEdit = (id: string, patch: Ev) => { store.set(id, bump({ ...store.get(id), ...patch })); };
const gDelete = (id: string) => { store.set(id, bump({ id, status: "cancelled" })); };
const publicView = (e: Ev) => { const { rev, ...rest } = e; return rest; };

const server = http.createServer((req, res) => {
  let b = ""; req.on("data", (c) => (b += c));
  req.on("end", () => {
    const u = new URL(req.url!, "http://x");
    if (u.pathname === "/token") { res.writeHead(200, { "Content-Type": "application/json" }); return res.end(JSON.stringify({ access_token: "at", expires_in: 3600 })); }
    const body = b ? JSON.parse(b) : null;
    calls.push({ method: req.method!, path: u.pathname, query: u.searchParams, body });
    const send = (s: number, j?: any) => { res.writeHead(s, { "Content-Type": "application/json" }); res.end(j === undefined ? "" : JSON.stringify(j)); };
    const m = /^\/calendars\/[^/]+\/events(?:\/(.+))?$/.exec(u.pathname);
    if (!m) return send(404, {});
    const id = m[1] ? decodeURIComponent(m[1]) : null;
    if (req.method === "GET" && !id) {
      const tok = u.searchParams.get("syncToken");
      if (tok) {
        if (expire) return send(410, { error: { message: "Sync token is no longer valid" } });
        const since = Number(tok.replace("v", ""));
        return send(200, { items: [...store.values()].filter((e) => e.rev > since).map(publicView), nextSyncToken: `v${version}` });
      }
      return send(200, { items: [...store.values()].filter((e) => e.status !== "cancelled").map(publicView), nextSyncToken: `v${version}` });
    }
    if (req.method === "POST" && !id) { const nid = `gen-${++counter}`; store.set(nid, bump({ id: nid, status: "confirmed", ...body })); return send(200, { id: nid }); }
    if (req.method === "PATCH" && id) { if (!store.has(id) || store.get(id).status === "cancelled") return send(404, {}); store.set(id, bump({ ...store.get(id), ...body })); return send(200, { id }); }
    if (req.method === "DELETE" && id) { if (!store.has(id)) return send(404, {}); gDelete(id); return send(204); }
    send(404, {});
  });
});
await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
const port = (server.address() as any).port;
process.env.GOOGLE_TOKEN_URL = `http://127.0.0.1:${port}/token`;
process.env.GOOGLE_CALENDAR_API_BASE = `http://127.0.0.1:${port}`;
process.env.GOOGLE_CLIENT_ID = "test"; process.env.GOOGLE_CLIENT_SECRET = "test";

const { query } = await import("../lib/db.ts");
const { encryptToken } = await import("../lib/mailCrypto.ts");
const { runSync } = await import("../lib/calendarSync.ts");
const { loadWeekView } = await import("../lib/meetings.ts");
const { addDays, dayKey, ukToInstant } = await import("../lib/meetingMath.ts");

const counts = async () => Object.fromEntries(await Promise.all(["companies", "contacts", "meetings", "tasks", "activities", "calendar_connections", "calendar_events", "calendar_sync_state"].map(async (t) => [t, Number((await query<any>(`SELECT count(*) n FROM ${t}`))[0].n)])));
let pass = 0, fail = 0;
const ok = (cond: boolean, name: string, extra = "") => { cond ? pass++ : fail++; console.log(`${cond ? "PASS" : "FAIL"}  ${name}${cond ? "" : "  " + extra}`); };
const sync = async () => { calls = []; return runSync({ force: true }); };
const posts = () => calls.filter((c) => c.method === "POST").length;
// This check would disturb tasks that are already syncing with a real Google Calendar, so it refuses to run then.
const live = Number((await query<any>(`SELECT count(*) n FROM tasks WHERE google_event_id IS NOT NULL AND google_event_id NOT LIKE 'gen-%'`))[0].n);
if (live > 0) { console.log(`STOPPED: ${live} of your tasks are already synced with your real calendar. Run this check against a copy of the database instead.`); server.close(); process.exit(2); }
const before = await counts();
console.log("before", JSON.stringify(before));
let companyId = 0;
const today = dayKey(new Date());
const at = (d: string, t: string, mins = 30) => { const s = ukToInstant(d, t)!; return { start: { dateTime: s.toISOString() }, end: { dateTime: new Date(s.getTime() + mins * 60000).toISOString() } }; };
try {
  companyId = Number((await query<any>(`INSERT INTO companies (name) VALUES ('ZZ Sync Test Co') RETURNING id`))[0].id);   // bigint ids arrive as strings
  const [ct] = await query<any>(`INSERT INTO contacts (company_id, name, email, consent_basis) VALUES ($1,'ZZ Guest','zz-guest@zz-sync.example.com','booking') RETURNING id`, [companyId]);
  const [conn] = await query<any>(`INSERT INTO calendar_connections (email, refresh_token_enc) VALUES ('zz-owner@example.com', $1) RETURNING id`, [encryptToken("rt", process.env.SESSION_SECRET ?? "")]);
  const tomorrow = addDays(today, 1), in3 = addDays(today, 3);
  const mkTask = async (title: string, due: Date) => Number((await query<any>(`INSERT INTO tasks (title, due_at, company_id) VALUES ($1,$2,$3) RETURNING id`, [title, due, companyId]))[0].id);
  const t1 = await mkTask("ZZ Email Sam", ukToInstant(tomorrow, "15:00")!);
  const t2 = await mkTask("ZZ Send quote", ukToInstant(in3, "00:00")!);
  const t3 = await mkTask("ZZ Ancient overdue", new Date(Date.now() - 40 * 86400000));
  const task = async (id: number) => (await query<any>(`SELECT * FROM tasks WHERE id = $1`, [id]))[0];

  // ---- first sync: Google to CRM
  gAdd("g-guest", { summary: "Intro with Sam", ...at(tomorrow, "11:00"), hangoutLink: "https://meet.google.com/aaa-bbbb-ccc", attendees: [{ email: "zz-owner@example.com", self: true }, { email: "ZZ-Guest@zz-sync.example.com" }], description: "SECRET DESCRIPTION", location: "SECRET PLACE" });
  gAdd("g-private", { summary: "Dentist", visibility: "private", ...at(tomorrow, "13:00", 60), hangoutLink: "https://meet.google.com/zzz" });
  gAdd("g-stranger", { summary: "Workshop", ...at(in3, "10:00"), attendees: [{ email: "zz-stranger-customer@elsewhere.example.com" }] });
  gAdd("g-allday", { summary: "Away", start: { date: in3 }, end: { date: addDays(in3, 1) } });
  let r = await sync();
  ok(r.connected && !r.error && r.changed, "first sync runs and reports a change", JSON.stringify(r));
  const evs = await query<any>(`SELECT * FROM calendar_events WHERE connection_id = $1 ORDER BY google_event_id`, [conn.id]);
  ok(evs.length === 4, "the four Google events are saved", String(evs.length));
  const guest = evs.find((e: any) => e.google_event_id === "g-guest");
  ok(Number(guest.company_id) === companyId && Number(guest.contact_id) === Number(ct.id), "an event whose guest is a saved contact is linked to that company");
  ok(evs.find((e: any) => e.google_event_id === "g-stranger").company_id === null, "an event with a stranger as guest is not linked to anyone");
  ok(!JSON.stringify(evs).includes("zz-stranger-customer") && !JSON.stringify(evs).includes("zz-guest@") && !JSON.stringify(evs).includes("SECRET"), "no guest address, description or location is saved anywhere in the copy");
  ok(evs.find((e: any) => e.google_event_id === "g-private").title === "Busy" && evs.find((e: any) => e.google_event_id === "g-private").meet_url === null, "a private event is saved as Busy with no link");
  ok(evs.find((e: any) => e.google_event_id === "g-allday").all_day === true, "an all-day event is saved as all-day");
  const asked = calls.find((c) => c.method === "GET");
  ok(!/description|location/.test(asked?.query.get("fields") ?? ""), "Google is never asked for descriptions or locations", asked?.query.get("fields") ?? "");

  // ---- first sync: CRM to Google
  const a1 = await task(t1), a2 = await task(t2), a3 = await task(t3);
  ok(!!a1.google_event_id && !!a2.google_event_id && a3.google_event_id === null, "tasks with a due date are mirrored; a task overdue by weeks is not");
  const e1 = store.get(a1.google_event_id), e2 = store.get(a2.google_event_id);
  ok(e1?.summary === "☐ ZZ Email Sam" && !e1.attendees && e1.transparency === "transparent" && e1.extendedProperties.private.crm_task_id === String(t1), "a task event has the title, no guests, free time and the task tag", JSON.stringify(e1));
  ok(e2?.start?.date === in3 && !e2.start.dateTime, "a task due at midnight is an all-day event", JSON.stringify(e2?.start));
  ok(calls.filter((c) => c.method === "POST").every((c) => c.query.get("sendUpdates") === "none"), "mirroring tasks asks Google to email nobody");
  const taskEventsStored = await query<any>(`SELECT 1 FROM calendar_events WHERE google_event_id = ANY($1::text[])`, [[a1.google_event_id, a2.google_event_id]]);
  ok(taskEventsStored.length === 0, "task events are not saved a second time as calendar events");

  // ---- nothing changed: quiet
  r = await sync();
  ok(!r.changed && posts() === 0 && !calls.some((c) => ["PATCH", "DELETE"].includes(c.method)), "a second sync with no changes does nothing (our own echo is ignored)", JSON.stringify({ r, calls: calls.map((c) => c.method) }));

  // ---- Google changes a task event: the task follows
  gEdit(a1.google_event_id, { summary: "☐ ZZ Email Sam (moved)", ...at(addDays(today, 2), "09:00") });
  r = await sync();
  const b1 = await task(t1);
  ok(r.changed && b1.title === "ZZ Email Sam (moved)" && new Date(b1.due_at).toISOString() === ukToInstant(addDays(today, 2), "09:00")!.toISOString(), "renaming and moving a task's event in Google updates the task", JSON.stringify(b1));
  ok(!calls.some((c) => c.method === "PATCH"), "...without pushing the change back to Google");

  // ---- the CRM changes a task: the event follows
  await query(`UPDATE tasks SET title = 'ZZ Send revised quote' WHERE id = $1`, [t2]);
  await sync();
  ok(store.get(a2.google_event_id).summary === "☐ ZZ Send revised quote" && calls.some((c) => c.method === "PATCH"), "renaming a task in the CRM updates its Google event");
  r = await sync();
  ok(!r.changed && !calls.some((c) => ["PATCH", "POST", "DELETE"].includes(c.method)), "...and then it is quiet again");

  // ---- done in the CRM: the event goes
  await query(`UPDATE tasks SET done_at = now() WHERE id = $1`, [t2]);
  await sync();
  ok(store.get(a2.google_event_id).status === "cancelled" && (await task(t2)).google_event_id === null, "ticking a task off removes its Google event");
  await query(`UPDATE tasks SET done_at = NULL WHERE id = $1`, [t2]);
  await sync();
  ok(!!(await task(t2)).google_event_id, "...and un-ticking it brings the event back");

  // ---- deleted in Google: stop syncing that task, keep the task
  gDelete(b1.google_event_id);
  await sync();
  const c1 = await task(t1);
  ok(c1.google_unlinked === true && c1.google_event_id === null && c1.done_at === null, "deleting a task's event in Google stops syncing it but keeps the task");
  await sync();
  ok(posts() === 0, "...and it is not recreated");

  // ---- a meeting booked from the CRM
  const s0 = ukToInstant(addDays(today, 4), "14:00")!;
  const [mt] = await query<any>(`INSERT INTO meetings (company_id, contact_id, title, starts_at, ends_at, attendee_email, status, google_event_id) VALUES ($1,$2,'ZZ Booked call',$3,$4,'zz-guest@zz-sync.example.com','scheduled','g-meet') RETURNING id`, [companyId, ct.id, s0, new Date(s0.getTime() + 1800000)]);
  gAdd("g-meet", { summary: "ZZ Booked call", ...at(addDays(today, 4), "14:00"), attendees: [{ email: "zz-guest@zz-sync.example.com" }] });
  await sync();
  const me = (await query<any>(`SELECT * FROM calendar_events WHERE google_event_id = 'g-meet'`))[0];
  ok(Number(me.meeting_id) === Number(mt.id) && Number(me.company_id) === companyId, "a meeting booked here is linked to its event");
  gEdit("g-meet", { ...at(addDays(today, 5), "16:00") });
  r = await sync();
  const m2 = (await query<any>(`SELECT starts_at FROM meetings WHERE id = $1`, [mt.id]))[0];
  ok(r.changed && new Date(m2.starts_at).toISOString() === ukToInstant(addDays(today, 5), "16:00")!.toISOString(), "moving that meeting in Google moves it in the CRM");
  gDelete("g-meet");
  await sync();
  const m3 = (await query<any>(`SELECT status FROM meetings WHERE id = $1`, [mt.id]))[0];
  ok(m3.status === "cancelled" && (await query<any>(`SELECT 1 FROM calendar_events WHERE google_event_id = 'g-meet'`)).length === 0, "deleting it in Google cancels it in the CRM");

  // ---- a normal event removed in Google
  gDelete("g-stranger");
  await sync();
  ok((await query<any>(`SELECT 1 FROM calendar_events WHERE google_event_id = 'g-stranger'`)).length === 0, "an event deleted in Google disappears from the CRM");

  // ---- the week view reads the saved copy
  const view = await loadWeekView(tomorrow);
  const dayItems = view.byDay[tomorrow] ?? [];
  ok(view.connected && dayItems.some((i: any) => i.title === "Intro with Sam" && i.kind === "meeting") && dayItems.some((i: any) => i.title === "Busy"), "the week view shows the saved events (the linked one as a meeting)", JSON.stringify(dayItems.map((i: any) => [i.kind, i.title])));

  // ---- a stray task event whose task no longer exists is cleaned up
  gAdd("g-orphan", { summary: "☐ ZZ ghost", ...at(in3, "12:00"), extendedProperties: { private: { crm_kind: "task", crm_task_id: "999999999" } } });
  await sync();
  ok(store.get("g-orphan").status === "cancelled" && (await query<any>(`SELECT 1 FROM calendar_events WHERE google_event_id = 'g-orphan'`)).length === 0, "an orphaned task event is removed from Google and never saved");

  // ---- Google forgets our position: start again and tidy up
  gDelete("g-allday"); gAdd("g-new", { summary: "Brand new", ...at(addDays(today, 6), "10:00") });
  expire = true;
  r = await sync();
  expire = false;
  const after = (await query<any>(`SELECT google_event_id FROM calendar_events WHERE connection_id = $1`, [conn.id])).map((e: any) => e.google_event_id).sort();
  ok(!r.error && after.includes("g-new") && !after.includes("g-allday"), "an expired sync position triggers a full re-read that adds new and drops deleted events", JSON.stringify({ r, after }));
  await sync();
  ok(true, "(sync after a full re-read runs)");
} catch (e: any) {
  fail++; console.log("ERROR", e?.stack ?? e);
} finally {
  await query(`DELETE FROM meetings WHERE company_id = $1`, [companyId]).catch(() => {});
  await query(`DELETE FROM tasks WHERE title LIKE 'ZZ %'`).catch(() => {});
  // Real tasks were mirrored to the stand-in during the run: put their sync columns back to "never synced".
  await query(`UPDATE tasks SET google_event_id = NULL, google_hash = NULL WHERE google_event_id LIKE 'gen-%'`).catch(() => {});
  await query(`DELETE FROM calendar_connections WHERE email = 'zz-owner@example.com'`).catch(() => {});   // events and sync state go with it
  if (companyId) {
    await query(`DELETE FROM activities WHERE company_id = $1`, [companyId]).catch(() => {});
    await query(`DELETE FROM contacts WHERE company_id = $1`, [companyId]).catch(() => {});
    await query(`DELETE FROM companies WHERE id = $1`, [companyId]).catch(() => {});
  }
  const afterCounts = await counts();
  console.log("after ", JSON.stringify(afterCounts));
  console.log(JSON.stringify(before) === JSON.stringify(afterCounts) ? "CLEAN: row counts are back to what they were" : "WARNING: row counts differ");
  console.log(`${pass} passed, ${fail} failed`);
  server.close();
  process.exit(fail ? 1 : 0);
}
