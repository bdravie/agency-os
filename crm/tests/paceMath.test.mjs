import test from "node:test";
import assert from "node:assert/strict";
import { elapsedFractions, goalProgress, londonParts, parseTargets, summarise } from "../lib/paceMath.ts";

test("targets: defaults, the owner's numbers, and nonsense ignored", () => {
  const d = parseTargets(undefined, 4);
  assert.deepEqual([d.today.emails_sent, d.week.new_leads, d.week.calls_booked, d.week.posts_published, d.month.revenue_gbp, d.month.deals_won, d.month.new_leads], [5, 15, 3, 4, 6000, 3, 60]);
  const t = parseTargets({ today: { emails_sent: 8 }, week: { new_leads: "lots", posts_published: 6 }, month: { revenue_gbp: 9000.5, deals_won: -2 } }, 4);
  assert.deepEqual([t.today.emails_sent, t.week.new_leads, t.week.posts_published, t.month.revenue_gbp, t.month.deals_won], [8, 15, 6, 9000.5, 3]);
  assert.equal(parseTargets({}, 5).week.posts_published, 5);
});

test("UK time: winter is UTC, summer is an hour ahead, weekday 1 is Monday", () => {
  assert.deepEqual(londonParts(new Date("2026-11-03T20:28:00Z")), { year: 2026, month: 11, day: 3, hour: 20, minute: 28, weekday: 2 });
  assert.equal(londonParts(new Date("2026-07-01T23:30:00Z")).day, 2);       // 00:30 on 2 July in London
  assert.equal(londonParts(new Date("2026-11-02T00:00:00Z")).weekday, 1);   // Monday
  assert.equal(londonParts(new Date("2026-11-08T12:00:00Z")).weekday, 7);   // Sunday
});

test("elapsed: Monday midnight is 0, Wednesday noon is 2.5 days of 7, the month counts its own length", () => {
  assert.equal(elapsedFractions(new Date("2026-11-02T00:00:00Z")).week, 0);
  assert.ok(Math.abs(elapsedFractions(new Date("2026-11-04T12:00:00Z")).week - 2.5 / 7) < 1e-9);
  const m = elapsedFractions(new Date("2026-02-15T12:00:00Z"));
  assert.equal(m.daysInMonth, 28);
  assert.ok(Math.abs(m.month - 14.5 / 28) < 1e-9);
  assert.equal(elapsedFractions(new Date("2026-11-03T20:28:00Z")).dayOfWeek, 2);
});

test("a goal: percentage, bar fill capped at 100, pace tick and projection", () => {
  const g = goalProgress("leads", "New leads", 6, 15, 2 / 7);
  assert.deepEqual([g.pct, g.fill, g.pace, g.projected], [40, 40, 29, 21]);
  assert.equal(g.status, "on_track");
  const over = goalProgress("x", "X", 20, 15, 0.5);
  assert.deepEqual([over.pct, over.fill, over.status], [133, 100, "done"]);
});

test("status: too early to say, on track within 90% of the target, otherwise behind", () => {
  assert.equal(goalProgress("a", "A", 0, 10, 0.1).status, "early");
  assert.equal(goalProgress("a", "A", 0, 10, 0.1).projected, null);
  assert.equal(goalProgress("a", "A", 4, 10, 0.5).status, "behind");     // heading for 8 of 10
  assert.equal(goalProgress("a", "A", 5, 10, 0.5).status, "on_track");   // heading for 10 of 10
  assert.equal(goalProgress("a", "A", 9, 10, 0.5).status, "on_track");
});

test("today has no pace tick and no projection, and never divides by a zero target", () => {
  const t = goalProgress("tasks", "Tasks done", 3, 5, null);
  assert.deepEqual([t.pct, t.pace, t.projected, t.status], [60, null, null, "none"]);
  const z = goalProgress("tasks", "Tasks done", 0, 0, null);
  assert.deepEqual([z.pct, z.fill, z.status], [100, 100, "done"]);   // nothing due counts as complete
  assert.equal(goalProgress("x", "X", -3, 5, null).value, 0);
});

test("a card: the ring is the average fill and the status is the worst one", () => {
  const goals = [goalProgress("a", "A", 4, 10, 0.5), goalProgress("b", "B", 10, 10, 0.5)];
  assert.deepEqual(summarise(goals), { ring: 70, status: "behind" });
  assert.deepEqual(summarise([goalProgress("a", "A", 10, 10, 0.5), goalProgress("b", "B", 12, 10, 0.5)]), { ring: 100, status: "done" });
  assert.equal(summarise([goalProgress("a", "A", 1, 10, 0.05)]).status, "early");
  assert.deepEqual(summarise([goalProgress("a", "A", 3, 5, null)]), { ring: 60, status: "none" });
  assert.deepEqual(summarise([]), { ring: 0, status: "none" });
});
