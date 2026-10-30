import test from "node:test";
import assert from "node:assert/strict";
import { parsePastedPeople, splitLine } from "../lib/manualPeople.ts";

const D = "oakwood-heating.co.uk";
test("a spreadsheet paste (tabs) and a comma list both work, and the position may contain commas", () => {
  assert.deepEqual(splitLine("Alex\tExample\tOwner\talex@oakwood-heating.co.uk"), ["Alex", "Example", "Owner", "alex@oakwood-heating.co.uk"]);
  assert.deepEqual(splitLine("Priya, Sample, Director, Sales and Operations, priya@oakwood-heating.co.uk"), ["Priya", "Sample", "Director, Sales and Operations", "priya@oakwood-heating.co.uk"]);
  assert.deepEqual(splitLine("Tom | Demo | Owner | https://www.linkedin.com/in/tom-demo"), ["Tom", "Demo", "Owner", "https://www.linkedin.com/in/tom-demo"]);
});
test("work emails on the company's domain and LinkedIn profiles are kept", () => {
  const r = parsePastedPeople("Alex\tExample\tOwner\tAlex@Oakwood-Heating.co.uk\nTom, Demo, Office manager, https://uk.linkedin.com/in/tom-demo/", D);
  assert.equal(r.skipped.length, 0);
  assert.deepEqual(r.people.map((p) => [p.name, p.role, p.email, p.linkedin]),
    [["Alex Example", "Owner", "alex@oakwood-heating.co.uk", null], ["Tom Demo", "Office manager", null, "https://www.linkedin.com/in/tom-demo"]]);
});
test("personal or other-company addresses, phone numbers and incomplete lines are refused with a reason", () => {
  const r = parsePastedPeople([
    "Sam, Test, Owner, sam@gmail.com", "Jo, Test, Owner, jo@other-company.com", "Dan, Test, Owner, 07700 900123",
    "Maya, Test, Owner", "Alex Smith, Test, Owner, alex@oakwood-heating.co.uk", "A, B, C, https://linkedin.com/company/oakwood",
  ].join("\n"), D);
  assert.equal(r.people.length, 0);
  assert.equal(r.skipped.length, 6);
  assert.match(r.skipped[0], /isn't a work address on oakwood-heating/);
  assert.match(r.skipped[2], /no phone numbers/);
  assert.match(r.skipped[3], /needs first name/);
  assert.match(r.skipped[4], /single name/);
});
test("with no website saved, emails cannot be checked but LinkedIn links still work", () => {
  const r = parsePastedPeople("Sam, Test, Owner, sam@example.co.uk\nTom, Demo, Owner, https://www.linkedin.com/in/tom-demo", null);
  assert.equal(r.people.length, 1);
  assert.match(r.skipped[0], /add the company's website first/);
});
test("duplicates are dropped and limits apply", () => {
  assert.equal(parsePastedPeople("A, B, C, a@oakwood-heating.co.uk\nA, B, C, a@oakwood-heating.co.uk", D).skipped[0], "A B: listed twice");
  assert.match(parsePastedPeople("x".repeat(9000), D).error ?? "", /too much/);
  assert.match(parsePastedPeople(Array(21).fill("A, B, C, a@oakwood-heating.co.uk").join("\n"), D).error ?? "", /Too many/);
  assert.deepEqual(parsePastedPeople("  \n ", D), { people: [], skipped: [] });
});
