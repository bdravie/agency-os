import test from "node:test";
import assert from "node:assert/strict";
import { addDays, buildDescription, buildEventBody, checkBooking, clashes, dayKey, groupByDay, mondayOf, normaliseEvent, ukToInstant, weekOf } from "../lib/meetingMath.ts";

const NOW = new Date("2026-11-03T10:00:00Z");
const good = { title: "Intro call: Oakley Dental", notes: "Looking at the enquiry tracker.", date: "2026-11-12", time: "14:30", length: 30, email: "Sam@Oakley-Dental.example.com" };

test("UK time: winter is UTC, summer is an hour earlier in UTC, impossible times are refused", () => {
  assert.equal(ukToInstant("2026-11-12", "14:30").toISOString(), "2026-11-12T14:30:00.000Z");
  assert.equal(ukToInstant("2026-07-01", "14:30").toISOString(), "2026-07-01T13:30:00.000Z");
  assert.equal(ukToInstant("2026-03-29", "01:30"), null);   // the hour skipped when the clocks go forward
  assert.equal(ukToInstant("2026-02-30", "10:00"), null);
  assert.equal(ukToInstant("2026-11-31", "10:00"), null);
  assert.equal(ukToInstant("12/11/2026", "10:00"), null);
  assert.equal(ukToInstant("2026-11-12", "25:00"), null);
});

test("a good booking: lower-cased email, tidy title, the end is start plus the length", () => {
  const c = checkBooking(good, NOW);
  assert.equal(c.error, undefined);
  assert.equal(c.email, "sam@oakley-dental.example.com");
  assert.equal(c.end.getTime() - c.start.getTime(), 30 * 60_000);
  assert.equal(c.start.toISOString(), "2026-11-12T14:30:00.000Z");
});

test("a booking is refused for a bad email, title, note, length, time, past or far future", () => {
  const err = (patch) => checkBooking({ ...good, ...patch }, NOW).error;
  assert.match(err({ email: "not an email" }), /email/);
  assert.match(err({ email: "a@b.c" }), /email/);
  assert.match(err({ title: "Hi" }), /title/);
  assert.match(err({ title: "x".repeat(121) }), /title/);
  assert.match(err({ notes: "x".repeat(1001) }), /1,000/);
  assert.match(err({ length: 20 }), /length/);
  assert.match(err({ date: "2026-02-30" }), /does not exist/);
  assert.match(err({ time: "05:45" }), /between 06:00 and 21:30/);
  assert.match(err({ time: "21:45" }), /between 06:00 and 21:30/);
  assert.equal(err({ time: "21:30" }), undefined);
  assert.match(err({ date: "2026-11-03", time: "10:02" }), /future/);
  assert.match(err({ date: "2027-06-01" }), /six months/);
});

test("notes lose angle brackets and control characters, and the title loses stray spaces", () => {
  const c = checkBooking({ ...good, title: "  Intro   call \n today ", notes: "<b>Hi</b>\u0007 there" }, NOW);
  assert.equal(c.title, "Intro call today");
  assert.equal(c.notes, "bHi/b there");
});

