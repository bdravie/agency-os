import test from "node:test";
import assert from "node:assert/strict";
import { chanceBest, daysRunning, evaluateTest, DEFAULT_RULES } from "../lib/siteTestMath.ts";

const v = (id, visitors, booked, clicks = booked) => ({ id, visitors, booked, clicks });

test("chances add up to one and are repeatable", () => {
  const c = chanceBest([v("a", 200, 10), v("b", 200, 14), v("c", 200, 8)]);
  assert.ok(Math.abs(c.reduce((a, b) => a + b, 0) - 1) < 1e-9);
  assert.deepEqual(c, chanceBest([v("a", 200, 10), v("b", 200, 14), v("c", 200, 8)]));
});

test("a clearly better version has a high chance, equal versions are near even", () => {
  const [a, b] = chanceBest([v("a", 500, 10), v("b", 500, 45)]);
  assert.ok(b > 0.99 && a < 0.01);
  const [x, y] = chanceBest([v("a", 500, 20), v("b", 500, 20)]);
  assert.ok(Math.abs(x - 0.5) < 0.05 && Math.abs(y - 0.5) < 0.05);
});

test("days running counts the start day", () => {
  assert.equal(daysRunning("2026-11-10", "2026-11-10T09:00:00Z"), 1);
  assert.equal(daysRunning("2026-11-10", "2026-11-23T09:00:00Z"), 14);
  assert.equal(daysRunning("2026-11-10", "2026-11-01T00:00:00Z"), 0);
});

test("no visitors means no data", () => {
  const r = evaluateTest([v("a", 0, 0), v("b", 0, 0)], DEFAULT_RULES, "2026-11-10", "2026-12-10T00:00:00Z");
  assert.equal(r.status, "no_data");
  assert.equal(r.leaderId, null);
});

test("never names a winner before the minimum visitors, however good it looks", () => {
  const r = evaluateTest([v("a", 40, 1), v("b", 40, 12)], DEFAULT_RULES, "2026-11-10", "2026-12-10T00:00:00Z");
  assert.equal(r.status, "too_early");
  assert.equal(r.leaderId, null);
  assert.match(r.reason, /150 visitors/);
  assert.ok(r.variants.every((x) => !x.leader));
});

test("never names a winner before the minimum days", () => {
  const r = evaluateTest([v("a", 300, 5), v("b", 300, 40)], DEFAULT_RULES, "2026-11-10", "2026-11-14T00:00:00Z");
  assert.equal(r.status, "too_early");
  assert.match(r.reason, /5 of 14 days/);
});

test("names the leader once visitors, days and the threshold are all met", () => {
  const r = evaluateTest([v("a", 300, 5), v("b", 300, 40)], DEFAULT_RULES, "2026-11-10", "2026-12-01T00:00:00Z");
  assert.equal(r.status, "leader");
  assert.equal(r.leaderId, "b");
  assert.equal(r.variants.find((x) => x.id === "b").leader, true);
});

test("keeps running when the versions are too close", () => {
  const r = evaluateTest([v("a", 300, 20), v("b", 300, 22)], DEFAULT_RULES, "2026-11-10", "2026-12-01T00:00:00Z");
  assert.equal(r.status, "keep_running");
  assert.equal(r.leaderId, null);
});

test("the metric can be CTA clicks", () => {
  const r = evaluateTest([v("a", 300, 0, 10), v("b", 300, 0, 60)], { ...DEFAULT_RULES, metric: "cta_click" }, "2026-11-10", "2026-12-01T00:00:00Z");
  assert.equal(r.leaderId, "b");
});
