import test from "node:test";
import assert from "node:assert/strict";
import { cleanImprovements, effortSummary, improveProblems } from "../lib/proposalImproveMath.ts";

const a = (o = {}) => ({ title: "Learn Retell AI", how: "Build a test agent.", kind: "learn", effort_hours: 6, score_gain: 2, long_term: "yes", long_term_note: "", ...o });

test("clean-up fixes kinds, clamps gains and effort, and caps the list", () => {
  const r = cleanImprovements({
    actions: [
      { title: "A", how: "x", kind: "magic", effort_hours: 0, score_gain: 9, long_term: "sure" },
      { title: "B", how: "x", kind: "build", effort_hours: 7.3, score_gain: -2 },
      { title: "", how: "x" },
      ...Array.from({ length: 8 }, (_, i) => ({ title: `T${i}`, how: "x" })),
    ],
    verdict: { overall: "worth_it", reasoning: "Because.", long_term: "Maybe.", best_actions: ["A", "Not a real title"] },
  });
  assert.equal(r.actions.length, 6);
  assert.deepEqual([r.actions[0].kind, r.actions[0].effort_hours, r.actions[0].score_gain, r.actions[0].long_term], ["change", 0.5, 3, "maybe"]);
  assert.deepEqual([r.actions[1].effort_hours, r.actions[1].score_gain], [7.5, 0]);
  assert.deepEqual(r.verdict.best_actions, ["A"]);
});
test("apply-as-is and skip never name actions to do; unknown verdicts become partial", () => {
  const base = { actions: [{ title: "A", how: "x" }], verdict: { reasoning: "r", long_term: "l", best_actions: ["A"] } };
  assert.deepEqual(cleanImprovements({ ...base, verdict: { ...base.verdict, overall: "skip" } }).verdict.best_actions, []);
  assert.equal(cleanImprovements({ ...base, verdict: { ...base.verdict, overall: "whatever" } }).verdict.overall, "partial");
});
test("an empty reply is flagged", () => {
  assert.deepEqual(improveProblems(cleanImprovements({})), ["actions", "verdict", "long-term view"]);
});
test("effort summary adds hours, prices them, caps the lift at 3 and the projection at 9", () => {
  const s = effortSummary([a(), a({ effort_hours: 4, score_gain: 3 }), a({ score_gain: 3 })], 6, 45, 1000);
  assert.deepEqual([s.hours, s.cost, s.gain, s.projected, s.shareOfPay], [16, 720, 3, 9, 72]);
  assert.equal(effortSummary([a()], 3, 45, null).shareOfPay, null);
  assert.equal(effortSummary([a()], 3, 45, 0).shareOfPay, null);
  assert.equal(effortSummary([], 4, 45, 100).projected, 4);
  assert.equal(effortSummary([a({ score_gain: 3 })], 10, 45, 100).projected, 10); // never lowers an existing score
});
