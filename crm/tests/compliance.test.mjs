import test from "node:test";
import assert from "node:assert/strict";
import { classifyCompany, gateReasons, normalisePhone, detectEntry, parseSuppressionLines } from "../lib/compliance.ts";

test("only active ltd, llp and plc are eligible", () => {
  for (const t of ["ltd", "llp", "plc", "LTD"]) assert.equal(classifyCompany(t, "active").status, "eligible", t);
  assert.equal(classifyCompany("ltd", "dissolved").status, "not_eligible");
  assert.equal(classifyCompany("ltd", "liquidation").status, "not_eligible");
  assert.equal(classifyCompany("ltd", "active-proposal-to-strike-off").status, "not_eligible");
  for (const t of ["limited-partnership", "private-unlimited", "private-limited-guarant-nsc", "scottish-partnership", "", null, undefined]) assert.equal(classifyCompany(t, "active").status, "not_eligible", String(t));
  assert.match(classifyCompany("limited-partnership", "active").reason, /Not a limited company or LLP/);
  assert.match(classifyCompany("ltd", "dissolved").reason, /dissolved/);
});

const ok = { compliance_status: "eligible", company_type: "ltd", company_status: "active", opted_out: false, suppressed: false };
test("an eligible lead with no opt-out or suppression has no blockers", () => assert.deepEqual(gateReasons(ok), []));
test("unchecked leads are blocked until looked up", () => assert.match(gateReasons({ ...ok, compliance_status: "unchecked" })[0], /Not yet checked/));
test("opted-out and suppressed leads are blocked, with every reason listed", () => {
  const r = gateReasons({ ...ok, opted_out: true, opted_out_at: "2026-10-01T10:00:00Z", suppressed: true });
  assert.equal(r.length, 2); assert.match(r[0], /Opted out on/); assert.match(r[1], /suppression list/);
});
test("a not-eligible lead says why", () => assert.match(gateReasons({ ...ok, compliance_status: "not_eligible", company_type: "scottish-partnership" })[0], /Scottish partnership/));

test("phone numbers normalise the same way however they are written", () => {
  for (const p of ["+44 7700 900123", "+44 (0)7700 900123", "0044 7700 900123", "07700 900-123", "(07700) 900123", "07700900123"]) assert.equal(normalisePhone(p), "07700900123", p);
  assert.equal(normalisePhone(""), null); assert.equal(normalisePhone("abc"), null); assert.equal(normalisePhone(null), null);
});

test("pasted suppression lines are recognised", () => {
  assert.deepEqual(detectEntry(" Info@Example.com "), { email: "info@example.com" });
  assert.deepEqual(detectEntry("https://www.Example.co.uk/contact"), { domain: "example.co.uk" });
  assert.deepEqual(detectEntry("+44 7700 900123"), { phone: "07700900123" });
  assert.deepEqual(detectEntry("01234567"), { company_number: "01234567" });
  assert.deepEqual(detectEntry("1234567"), { company_number: "01234567" });
  assert.deepEqual(detectEntry("sc123456"), { company_number: "SC123456" });
  assert.equal(detectEntry("just some words"), null);
  assert.equal(detectEntry(""), null);
});

test("a pasted list is de-duplicated and rejects are reported", () => {
  const r = parseSuppressionLines("a@b.com\nA@B.com\nexample.com; 07700 900123\nnonsense words\n\n");
  assert.equal(r.entries.length, 3); assert.deepEqual(r.rejected, ["nonsense words"]);
});

import { normaliseNumber, normaliseName, pickExact } from "../lib/companiesHouse.ts";

test("company numbers are tidied or rejected", () => {
  assert.equal(normaliseNumber("1234567"), "01234567");
  assert.equal(normaliseNumber(" sc 123456 "), "SC123456");
  assert.equal(normaliseNumber("12345678"), "12345678");
  for (const bad of ["", "abc", "123456789", "S1234567", null]) assert.equal(normaliseNumber(bad), null, String(bad));
});

test("names compare without case, punctuation or the Ltd suffix", () => {
  assert.equal(normaliseName("Smith & Sons Ltd."), normaliseName("SMITH AND SONS LIMITED"));
  assert.notEqual(normaliseName("Smith Plumbing"), normaliseName("Smith Plumbing Services"));
});

const cand = (name, status, number) => ({ number, name, type: "ltd", status, address: null });
test("only an exact, unambiguous name match is picked automatically", () => {
  assert.equal(pickExact("Acme Ltd", [cand("ACME LIMITED", "active", "1"), cand("Acme Holdings Ltd", "active", "2")])?.number, "1");
  assert.equal(pickExact("Acme Ltd", [cand("Acme Holdings Ltd", "active", "2")]), null);                                   // not exact
  assert.equal(pickExact("Acme Ltd", [cand("Acme Limited", "active", "1"), cand("ACME LTD", "active", "2")]), null);        // two active: ambiguous
  assert.equal(pickExact("Acme Ltd", [cand("Acme Limited", "dissolved", "1"), cand("Acme Ltd", "active", "2")])?.number, "2"); // active wins
  assert.equal(pickExact("Acme Ltd", [cand("Acme Limited", "dissolved", "1")])?.number, "1");                               // only a dissolved one: found, then classified not eligible
});

import { nicheKey, parseSicCodes, parseTerms } from "../lib/niche.ts";

test("niche names become safe keys", () => {
  assert.equal(nicheKey("Dental Practices (UK)"), "dental_practices_uk");
  assert.equal(nicheKey("Plumbers & Heating"), "plumbers_and_heating");
  assert.equal(nicheKey("  "), null);
  assert.equal(nicheKey("123 roofers"), null);               // must start with a letter
  assert.ok(nicheKey("a".repeat(80) + " b").length <= 40);
});

test("SIC codes are read from messy text and bad ones reported", () => {
  assert.deepEqual(parseSicCodes("43220, 43210 and 43290 43220"), { codes: ["43220", "43210", "43290"], bad: [] });
  assert.deepEqual(parseSicCodes("4322, 43220x, 99999"), { codes: ["99999"], bad: ["4322", "43220x"] });
  assert.deepEqual(parseSicCodes(""), { codes: [], bad: [] });
});

test("search terms are tidied", () => {
  assert.deepEqual(parseTerms("Roofer, flat roofing\nroofer\n x \nRoof Repairs"), ["roofer", "flat roofing", "roof repairs"]);
});
