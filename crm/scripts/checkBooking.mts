// Checks the meeting booking rules end to end against a stand-in Google (no real calls, nothing sent). Run from crm/: npx tsx --env-file=../<the env file> scripts/checkBooking.mts
// Throwaway rows are prefixed ZZ and removed in a finally; it prints before and after row counts.
import http from "node:http";
let calls: { method: string; url: string; body: any }[] = [];
let mode = "ok";
let listItems: any[] = [];
const server = http.createServer((req, res) => {
  let b = ""; req.on("data", (c) => (b += c));
  req.on("end", () => {
    let body: any = null; try { body = b ? JSON.parse(b) : null; } catch { body = b; }
    calls.push({ method: req.method!, url: req.url!, body });
    const send = (s: number, j: any) => { res.writeHead(s, { "Content-Type": "application/json" }); res.end(JSON.stringify(j)); };
    if (req.url!.startsWith("/token")) return send(200, { access_token: "at-test", expires_in: 3600 });
    if (req.method === "GET" && req.url!.includes("/events?")) return send(200, { items: listItems });
    if (req.method === "POST") return mode === "fail" ? send(500, { error: { message: "backend error" } }) : send(200, { id: "zz-ev-" + calls.length, hangoutLink: "https://meet.google.com/zzz-test-link", htmlLink: "https://www.google.com/calendar/event?eid=zz" });
    send(404, {});
  });
});
await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
const port = (server.address() as any).port;
process.env.GOOGLE_TOKEN_URL = `http://127.0.0.1:${port}/token`;
process.env.GOOGLE_CALENDAR_API_BASE = `http://127.0.0.1:${port}`;
process.env.GOOGLE_CLIENT_ID = "test"; process.env.GOOGLE_CLIENT_SECRET = "test";
process.env.SENDER_NAME = "Test Sender"; process.env.BUSINESS_NAME = "Test Business"; process.env.CALENDAR_DAILY_CAP = "10";

const { query } = await import("/Users/brad/Documents/agency-os/crm/lib/db.ts");
const { encryptToken } = await import("/Users/brad/Documents/agency-os/crm/lib/mailCrypto.ts");
const { createBooking } = await import("/Users/brad/Documents/agency-os/crm/lib/meetingBook.ts");
const { loadWeekView, bookableContacts } = await import("/Users/brad/Documents/agency-os/crm/lib/meetings.ts");
const { addDays, dayKey, ukToInstant } = await import("/Users/brad/Documents/agency-os/crm/lib/meetingMath.ts");

