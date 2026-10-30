import test from "node:test";
import assert from "node:assert/strict";
import { cleanNames, describeChange } from "../lib/companyNames.ts";

test("a trading name is optional, tidied, and dropped when it matches the legal name", () => {
  assert.deepEqual(cleanNames({ name: "Salaudeen Smiles Limited", trading_name: "  Swinnow   Dental ", address: "136 Swinnow Road, Leeds", postcode: "ls13 4nx" }),
    { value: { name: "Salaudeen Smiles Limited", trading_name: "Swinnow Dental", address: "136 Swinnow Road, Leeds", postcode: "LS13 4NX" } });
  assert.equal(cleanNames({ name: "Acme Ltd", trading_name: "acme ltd" }).value.trading_name, null);
  assert.equal(cleanNames({ name: "Acme Ltd", trading_name: "" }).value.trading_name, null);
  assert.equal(cleanNames({ name: "Acme Ltd", postcode: "LS134NX" }).value.postcode, "LS13 4NX");
});
test("bad input is refused with a reason", () => {
  assert.match(cleanNames({ name: " " }).error, /registered name/);
  assert.match(cleanNames({ name: "Acme Ltd", trading_name: "x" }).error, /too short/);
  assert.match(cleanNames({ name: "Acme Ltd", postcode: "12345" }).error, /postcode/);
  assert.equal(cleanNames({ name: "<b>Acme</b> Ltd" }).value.name, "Acme Ltd");
});
test("the activity entry says what changed, or nothing when nothing did", () => {
  const a = { name: "Salaudeen Smiles Limited", trading_name: null, address: "136 Swinnow Road, Leeds", postcode: "LS13 4NX" };
  assert.equal(describeChange(a, { ...a, trading_name: "Swinnow Dental" }), 'trading name set to "Swinnow Dental"');
  assert.equal(describeChange({ ...a, trading_name: "Swinnow Dental" }, { ...a, trading_name: null }), 'trading name "Swinnow Dental" removed');
  assert.equal(describeChange(a, { ...a, name: "Swinnow Dental Limited" }), 'registered name "Salaudeen Smiles Limited" → "Swinnow Dental Limited"');
  assert.equal(describeChange(a, a), null);
});
