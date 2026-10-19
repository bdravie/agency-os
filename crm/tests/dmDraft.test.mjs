import test from "node:test";
import assert from "node:assert/strict";
import { finishDm } from "../lib/dmDraft.ts";

const who = { sender: "Alex Example", business: "Example Automations" };
const ok = { first_dm: "Hi Smith team, I couldn't see an online booking form on your website. I build small automations that answer enquiries out of hours. Would a short example help?", follow_up: "Hi Smith team, a quick nudge in case this got buried.", finding_ids: ["F1"], check_first: ["Do they take bookings by DM?", "Is the account active?", "Is it the company page?", "extra fourth"] };

test("the real name, business name and opt-out line are always added by code", () => {
  const d = finishDm(ok, who, ["F1", "F2"]);
  for (const m of [d.first, d.followUp]) { assert.match(m, /Alex Example, Example Automations/); assert.match(m, /Reply "no" and I won't message again\./); }
  assert.equal(d.warnings.length, 0);
  assert.equal(d.checkFirst.length, 3);
});

test("a sign-off or opt-out the model added is not duplicated", () => {
  const d = finishDm({ ...ok, first_dm: `${ok.first_dm}\nReply "no" and I won't message again.\n- Someone Else` }, who, ["F1"]);
  assert.equal((d.first.match(/Reply "no"/g) ?? []).length, 1);
  assert.ok(!/Someone Else/.test(d.first));
});

test("links, emails and phone numbers are removed with a warning", () => {
  const d = finishDm({ ...ok, first_dm: `${ok.first_dm} See https://example.com/demo or mail me@example.com or call 07700 900123.` }, who, ["F1"]);
  assert.ok(!/https?:|@example|07700/.test(d.first.split("\n\n")[0]));
  assert.ok(d.warnings.some((w) => /link was removed/.test(w)) && d.warnings.some((w) => /email address was removed/.test(w)) && d.warnings.some((w) => /phone number was removed/.test(w)));
});

test("an uncited or invented finding is flagged, and an empty draft is refused", () => {
  assert.ok(finishDm({ ...ok, finding_ids: [] }, who, ["F1"]).warnings.some((w) => /did not point to a finding/.test(w)));
  assert.ok(finishDm({ ...ok, finding_ids: ["F9"] }, who, ["F1"]).warnings.some((w) => /doesn't exist/.test(w)));
  assert.throws(() => finishDm({ first_dm: "  " }, who, []), /did not write a message/);
});

test("a long first message is flagged", () => {
  assert.ok(finishDm({ ...ok, first_dm: Array(95).fill("word").join(" ") }, who, ["F1"]).warnings.some((w) => /words/.test(w)));
});
