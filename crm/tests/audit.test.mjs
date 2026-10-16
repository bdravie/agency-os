import test from "node:test";
import assert from "node:assert/strict";
import { containsContactDetails, rankTasks, scoreTask, summarise, unverifiedFigures } from "../lib/audit.ts";

const P = { automationShare: 0.7, hourlyRate: 25 };
const task = (o) => ({ name: "t", performed_by: "Office", hours_per_week: 10, frequency: "weekly", error_rate_pct: 0, revenue_impact: "medium", data_sensitivity: "none", ease: null, ...o });

test("score = hours saved x value x ease x sensitivity, worked by hand", () => {
  // 10 h/wk x 0.7 = 7 h saved; value = high 3 x (1 + 20%) = 3.6; weekly -> default ease 4 -> 0.8; no sensitivity penalty
  const s = scoreTask(task({ revenue_impact: "high", error_rate_pct: 20 }), P);
  assert.equal(s.hoursSavedWeek, 7);
  assert.equal(s.value, 3.6);
  assert.equal(s.easeFactor, 0.8);
  assert.equal(s.score, 20.16);       // 7 x 3.6 x 0.8
  assert.equal(s.annualGbp, 7 * 25 * 46);
});

test("data sensitivity penalises the score", () => {
  const none = scoreTask(task(), P).score, personal = scoreTask(task({ data_sensitivity: "personal" }), P).score, special = scoreTask(task({ data_sensitivity: "special_category" }), P).score;
  assert.ok(none > personal && personal > special);
  assert.equal(Math.round((personal / none) * 100) / 100, 0.6);
  assert.equal(Math.round((special / none) * 100) / 100, 0.25);
});

test("your own ease rating beats the frequency default", () => {
  assert.equal(scoreTask(task({ frequency: "quarterly" }), P).ease_used, 2);
  assert.equal(scoreTask(task({ frequency: "quarterly", ease: 5 }), P).ease_used, 5);
});

test("ranking: highest score first, top three are the best eligible tasks, special-category tasks are held back", () => {
  const ranked = rankTasks([
    task({ name: "Chasing invoices", hours_per_week: 6, revenue_impact: "high" }),
    task({ name: "Client onboarding forms", hours_per_week: 4, revenue_impact: "medium", data_sensitivity: "personal" }),
    task({ name: "Patient notes summaries", hours_per_week: 30, revenue_impact: "high", data_sensitivity: "special_category" }),
    task({ name: "Weekly report", hours_per_week: 5, revenue_impact: "medium" }),
    task({ name: "Stock reorder emails", hours_per_week: 3, revenue_impact: "low" }),
    task({ name: "Does nothing", hours_per_week: 0 }),
  ], P);
  assert.equal(ranked.length, 5);                                    // zero-hour tasks are dropped
  assert.deepEqual(ranked.map((t) => t.rank), [1, 2, 3, 4, 5]);
  assert.ok(ranked.every((t, i) => i === 0 || ranked[i - 1].score >= t.score));
  const top = ranked.filter((t) => t.top);
  assert.equal(top.length, 3);
  assert.ok(top.every((t) => t.eligible));                           // never a special-category task
  const special = ranked.find((t) => t.name === "Patient notes summaries");
  assert.equal(special.top, false);
  assert.ok(special.flags.some((f) => f.includes("impact assessment")));
  const s = summarise(ranked);
  assert.equal(s.held.length, 1);
  assert.equal(s.topHoursWeek, Math.round(top.reduce((a, t) => a + t.hoursSavedWeek, 0) * 100) / 100);
});

test("ranking is stable for ties", () => {
  const a = rankTasks([task({ name: "B" }), task({ name: "A" })], P).map((t) => t.name);
  assert.deepEqual(a, ["A", "B"]);
});

test("personal contact details are refused in free text", () => {
  assert.equal(containsContactDetails("Chase invoices"), false);
  assert.equal(containsContactDetails("email jane.smith@acme.co.uk each week"), true);
  assert.equal(containsContactDetails("ring 07700 900123 to confirm"), true);
  assert.equal(containsContactDetails("+44 20 7946 0958"), true);
  assert.equal(containsContactDetails(null), false);
});

test("figures the model was not given are caught", () => {
  const allowed = ["£5,175", "7", "12.5"];
  assert.deepEqual(unverifiedFigures("Saves about £5,175 a year and 7 hours a week.", allowed), []);
  assert.deepEqual(unverifiedFigures("This will save £50,000 and 40 hours a week.", allowed).sort(), ["40 hours", "£50,000"].sort());
});
