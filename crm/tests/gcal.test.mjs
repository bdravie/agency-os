import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";

// A stand-in for Google Calendar, so nothing real is called.
let seen = [];
let mode = "ok";
const server = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    seen.push({ method: req.method, url: req.url, auth: req.headers.authorization, body: body ? JSON.parse(body) : null });
    const send = (status, json) => { res.writeHead(status, { "Content-Type": "application/json" }); res.end(json === undefined ? "" : JSON.stringify(json)); };
    if (mode === "401") return send(401, { error: { message: "Invalid Credentials" } });
    if (mode === "disabled") return send(403, { error: { message: "Google Calendar API has not been used in project 123 before or it is disabled.", errors: [{ reason: "accessNotConfigured" }] } });
    if (mode === "gone") return send(410, { error: { message: "Resource has been deleted" } });
    if (req.method === "GET" && req.url.includes("/events?")) return send(200, { items: [
      { id: "1", summary: "Standup", start: { dateTime: "2026-11-12T09:00:00Z" }, end: { dateTime: "2026-11-12T09:15:00Z" }, hangoutLink: "https://meet.google.com/aaa-bbbb-ccc" },
      { id: "2", status: "cancelled", start: { dateTime: "2026-11-12T10:00:00Z" }, end: { dateTime: "2026-11-12T11:00:00Z" } },
    ] });
    if (req.method === "POST") return send(200, mode === "pending" ? { id: "ev1", htmlLink: "https://www.google.com/calendar/event?eid=zz" } : { id: "ev1", hangoutLink: "https://meet.google.com/xyz-abcd-efg", htmlLink: "https://www.google.com/calendar/event?eid=zz" });
    if (req.method === "GET") return send(200, { id: "ev1", hangoutLink: "https://meet.google.com/late-link-now", htmlLink: "https://www.google.com/calendar/event?eid=zz" });
    if (req.method === "DELETE") return send(204);
    send(404, {});
  });
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
process.env.GOOGLE_CALENDAR_API_BASE = `http://127.0.0.1:${server.address().port}`;
process.env.GOOGLE_MEET_POLL_MS = "1";
const { listEvents, createMeetEvent, cancelEvent, CalendarAuthError } = await import("../lib/gcal.ts");
test.after(() => server.close());
test.beforeEach(() => { seen = []; mode = "ok"; });

test("listing: asks only for titles, times and links (no guest lists), sends the token, drops cancelled events", async () => {
  const ev = await listEvents("tok", "primary", new Date("2026-11-09T00:00:00Z"), new Date("2026-11-16T00:00:00Z"));
  assert.equal(ev.length, 1);
  assert.equal(ev[0].meetUrl, "https://meet.google.com/aaa-bbbb-ccc");
  assert.equal(seen[0].auth, "Bearer tok");
  assert.match(seen[0].url, /singleEvents=true/);
  assert.doesNotMatch(decodeURIComponent(seen[0].url), /attendees/);
  assert.match(seen[0].url, /\/calendars\/primary\/events/);
});

test("creating: Google is told to email the guest and to make a Meet link, and the link comes back", async () => {
  const c = await createMeetEvent("tok", "primary", { summary: "T" });
  assert.deepEqual([c.id, c.meetUrl], ["ev1", "https://meet.google.com/xyz-abcd-efg"]);
  assert.match(seen[0].url, /sendUpdates=all/);
  assert.match(seen[0].url, /conferenceDataVersion=1/);
  assert.deepEqual(seen[0].body, { summary: "T" });
  assert.equal(seen.length, 1);
});

test("creating: a Meet link that is not ready straight away is fetched again", async () => {
  mode = "pending";
  const c = await createMeetEvent("tok", "me@example.com", {});
  assert.equal(c.meetUrl, "https://meet.google.com/late-link-now");
  assert.ok(seen.length >= 2);
  assert.match(seen[1].url, /\/calendars\/me%40example\.com\/events\/ev1/);
});

test("cancelling: Google is told to email the guest, and an event that is already gone counts as done", async () => {
  await cancelEvent("tok", "primary", "ev1");
  assert.match(seen[0].url, /sendUpdates=all/);
  assert.equal(seen[0].method, "DELETE");
  mode = "gone";
  await cancelEvent("tok", "primary", "ev1");
});

test("errors are plain: expired access, and the Calendar API being switched off", async () => {
  mode = "401";
  await assert.rejects(() => listEvents("tok", "primary", new Date(), new Date()), (e) => e instanceof CalendarAuthError && /Connect the calendar again/.test(e.message));
  mode = "disabled";
  await assert.rejects(() => createMeetEvent("tok", "primary", {}), /Google Calendar API/);
});
