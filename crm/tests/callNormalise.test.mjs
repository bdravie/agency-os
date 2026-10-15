import test from "node:test";
import assert from "node:assert/strict";
import { addDays, followUpDate, normaliseAnalysis } from "../lib/callNormalise.ts";

const T = "Me: What does reporting cost you today?\nProspect: It takes us about six hours every Monday and the numbers are often wrong. Honestly the price worries me, we only have a small budget. Let's speak again next Tuesday.";

test("dates add correctly across month and year ends", () => {
  assert.equal(addDays("2026-10-30", 3), "2026-11-02");
  assert.equal(addDays("2026-12-30", 3), "2027-01-02");
});

test("follow-up date: a sensible agreed date is kept; anything else becomes the default and is marked assumed", () => {
  assert.deepEqual(followUpDate("2026-10-27", "2026-10-19"), { date: "2026-10-27", assumed: false });
  assert.deepEqual(followUpDate(null, "2026-10-19"), { date: "2026-10-22", assumed: true });
  assert.deepEqual(followUpDate("2026-10-01", "2026-10-19"), { date: "2026-10-22", assumed: true });   // in the past
  assert.deepEqual(followUpDate("2031-01-01", "2026-10-19"), { date: "2026-10-22", assumed: true });   // absurdly far
  assert.deepEqual(followUpDate("next tuesday", "2026-10-19"), { date: "2026-10-22", assumed: true }); // not a date
});

test("quotes are kept only when they are really in the transcript; objections reuse library names", () => {
  const { analysis, followUp, droppedQuotes } = normaliseAnalysis({
    summary: "  Reporting takes six hours a week.  ",
    pains: [{ pain: "Weekly reporting is slow", quote: "six hours every Monday" }, { pain: "Errors", quote: "we make mistakes all the time" }],
    budget_signals: [{ signal: "Small budget", quote: "we only have a small budget" }],
    objections: [{ name: "price too high", quote: "the price worries me" }, { name: "PRICE TOO HIGH" }, { name: "Needs board approval", quote: "I would need to ask the board" }],
    next_step: "Send a proposal", follow_up_date: "2026-10-27",
  }, T, ["Price too high"], "2026-10-19");
  assert.equal(analysis.summary, "Reporting takes six hours a week.");
  assert.equal(analysis.pains[0].quote, "six hours every Monday");
  assert.equal(analysis.pains[1].quote, null);                         // invented quote dropped
  assert.deepEqual(analysis.objections.map((o) => [o.name, o.isNew]), [["Price too high", false], ["Needs board approval", true]]);   // matched, de-duplicated, new one flagged
  assert.equal(analysis.objections[1].quote, null);                    // not in the transcript
  assert.equal(droppedQuotes, 2);
  assert.deepEqual(followUp, { date: "2026-10-27", assumed: false });
});

test("limits and blanks are handled", () => {
  const many = Array.from({ length: 12 }, (_, i) => ({ name: `Objection ${i}` }));
  const { analysis } = normaliseAnalysis({ objections: many, next_step: "   ", pains: [{ pain: "" }] }, T, [], "2026-10-19");
  assert.equal(analysis.objections.length, 6);
  assert.equal(analysis.next_step, null);
  assert.equal(analysis.pains.length, 0);
});