test("the invitation text names who booked it and carries the opt-out line", () => {
  const d = buildDescription("See you then.", "Brad Dravie", "Agency Ltd");
  assert.match(d, /^See you then\./);
  assert.match(d, /Booked by Brad Dravie, Agency Ltd/);
  assert.match(d, /Reply 'no' and I won't email again\./);
  assert.ok(!buildDescription("", "A", "B").startsWith("\n"));
});

test("the Google event asks for a Meet link, has one guest and stops guests changing or forwarding it", () => {
  const start = new Date("2026-11-12T14:30:00Z"), end = new Date("2026-11-12T15:00:00Z");
  const b = buildEventBody({ title: "T", description: "D", start, end, email: "a@b.example.com", requestId: "req-1" });
  assert.deepEqual(b.attendees, [{ email: "a@b.example.com" }]);
  assert.equal(b.conferenceData.createRequest.conferenceSolutionKey.type, "hangoutsMeet");
  assert.equal(b.conferenceData.createRequest.requestId, "req-1");
  assert.deepEqual([b.guestsCanModify, b.guestsCanInviteOthers, b.guestsCanSeeOtherGuests], [false, false, false]);
  assert.equal(b.start.timeZone, "Europe/London");
});

test("Google events: private ones show as Busy, all-day are recognised, cancelled and odd links are dropped", () => {
  const timed = normaliseEvent({ id: "a", summary: "Call", start: { dateTime: "2026-11-12T14:00:00Z" }, end: { dateTime: "2026-11-12T14:30:00Z" }, hangoutLink: "https://meet.google.com/abc-defg-hij", htmlLink: "https://www.google.com/calendar/event?eid=1" });
  assert.deepEqual([timed.title, timed.allDay, timed.meetUrl, timed.link], ["Call", false, "https://meet.google.com/abc-defg-hij", "https://www.google.com/calendar/event?eid=1"]);
  const priv = normaliseEvent({ id: "b", summary: "Dentist", visibility: "private", start: { dateTime: "2026-11-12T14:00:00Z" }, end: { dateTime: "2026-11-12T15:00:00Z" }, hangoutLink: "https://meet.google.com/x" });
  assert.deepEqual([priv.title, priv.meetUrl, priv.link], ["Busy", null, null]);
  const day = normaliseEvent({ id: "c", summary: "Away", start: { date: "2026-11-12" }, end: { date: "2026-11-13" } });
  assert.equal(day.allDay, true);
  assert.equal(normaliseEvent({ id: "d", status: "cancelled", start: { dateTime: "2026-11-12T14:00:00Z" }, end: { dateTime: "2026-11-12T15:00:00Z" } }), null);
  assert.equal(normaliseEvent({ id: "e", summary: "X", start: { dateTime: "garbage" }, end: { dateTime: "garbage" } }), null);
  const odd = normaliseEvent({ id: "f", summary: "X", start: { dateTime: "2026-11-12T14:00:00Z" }, end: { dateTime: "2026-11-12T15:00:00Z" }, hangoutLink: "https://evil.example.com/meet", htmlLink: "javascript:alert(1)" });
  assert.deepEqual([odd.meetUrl, odd.link], [null, null]);
});

test("clashes: overlapping timed events count, back-to-back and all-day do not", () => {
  const ev = (s, e, allDay = false) => ({ id: s, title: "x", start: new Date(s), end: new Date(e), allDay, meetUrl: null, link: null });
  const events = [ev("2026-11-12T14:00:00Z", "2026-11-12T14:30:00Z"), ev("2026-11-12T15:00:00Z", "2026-11-12T16:00:00Z"), ev("2026-11-12T00:00:00Z", "2026-11-13T00:00:00Z", true)];
  const s = new Date("2026-11-12T14:30:00Z"), e = new Date("2026-11-12T15:00:00Z");
  assert.equal(clashes(events, s, e).length, 0);                                           // fits exactly between the two
  assert.equal(clashes(events, new Date("2026-11-12T14:15:00Z"), new Date("2026-11-12T14:45:00Z")).length, 1);
});

test("weeks run Monday to Sunday in UK time, even across the clocks changing", () => {
  assert.equal(mondayOf("2026-11-04"), "2026-11-02");
  assert.equal(mondayOf("2026-11-08"), "2026-11-02");   // a Sunday belongs to the week before it
  assert.equal(mondayOf("2026-11-02"), "2026-11-02");
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
  const w = weekOf("2026-11-04");
  assert.equal(w.days.length, 7);
  assert.deepEqual([w.days[0], w.days[6]], ["2026-11-02", "2026-11-08"]);
  assert.deepEqual([w.from.toISOString(), w.to.toISOString()], ["2026-11-02T00:00:00.000Z", "2026-11-09T00:00:00.000Z"]);
  const spring = weekOf("2026-03-25");
  assert.equal(spring.to.toISOString(), "2026-03-29T23:00:00.000Z");   // Monday 30 March 00:00 is already summer time
  assert.equal(dayKey(new Date("2026-07-01T23:30:00Z")), "2026-07-02");
});

test("grouping by day: timed events on their UK day, all-day events on every day they cover, empty days kept", () => {
  const days = weekOf("2026-11-04").days;
  const items = [
    { id: "t", start: new Date("2026-11-04T09:00:00Z"), end: new Date("2026-11-04T10:00:00Z"), allDay: false },
    { id: "a", start: new Date("2026-11-05T00:00:00Z"), end: new Date("2026-11-07T00:00:00Z"), allDay: true },   // 5th and 6th
    { id: "o", start: new Date("2026-12-25T09:00:00Z"), end: new Date("2026-12-25T10:00:00Z"), allDay: false },    // outside the week
  ];
  const g = groupByDay(items, days);
  assert.deepEqual(g["2026-11-04"].map((x) => x.id), ["t"]);
  assert.deepEqual([g["2026-11-05"].length, g["2026-11-06"].length, g["2026-11-07"].length], [1, 1, 0]);
  assert.deepEqual(Object.keys(g).length, 7);
  assert.equal(Object.values(g).flat().some((x) => x.id === "o"), false);
});

test("a month is drawn as whole weeks, Monday to Sunday", async () => {
  const { monthOf, addMonths } = await import("../lib/meetingMath.ts");
  const nov = monthOf("2026-11-11");            // 1 Nov 2026 is a Sunday, 30 Nov a Monday
  assert.equal(nov.month, "2026-11");
  assert.equal(nov.days[0], "2026-10-26");
  assert.equal(nov.days.at(-1), "2026-12-06");
  assert.equal(nov.days.length, 42);
  assert.equal(nov.to.getTime() - nov.from.getTime(), 42 * 86_400_000);
  const feb = monthOf("2027-02-15");            // February 2027 starts on a Monday and fills exactly four weeks
  assert.deepEqual([feb.days[0], feb.days.at(-1), feb.days.length], ["2027-02-01", "2027-02-28", 28]);
  const mar = monthOf("2026-03-10");            // the clocks change on 29 March: the window is an hour short, the days are not
  assert.equal(mar.days.length, 42);
  assert.equal(mar.to.getTime() - mar.from.getTime(), 42 * 86_400_000 - 3_600_000);
  assert.equal(addMonths("2026-12", 1), "2027-01");
  assert.equal(addMonths("2026-01", -1), "2025-12");
});
