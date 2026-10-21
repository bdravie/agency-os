import test from "node:test";
import assert from "node:assert/strict";
import { parseApolloCsv, importConsentText, MAX_IMPORT_ROWS } from "../lib/apolloImport.ts";

const CSV = `First Name,Last Name,Title,Company,Email,Email Status,Person Linkedin Url
Sam,Taylor,Managing Director,Acme Ltd,sam@acme.co.uk,Verified,http://www.linkedin.com/in/sam-taylor
Priya,Shah,Head of Marketing,Acme Ltd,priya.shah@gmail.com,Verified,
Jo,Lee,Director,Acme Ltd,jo@other.com,Verified,
Al,Kay,Owner,Acme Ltd,,,
Sam,Taylor,Owner,Acme Ltd,SAM@acme.co.uk,Verified,
,,Chair,Acme Ltd,x@acme.co.uk,,
`;

test("keeps only work addresses on the company's domain and says why the rest were skipped", () => {
  const r = parseApolloCsv(CSV, "acme.co.uk");
  assert.equal(r.error, undefined);
  assert.deepEqual(r.people, [{ name: "Sam Taylor", role: "Managing Director", email: "sam@acme.co.uk", linkedin: "https://www.linkedin.com/in/sam-taylor", emailStatus: "Verified" }]);
  assert.equal(r.skipped.length, 5);
  assert.match(r.skipped.join("|"), /Priya Shah: the address isn't a work address/);
  assert.match(r.skipped.join("|"), /Jo Lee: the address isn't a work address/);
  assert.match(r.skipped.join("|"), /Al Kay: no email/);
  assert.match(r.skipped.join("|"), /listed twice/);
  assert.match(r.skipped.join("|"), /no name/);
});

test("a file without the right columns, an empty file and a long file are refused", () => {
  assert.ok(parseApolloCsv("Company,Phone\nAcme,0123", "acme.co.uk").error);
  assert.ok(parseApolloCsv("  ", "acme.co.uk").error);
  const big = "Name,Email\n" + Array.from({ length: MAX_IMPORT_ROWS + 1 }, (_, i) => `P${i},p${i}@acme.co.uk`).join("\n");
  assert.ok(parseApolloCsv(big, "acme.co.uk").error);
});

test("a single Name column works, markup is stripped and only linkedin profiles are kept", () => {
  const r = parseApolloCsv('Name,Email,Linkedin Url\n"<b>Ann</b> Bell",ann@acme.co.uk,https://evil.com/in/x\n', "acme.co.uk");
  assert.equal(r.people[0].name, "Ann Bell"); assert.equal(r.people[0].linkedin, null);
});

test("the recorded reason names a manual Apollo export", () => assert.match(importConsentText("21 Oct 2026"), /manual Apollo export on 21 Oct 2026/));
