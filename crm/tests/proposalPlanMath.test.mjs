import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_RATES, cleanFit, cleanPlan, fitProblems, normaliseRates, planProblems, priceMilestones } from "../lib/proposalPlanMath.ts";

const ms = [
  { name: "Connect inbox", requirements: [], ease: "easy", hours_low: 2, hours_high: 4, why: "" },
  { name: "Extract figures", requirements: [], ease: "hard", hours_low: 6, hours_high: 10, why: "" },
];

test("prices milestones from mid-point hours, ease multiplier, contingency and rounding", () => {
  const p = priceMilestones(ms, DEFAULT_RATES);
  assert.deepEqual(p.lines.map((l) => l.price), [135, 450]); // 3h x 45 ; 8h x 45 x 1.25
  assert.equal(p.hours, 11);
  assert.equal(p.subtotal, 135 + 450);
  assert.equal(p.total, 675); // 585 x 1.15 = 672.75, rounded up to 5
  assert.equal(p.contingency, 90);
  assert.equal(p.fee, 67.5);
  assert.equal(p.take_home, 607.5);
  assert.equal(p.days, 1.8);
  assert.ok(p.low < p.total && p.total < p.high);
});
test("the subtotal is the sum of the rounded lines", () => {
  const p = priceMilestones([{ ...ms[0], hours_low: 1, hours_high: 1 }, { ...ms[0], hours_low: 1, hours_high: 1 }], { ...DEFAULT_RATES, hourly_rate_gbp: 47, contingency_pct: 0, min_project_gbp: 0 });
  assert.deepEqual(p.lines.map((l) => l.price), [50, 50]); // 47 rounds up to 50
  assert.equal(p.subtotal, 100);
  assert.equal(p.total, 100);
});
test("never goes below the minimum project price", () => {
  const p = priceMilestones([{ ...ms[0], hours_low: 0.5, hours_high: 0.5 }], DEFAULT_RATES);
  assert.equal(p.total, 150);
  assert.equal(p.floor_applied, true);
});
test("rates fall back to defaults for missing or bad values", () => {
  const r = normaliseRates({ hourly_rate_gbp: "lots", hours_per_day: -3, contingency_pct: 0, ease_multiplier: { hard: 2 } });
  assert.equal(r.hourly_rate_gbp, 45);
  assert.equal(r.hours_per_day, 6);
  assert.equal(r.contingency_pct, 0); // zero is a real choice
  assert.equal(r.ease_multiplier.hard, 2);
  assert.equal(r.ease_multiplier.easy, 1);
  assert.deepEqual(normaliseRates(null), DEFAULT_RATES);
});
test("plan clean-up clamps hours, fixes ease and caps milestones", () => {
  const p = cleanPlan({ milestones: [
    { name: "A", ease: "tricky", hours_low: 9, hours_high: 2 },
    { name: "B", ease: "hard", hours_low: -4, hours_high: 500 },
    { name: "", hours_low: 1, hours_high: 2 },
    ...Array.from({ length: 10 }, (_, i) => ({ name: `M${i}`, hours_low: 1, hours_high: 1 })),
  ] });
  assert.equal(p.milestones.length, 8);
  assert.deepEqual([p.milestones[0].ease, p.milestones[0].hours_low, p.milestones[0].hours_high], ["medium", 9, 9]);
  assert.deepEqual([p.milestones[1].hours_low, p.milestones[1].hours_high], [0.5, 80]);
  assert.deepEqual(planProblems(cleanPlan({ milestones: [{ name: "Only" }] })), ["milestones"]);
});
test("fit clean-up clamps the score and flags an empty analysis", () => {
  const f = cleanFit({ score: 14.4, summary: " Good ", factors: [{ factor: "Scope", effect: "sideways", note: "Clear" }, { factor: "", note: "x" }], benefits: ["a"], risks: [] });
  assert.equal(f.score, 10);
  assert.equal(f.factors.length, 1);
  assert.equal(f.factors[0].effect, "neutral");
  assert.deepEqual(fitProblems(f), ["factors", "risks"]);
  assert.equal(cleanFit({}).score, 1);
});
