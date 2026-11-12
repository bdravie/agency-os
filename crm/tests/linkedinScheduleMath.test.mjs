import test from "node:test";
import assert from "node:assert/strict";
import { linkedinGroups, plannedLabel, readiness, reminderTitle, scheduleProblem, shortTime, suggestLinkedInSlots, weekdayOfDate } from "../lib/linkedinScheduleMath.ts";
import { dayPart, weekdayOf } from "../lib/insightsMath.ts";

// 2026-11-12 is a Thursday.
const TODAY = "2026-11-12";

test("weekdays come from the date itself", () => {
  assert.equal(weekdayOfDate("2026-11-12"), "Thursday");
  assert.equal(weekdayOfDate("2026-11-16"), "Monday");
  assert.equal(weekdayOfDate("2026-03-29"), "Sunday");   // the day the clocks change
});

test("with no LinkedIn history the slots are a labelled starting guess: midweek mornings", () => {
  const slots = suggestLinkedInSlots({ weekdays: [], parts: [], today: TODAY, nowTime: "07:00", planned: [] });
  assert.deepEqual(slots.map((s) => [s.date, s.weekday, s.time]), [["2026-11-12", "Thursday", "08:00"], ["2026-11-17", "Tuesday", "08:00"], ["2026-11-18", "Wednesday", "08:00"]]);
  assert.ok(slots.every((s) => /starting/.test(s.why)));
});

test("a slot already past today moves to next week", () => {
  const slots = suggestLinkedInSlots({ weekdays: [], parts: [], today: TODAY, nowTime: "09:30", planned: [] });
  assert.ok(!slots.some((s) => s.date === TODAY));
  assert.ok(slots.some((s) => s.date === "2026-11-19"));
});

test("a day that already has a post is skipped for the same weekday the week after", () => {
  const slots = suggestLinkedInSlots({ weekdays: [], parts: [], today: TODAY, nowTime: "07:00", planned: ["2026-11-17"] });
  const tue = slots.find((s) => s.weekday === "Tuesday");
  assert.equal(tue.date, "2026-11-24");
  assert.equal(tue.taken, 0);
});

test("trusted LinkedIn weekdays and time beat the guess; thin groups are ignored", () => {
  const weekdays = [{ key: "Friday", n: 4, median: 1.8, thin: false }, { key: "Monday", n: 2, median: 9, thin: true }, { key: "Wednesday", n: 3, median: 1.2, thin: false }];
  const parts = [{ key: "Midday (11am to 2pm)", n: 5, median: 1.4, thin: false }];
  const slots = suggestLinkedInSlots({ weekdays, parts, today: TODAY, nowTime: "07:00", planned: [] });
  assert.deepEqual(slots.map((s) => s.weekday), ["Friday", "Tuesday", "Wednesday"]);
  assert.ok(slots.every((s) => s.time === "12:00"));
  assert.match(slots.find((s) => s.weekday === "Friday").why, /best days.*1\.8×.*4 posts.*midday is your best time/);
  assert.ok(!slots.some((s) => s.weekday === "Monday"));
});

test("only scored LinkedIn posts count towards the groups", () => {
  const posts = [
    { platform: "linkedin", multiple: 1.5, postedAt: "2026-11-03T08:10:00Z" },
    { platform: "linkedin", multiple: null, postedAt: "2026-11-04T08:10:00Z" },
    { platform: "instagram", multiple: 3, postedAt: "2026-11-03T08:10:00Z" },
  ];
  const g = linkedinGroups(posts, weekdayOf, dayPart);
  assert.equal(g.scored, 1);
  assert.deepEqual(g.weekdays.map((x) => [x.key, x.n, x.thin]), [["Tuesday", 1, true]]);
  assert.equal(g.parts[0].key, "Morning (5am to 11am)");
});

test("a plan is refused for a time with no day, bad formats and days a year away", () => {
  assert.equal(scheduleProblem(null, null, TODAY), null);
  assert.equal(scheduleProblem("2026-11-20", null, TODAY), null);
  assert.equal(scheduleProblem("2026-11-20", "08:30", TODAY), null);
  assert.match(scheduleProblem(null, "08:30", TODAY), /day as well/);
  assert.match(scheduleProblem("20/11/2026", null, TODAY), /not a date/);
  assert.match(scheduleProblem("2026-11-20", "25:00", TODAY), /not a time/);
  assert.match(scheduleProblem("2028-01-01", null, TODAY), /year away/);
});

test("reminder titles, times and labels", () => {
  assert.equal(reminderTitle("  Why quotes   go cold "), "Post on LinkedIn: Why quotes go cold");
  assert.equal(reminderTitle(""), "Post on LinkedIn: untitled post");
  assert.ok(reminderTitle("x".repeat(200)).length <= 100);
  assert.equal(shortTime("08:00:00"), "08:00");
  assert.equal(shortTime(null), null);
  assert.equal(plannedLabel("2026-11-17", "08:00"), "Tue 17 Nov, 08:00");
  assert.equal(plannedLabel("2026-11-17", null), "Tue 17 Nov");
});

test("readiness lists what is left, with the reason a post cannot be saved", () => {
  const r = readiness({ text: "Some words", problem: null, hasImage: false, date: "2026-11-17", reminder: false, posted: false });
  assert.deepEqual(r.map((x) => x.done), [true, false, true, false, false]);
  assert.equal(readiness({ text: "x", problem: "Too long", hasImage: true, date: null, reminder: false, posted: false })[0].hint, "Too long");
});