const counts = async () => Object.fromEntries(await Promise.all(["companies", "contacts", "meetings", "activities", "suppression", "calendar_connections"].map(async (t) => [t, Number((await query<any>(`SELECT count(*) n FROM ${t}`))[0].n)])));
let pass = 0, fail = 0;
const ok = (cond: boolean, name: string, extra = "") => { cond ? pass++ : fail++; console.log(`${cond ? "PASS" : "FAIL"}  ${name}${cond ? "" : "  " + extra}`); };
const form = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; };
const before = await counts();
console.log("before", JSON.stringify(before));
let companyId = 0;
try {
  const tomorrow = addDays(dayKey(new Date()), 1);
  [{ id: companyId }] = await query<any>(`INSERT INTO companies (name) VALUES ('ZZ Meetings Test Co') RETURNING id`);
  const mk = async (name: string, email: string, out = false) => Number((await query<any>(`INSERT INTO contacts (company_id, name, email, consent_basis, opted_out, opted_out_at) VALUES ($1,$2,$3,'booking',$4::boolean, CASE WHEN $4::boolean THEN now() END) RETURNING id`, [companyId, name, email, out]))[0].id);
  const okC = await mk("ZZ Okay Person", "zz-ok@zz-meetings.example.com");
  const outC = await mk("ZZ Opted Out", "zz-out@zz-meetings.example.com", true);
  await query(`INSERT INTO suppression (domain, reason) VALUES ('zz-suppressed.example.com', 'ZZ test')`);
  const supC = await mk("ZZ Suppressed", "someone@zz-suppressed.example.com");
  await query(`INSERT INTO calendar_connections (email, refresh_token_enc) VALUES ('zz-calendar@example.com', $1)`, [encryptToken("refresh-test", process.env.SESSION_SECRET ?? "")]);

  const base = { contact_id: String(okC), title: "ZZ Intro call", notes: "Business topics only.", date: tomorrow, time: "10:00", length: "30", agreed: "on" };
  let r: any = await createBooking(form({ ...base, agreed: "" }));
  ok(!!r.error && /agreed/.test(r.error), "refuses without the 'they agreed' tick", JSON.stringify(r));
  r = await createBooking(form({ ...base, contact_id: String(outC) }));
  ok(!!r.error && /opted out/.test(r.error), "refuses a person who opted out", JSON.stringify(r));
  r = await createBooking(form({ ...base, contact_id: String(supC) }));
  ok(!!r.error && /suppression/.test(r.error), "refuses a suppressed domain", JSON.stringify(r));
  ok(calls.filter((c) => c.method === "POST" && c.url.includes("/events")).length === 0, "nothing was sent to Google for any refused booking");

  r = await createBooking(form(base));
  ok(!r.error && r.id > 0, "books a normal meeting", JSON.stringify(r));
  const post = calls.find((c) => c.method === "POST" && c.url.includes("/events"));
  ok(!!post && /sendUpdates=all/.test(post.url) && /conferenceDataVersion=1/.test(post.url), "Google is asked to email the invitation and make a Meet link", post?.url);
  ok(post?.body?.attendees?.length === 1 && post.body.attendees[0].email === "zz-ok@zz-meetings.example.com", "the person is the only guest");
  ok(/Booked by Test Sender, Test Business/.test(post?.body?.description ?? "") && /Reply 'no' and I won't email again\./.test(post?.body?.description ?? ""), "the invitation names the sender and carries the opt-out line");
  ok(post?.body?.start?.dateTime === ukToInstant(tomorrow, "10:00")!.toISOString(), "the start is 10:00 UK time");
  const [m] = await query<any>(`SELECT status, meet_url, google_event_id FROM meetings WHERE id = $1`, [r.id]);
  ok(m.status === "scheduled" && /meet\.google\.com/.test(m.meet_url) && !!m.google_event_id, "the meeting is saved as scheduled with its Meet link");
  const [a] = await query<any>(`SELECT count(*) n FROM activities WHERE type = 'meeting_booked' AND company_id = $1`, [companyId]);
  ok(Number(a.n) === 1, "the booking is logged as an activity");

  r = await createBooking(form(base));
  ok(!!r.error && /already has a meeting/.test(r.error), "refuses a double booking at the same time", JSON.stringify(r));

  const clashStart = ukToInstant(tomorrow, "14:00")!;
  listItems = [{ id: "x1", summary: "Dentist", start: { dateTime: clashStart.toISOString() }, end: { dateTime: new Date(clashStart.getTime() + 3600_000).toISOString() } }];
  r = await createBooking(form({ ...base, time: "14:15" }));
  ok(!!r.error && /clashes with "Dentist"/.test(r.error), "warns about a clash with another event", JSON.stringify(r));
  r = await createBooking(form({ ...base, time: "14:15", allow_clash: "on" }));
  ok(!r.error, "books anyway when the owner ticks 'book it anyway'", JSON.stringify(r));
  listItems = [];

  const view = await loadWeekView(tomorrow);
  const dayItems = view.byDay[tomorrow] ?? [];
  ok(view.connected && dayItems.some((i: any) => i.kind === "meeting" && i.title === "ZZ Intro call"), "the week view shows the meeting booked here", JSON.stringify(dayItems.map((i: any) => i.title)));
  const bc = await bookableContacts();
  ok(bc.some((c: any) => c.id === okC) && !bc.some((c: any) => c.id === outC) && !bc.some((c: any) => c.id === supC), "the contact list offers the okay person, not the opted-out or suppressed ones");

  process.env.CALENDAR_DAILY_CAP = "1";
  r = await createBooking(form({ ...base, time: "16:00" }));
  ok(!!r.error && /limit/.test(r.error), "stops at the daily cap", JSON.stringify(r));
  process.env.CALENDAR_DAILY_CAP = "10";

  mode = "fail";
  r = await createBooking(form({ ...base, time: "17:00" }));
  const failed = await query<any>(`SELECT status FROM meetings WHERE company_id = $1 AND status = 'failed'`, [companyId]);
  ok(!!r.error && /Nothing was sent/.test(r.error) && failed.length === 1, "when Google fails, nothing is claimed as sent and the row is marked failed", JSON.stringify(r));
  mode = "ok";

  let guard = "";
  try { await query(`INSERT INTO meetings (company_id, contact_id, title, starts_at, ends_at, attendee_email) VALUES ($1,$2,'ZZ x', now() + interval '2 days', now() + interval '2 days 30 minutes', 'zz-out@zz-meetings.example.com')`, [companyId, outC]); } catch (e: any) { guard = e.message; }
  ok(/Blocked/.test(guard), "the database itself refuses a meeting with an opted-out person", guard);
  guard = "";
  try { await query(`INSERT INTO meetings (company_id, title, starts_at, ends_at, attendee_email) VALUES ($1,'ZZ y', now() + interval '2 days', now() + interval '2 days 30 minutes', 'x@zz-suppressed.example.com')`, [companyId]); } catch (e: any) { guard = e.message; }
  ok(/suppression/.test(guard), "the database refuses a suppressed domain even without a contact", guard);
} catch (e: any) {
  fail++; console.log('ERROR', e?.message ?? e);
} finally {
  if (companyId) {
    await query(`DELETE FROM meetings WHERE company_id = $1`, [companyId]);
    await query(`DELETE FROM activities WHERE company_id = $1`, [companyId]);
    await query(`DELETE FROM contacts WHERE company_id = $1`, [companyId]);
    await query(`DELETE FROM companies WHERE id = $1`, [companyId]);
  }
  await query(`DELETE FROM suppression WHERE reason = 'ZZ test'`);
  await query(`DELETE FROM calendar_connections WHERE email = 'zz-calendar@example.com'`);
  const after = await counts();
  console.log("after ", JSON.stringify(after));
  console.log(JSON.stringify(before) === JSON.stringify(after) ? "CLEAN: row counts are back to what they were" : "WARNING: row counts differ");
  console.log(`${pass} passed, ${fail} failed`);
  server.close();
  process.exit(fail ? 1 : 0);
}
