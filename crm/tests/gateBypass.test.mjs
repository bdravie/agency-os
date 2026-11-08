import test from "node:test";
import assert from "node:assert/strict";
import { canBypass, bypassBlockedReason, checkBypassReason, lockState, recentFailures, bypassLogText, MAX_WRONG_PASSWORDS, LOCK_WINDOW_MS } from "../lib/gateBypass.ts";

const base = { compliance_status: "unchecked", opted_out: false, suppressed: false, bypassed: false };

test("only a company that was never matched on Companies House can be bypassed", () => {
  assert.equal(canBypass(base), true);
  assert.equal(canBypass({ ...base, compliance_status: "not_eligible" }), false);   // looked up and found not to be a limited company: a real answer
  assert.equal(canBypass({ ...base, compliance_status: "eligible" }), false);       // nothing to bypass
  assert.equal(canBypass({ ...base, opted_out: true }), false);                     // opt-outs are permanent
  assert.equal(canBypass({ ...base, suppressed: true }), false);
  assert.equal(canBypass({ ...base, bypassed: true }), false);
});

test("each refusal says why in plain words, and an allowed company has no reason", () => {
  assert.equal(bypassBlockedReason(base), null);
  assert.match(bypassBlockedReason({ ...base, opted_out: true }), /opted out.*permanent/);
  assert.match(bypassBlockedReason({ ...base, suppressed: true }), /suppression list/);
  assert.match(bypassBlockedReason({ ...base, compliance_status: "not_eligible" }), /not an active limited company/);
  assert.match(bypassBlockedReason({ ...base, bypassed: true }), /already in place/);
});

test("the reason must be the owner's own sentence, without contact details", () => {
  assert.match(checkBypassReason("too short").error, /at least 15/);
  assert.match(checkBypassReason(undefined).error, /at least 15/);
  assert.match(checkBypassReason("x".repeat(301)).error, /300/);
  assert.match(checkBypassReason("Registered as Oakwood Ltd, email me at sam@example.com").error, /email addresses/);
  assert.match(checkBypassReason("Registered as Oakwood Ltd, call 07700 900123 for proof").error, /phone numbers/);
  assert.deepEqual(checkBypassReason("  Registered as   Oakwood Trading Ltd,\n trades as Oakwood Heating  "), { reason: "Registered as Oakwood Trading Ltd, trades as Oakwood Heating" });
});

test("five wrong passwords in fifteen minutes lock the bypass, and it unlocks as they age out", () => {
  const now = 1_000_000_000;
  const fails = (n, at = now) => Array(n).fill(at);
  assert.equal(lockState(fails(MAX_WRONG_PASSWORDS - 1), now).locked, false);
  const l = lockState(fails(MAX_WRONG_PASSWORDS), now);
  assert.equal(l.locked, true);
  assert.equal(l.minutesLeft, 15);
  assert.equal(lockState(fails(MAX_WRONG_PASSWORDS, now - 10 * 60_000), now).minutesLeft, 5);
  assert.equal(lockState(fails(MAX_WRONG_PASSWORDS, now - LOCK_WINDOW_MS - 1), now).locked, false);
  assert.deepEqual(recentFailures([now - LOCK_WINDOW_MS - 1, now - 1000], now), [now - 1000]);
});

test("the log line quotes the reason and never contains a password", () => {
  const t = bypassLogText("Oakwood Heating", "Registered as Oakwood Trading Ltd");
  assert.match(t, /Oakwood Heating/); assert.match(t, /Oakwood Trading Ltd/); assert.doesNotMatch(t, /password:/i);
});
