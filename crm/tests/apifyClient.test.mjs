import test from "node:test";
import assert from "node:assert/strict";
import { describeApifyError } from "../lib/apify.ts";

test("Apify's own error message is shown, trimmed, and never contains the token", () => {
  assert.equal(describeApifyError(400, { error: { type: "invalid-input", message: "Input is not valid: countryCode must be equal to one of the allowed values" } }),
    "Apify rejected the request (400): invalid-input: Input is not valid: countryCode must be equal to one of the allowed values");
  assert.match(describeApifyError(400, { error: { message: "bad token abc123secret here" } }, "abc123secret"), /\[hidden\]/);
  assert.ok(describeApifyError(400, { error: { message: "x".repeat(900) } }).length < 400);
});
test("with no body there is still a useful message", () => {
  assert.equal(describeApifyError(400, null), "Apify answered 400.");
  assert.equal(describeApifyError(500, "weird"), "Apify answered 500.");
});
