import test from "node:test";
import assert from "node:assert/strict";
import { applyIncomingTask, dueToSlot, normaliseSyncEvent, planTaskSync, stripTaskPrefix, taskEventBody, taskHash } from "../lib/calendarSyncMath.ts";

const NOW = new Date("2026-11-03T10:00:00Z");
const task = (o = {}) => ({ id: 7, title: "Email Sam", due_at: "2026-11-05T00:00:00Z", done_at: null, google_event_id: null, google_hash: null, google_unlinked: false, ...o });

test("a date-only due is an all-day event, a due with a time is a 30 minute slot (in UK time)", () => {
  const d = dueToSlot(new Date("2026-11-05T00:00:00Z"));
  assert.deepEqual([d.allDay, d.date, d.end.toISOString()], [true, "2026-11-05", "2026-11-06T00:00:00.000Z"]);
  const summer = dueToSlot(new Date("2026-07-01T23:00:00Z"));            // midnight in London in summer
  assert.deepEqual([summer.allDay, summer.date], [true, "2026-07-02"]);
  const t = dueToSlot(new Date("2026-11-05T14:30:00Z"));
  assert.deepEqual([t.allDay, t.end.getTime() - t.start.getTime()], [false, 30 * 60_000]);
});

test("the event for a task has no guests, is free time, has no reminders, and is tagged with the task", () => {
  const b = taskEventBody({ id: 7, title: "  Email   Sam ", company_name: "Oakley Dental" }, new Date("2026-11-05T14:30:00Z"));
  assert.equal(b.summary, "☐ Email Sam");
  assert.equal(b.attendees, undefined);
  assert.deepEqual([b.transparency, b.reminders.useDefault, b.extendedProperties.private.crm_kind, b.extendedProperties.private.crm_task_id], ["transparent", false, "task", "7"]);
  assert.equal(b.start.dateTime, "2026-11-05T14:30:00.000Z");
  assert.match(b.description, /Oakley Dental/);
  const day = taskEventBody({ id: 8, title: "x" }, new Date("2026-11-05T00:00:00Z"));
  assert.deepEqual([day.start, day.end], [{ date: "2026-11-05" }, { date: "2026-11-06" }]);
});

test("the fingerprint changes with the title or the time, not with spacing", () => {
  const due = new Date("2026-11-05T14:30:00Z");
  assert.equal(taskHash("Email  Sam", due), taskHash(" Email Sam ", due));
  assert.notEqual(taskHash("Email Sam", due), taskHash("Email Sam!", due));
  assert.notEqual(taskHash("Email Sam", due), taskHash("Email Sam", new Date("2026-11-05T15:00:00Z")));
});

test("planning: create what has no event, update what changed, remove what is done, undated, far off or gone from the window", () => {
  const hashed = (o) => task({ google_event_id: "ev", google_hash: taskHash(o.title ?? "Email Sam", new Date(o.due_at ?? "2026-11-05T00:00:00Z")), ...o });
  const plan = planTaskSync([
    task({ id: 1 }),                                                    // new: create
    hashed({ id: 2 }),                                                  // in step: nothing
    hashed({ id: 3, title: "Email Sam" }) && { ...hashed({ id: 3 }), title: "Call Sam" },   // renamed in the CRM: update
    hashed({ id: 4, done_at: "2026-11-03T09:00:00Z" }),                 // ticked off: remove
    hashed({ id: 5, due_at: null }),                                    // due date cleared: remove
    task({ id: 6, due_at: "2026-10-20T00:00:00Z" }),                    // overdue by weeks: not mirrored
    task({ id: 8, google_unlinked: true }),                             // the owner stopped syncing it
    task({ id: 9, done_at: "2026-11-03T09:00:00Z" }),                   // done and never mirrored: nothing
    hashed({ id: 10, due_at: "2029-01-01T00:00:00Z" }),                 // too far ahead: remove
  ], NOW);
  assert.deepEqual(plan.create.map((t) => t.id), [1]);
  assert.deepEqual(plan.update.map((t) => t.id), [3]);
  assert.deepEqual(plan.remove.map((t) => t.id), [4, 5, 10]);
});

