import test from "node:test";
import assert from "node:assert/strict";
import {
  PROPOSAL_STATUSES, PROPOSAL_META, nextStatus, previousStatus, isClosed, isStatus, lostProblem, deletionProblem, cannotDelete,
  needsFollowUp, isQuiet, daysSince, archiveLabel, proposalLostLabel, deletionLabel, isArchiveReason, FOLLOW_UP_AFTER_DAYS, FOLLOW_UP_UNTIL_DAYS,
} from "../lib/proposalStatus.ts";

const NOW = new Date("2026-11-20T12:00:00Z");
const daysAgo = (n) => new Date(NOW.getTime() - n * 86_400_000).toISOString();

test("every status has a label and a colour", () => {
  for (const s of PROPOSAL_STATUSES) { assert.ok(PROPOSAL_META[s].label); assert.match(PROPOSAL_META[s].colour, /^var\(--st-/); }
});
test("statuses move forward one step at a time, and Won and Lost stop", () => {
  assert.equal(nextStatus("Draft"), "Sent");
  assert.equal(nextStatus("Sent"), "Viewed");
  assert.equal(nextStatus("Viewed"), "Replied");
  assert.equal(nextStatus("Replied"), "Interview");
  assert.equal(nextStatus("Interview"), "Won");
  assert.equal(nextStatus("Won"), null);
  assert.equal(nextStatus("Lost"), null);
  assert.equal(nextStatus("nonsense"), null);
});
test("back goes up one step, and a closed or first status has no back", () => {
  assert.equal(previousStatus("Sent"), "Draft");
  assert.equal(previousStatus("Interview"), "Replied");
  assert.equal(previousStatus("Draft"), null);
  assert.equal(previousStatus("Lost"), null);
});
test("closed and known statuses", () => {
  assert.ok(isClosed("Won") && isClosed("Lost") && !isClosed("Sent"));
  assert.ok(isStatus("Viewed") && !isStatus("viewed") && !isStatus(undefined));
});
test("a lost proposal needs one of the standard reasons", () => {
  assert.equal(lostProblem("no_reply"), null);
  assert.match(lostProblem("") ?? "", /Pick a reason/);
  assert.match(lostProblem("whatever") ?? "", /Pick a reason/);
  assert.match(lostProblem(undefined) ?? "", /Pick a reason/);
  assert.equal(proposalLostLabel("hired_other"), "Hired someone else");
  assert.equal(proposalLostLabel(null), "Not recorded");
});
test("archive reasons are optional but must be known", () => {
  assert.ok(isArchiveReason("not_a_fit") && !isArchiveReason("x"));
  assert.equal(archiveLabel(null), "No reason given");
});
test("deleting needs a category and a real note", () => {
  assert.equal(deletionProblem("admin_mistake", "Duplicate of the Oakwood job"), null);
  assert.equal(deletionProblem("not_a_fit", "  Too much custom coding for the budget  "), null);
  assert.match(deletionProblem("", "Duplicate of the Oakwood job") ?? "", /Choose why/);
  assert.match(deletionProblem("wasted_lead", "Duplicate of the Oakwood job") ?? "", /Choose why/);
  assert.match(deletionProblem("job_gone", "oops") ?? "", /at least 10/);
  assert.match(deletionProblem("job_gone", "          ") ?? "", /at least 10/);
  assert.match(deletionProblem("job_gone", "x".repeat(501)) ?? "", /under 500/);
  assert.equal(deletionLabel("job_gone"), "Job gone");
});
test("only drafts and archived proposals can be deleted, and never a won one", () => {
  assert.equal(cannotDelete({ status: "Draft" }), null);
  assert.equal(cannotDelete({ status: "Lost", archived_at: "2026-11-01" }), null);
  assert.equal(cannotDelete({ status: "Sent", archived_at: "2026-11-01" }), null);
  assert.match(cannotDelete({ status: "Sent" }) ?? "", /Archive it first/);
  assert.match(cannotDelete({ status: "Lost", archived_at: null }) ?? "", /Archive it first/);
  assert.match(cannotDelete({ status: "Won", archived_at: "2026-11-01" }) ?? "", /hired job/);
});
test("a sent proposal is worth a nudge after a week, and stops counting after a month", () => {
  const p = (status, d, extra = {}) => ({ status, status_changed_at: daysAgo(d), ...extra });
  assert.equal(needsFollowUp(p("Sent", FOLLOW_UP_AFTER_DAYS - 1), NOW), false);
  assert.equal(needsFollowUp(p("Sent", FOLLOW_UP_AFTER_DAYS), NOW), true);
  assert.equal(needsFollowUp(p("Viewed", 12), NOW), true);
  assert.equal(needsFollowUp(p("Sent", FOLLOW_UP_UNTIL_DAYS - 1), NOW), true);
  assert.equal(needsFollowUp(p("Sent", FOLLOW_UP_UNTIL_DAYS), NOW), false);
});
test("nothing else is chased: drafts, replies, closed or archived proposals", () => {
  const p = (status, extra = {}) => ({ status, status_changed_at: daysAgo(10), ...extra });
  for (const s of ["Draft", "Replied", "Interview", "Won", "Lost"]) assert.equal(needsFollowUp(p(s), NOW), false, s);
  assert.equal(needsFollowUp(p("Sent", { archived_at: "2026-11-01" }), NOW), false);
});
test("the pipeline row shows a quiet proposal however old, but only while it is waiting", () => {
  assert.equal(isQuiet({ status: "Sent", status_changed_at: daysAgo(90) }, NOW), true);
  assert.equal(isQuiet({ status: "Sent", status_changed_at: daysAgo(2) }, NOW), false);
  assert.equal(isQuiet({ status: "Replied", status_changed_at: daysAgo(90) }, NOW), false);
  assert.equal(daysSince(daysAgo(3), NOW), 3);
});