test("Google events are reduced to what the CRM keeps; private events become Busy; guests are only listed, never the owner", () => {
  const e = normaliseSyncEvent({
    id: "e1", status: "confirmed", summary: "Intro call", start: { dateTime: "2026-11-05T10:00:00Z" }, end: { dateTime: "2026-11-05T10:30:00Z" },
    hangoutLink: "https://meet.google.com/abc", htmlLink: "https://www.google.com/calendar/event?eid=1",
    attendees: [{ email: "Me@Biz.example.com", self: true }, { email: "Sam@Oakley.example.com" }, { email: "room@res.example.com", resource: true }],
    description: "should never be read", location: "nor this",
  });
  assert.deepEqual([e.title, e.guests, e.meetUrl !== null, e.allDay], ["Intro call", ["sam@oakley.example.com"], true, false]);
  assert.equal("description" in e, false);
  const p = normaliseSyncEvent({ id: "e2", summary: "Dentist", visibility: "private", start: { dateTime: "2026-11-05T10:00:00Z" }, end: { dateTime: "2026-11-05T11:00:00Z" }, hangoutLink: "https://meet.google.com/x" });
  assert.deepEqual([p.title, p.meetUrl], ["Busy", null]);
  const day = normaliseSyncEvent({ id: "e3", summary: "Away", start: { date: "2026-11-06" }, end: { date: "2026-11-08" } });
  assert.deepEqual([day.allDay, day.start.toISOString(), day.end.toISOString()], [true, "2026-11-06T00:00:00.000Z", "2026-11-08T00:00:00.000Z"]);
  const gone = normaliseSyncEvent({ id: "e4", status: "cancelled" });
  assert.deepEqual([gone.status, gone.start], ["cancelled", null]);
  assert.equal(normaliseSyncEvent({ id: "e5", summary: "x", start: { dateTime: "garbage" }, end: { dateTime: "garbage" } }), null);
  assert.equal(normaliseSyncEvent({}), null);
  const t = normaliseSyncEvent({ id: "e6", summary: "☐ Email Sam", start: { dateTime: "2026-11-05T10:00:00Z" }, end: { dateTime: "2026-11-05T10:30:00Z" }, extendedProperties: { private: { crm_kind: "task", crm_task_id: "7" } } });
  assert.deepEqual([t.crmKind, t.crmTaskId], ["task", 7]);
});

test("a change in Google comes back to the task, but our own echo does nothing", () => {
  const due = new Date("2026-11-05T14:30:00Z");
  const synced = { title: "Email Sam", google_hash: taskHash("Email Sam", due) };
  const ev = (o) => normaliseSyncEvent({ id: "e", summary: "☐ Email Sam", start: { dateTime: "2026-11-05T14:30:00Z" }, end: { dateTime: "2026-11-05T15:00:00Z" }, ...o });
  assert.deepEqual(applyIncomingTask(synced, ev({})), { action: "noop" });                       // echo of our own push
  const moved = applyIncomingTask(synced, ev({ start: { dateTime: "2026-11-06T09:00:00Z" }, end: { dateTime: "2026-11-06T09:30:00Z" } }));
  assert.deepEqual([moved.action, moved.due.toISOString()], ["update", "2026-11-06T09:00:00.000Z"]);
  const renamed = applyIncomingTask(synced, ev({ summary: "☐ Call Sam instead" }));
  assert.deepEqual([renamed.action, renamed.title], ["update", "Call Sam instead"]);
  assert.equal(applyIncomingTask(synced, ev({ summary: "☐ " })).action === "update" ? applyIncomingTask(synced, ev({ summary: "☐ " })).title : "x", "x");   // an emptied title keeps the old one (hash is then the same)
  assert.deepEqual(applyIncomingTask(synced, normaliseSyncEvent({ id: "e", status: "cancelled" })), { action: "unlink" });
  assert.equal(stripTaskPrefix("✓ Done thing"), "Done thing");
});

test("fractions of a second do not make a task look changed (Google keeps whole seconds)", () => {
  const exact = new Date("2026-11-06T23:11:22.000Z"), withMs = new Date("2026-11-06T23:11:22.942Z");
  assert.equal(taskHash("Follow up", withMs), taskHash("Follow up", exact));
  assert.equal(taskEventBody({ id: 1, title: "x" }, withMs).start.dateTime, "2026-11-06T23:11:22.000Z");
  const echoed = normaliseSyncEvent({ id: "e", summary: "☐ Follow up", start: { dateTime: "2026-11-06T23:11:22Z" }, end: { dateTime: "2026-11-06T23:41:22Z" } });
  assert.deepEqual(applyIncomingTask({ title: "Follow up", google_hash: taskHash("Follow up", withMs) }, echoed), { action: "noop" });
});
