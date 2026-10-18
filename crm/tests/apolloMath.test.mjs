import test from "node:test";
import assert from "node:assert/strict";
import { apolloSettings, planReveal, parsePeople, seniorityRank, rankPeople, workEmail, linkedinProfile, consentText } from "../lib/apolloMath.ts";

test("defaults are small, and settings are read safely", () => {
  assert.deepEqual(apolloSettings({}), { dailyCredits: 10, maxPerClick: 3 });
  assert.deepEqual(apolloSettings({ APOLLO_DAILY_CREDITS: "25", APOLLO_MAX_PEOPLE_PER_CLICK: "5" }), { dailyCredits: 25, maxPerClick: 5 });
  assert.deepEqual(apolloSettings({ APOLLO_DAILY_CREDITS: "junk", APOLLO_MAX_PEOPLE_PER_CLICK: "-4" }), { dailyCredits: 10, maxPerClick: 3 });
  assert.equal(apolloSettings({ APOLLO_MAX_PEOPLE_PER_CLICK: "999" }).maxPerClick, 10);
  assert.equal(apolloSettings({ APOLLO_MAX_PEOPLE_PER_CLICK: "0" }).maxPerClick, 1);
});

test("a reveal is cut to the per-click limit and to the credits left today", () => {
  assert.deepEqual(planReveal({ wanted: 5, creditsLeft: 10, maxPerClick: 3 }), { count: 3, limitedBy: "click" });
  assert.deepEqual(planReveal({ wanted: 3, creditsLeft: 2, maxPerClick: 3 }), { count: 2, limitedBy: "credits" });
  assert.deepEqual(planReveal({ wanted: 2, creditsLeft: 10, maxPerClick: 3 }), { count: 2, limitedBy: null });
  assert.equal(planReveal({ wanted: 3, creditsLeft: 0, maxPerClick: 3 }).count, 0);
  assert.equal(planReveal({ wanted: 3, creditsLeft: -5, maxPerClick: 3 }).count, 0);
});

const RAW = { people: [
  { id: "a1", first_name: "Sam", last_name_obfuscated: "Ta***r", title: "Managing Director", organization: { name: "Acme Ltd" }, has_email: true },
  { id: "a2", first_name: "<b>Priya</b>", last_name_obfuscated: "Sh***", title: "Head of Marketing", has_email: false },
  { id: "bad id!", first_name: "X" }, { first_name: "NoId" }, { id: "a3" }, null,
  { id: "a4", first_name: "Jo", title: "Office Assistant", has_email: true },
] };
test("people are read safely: bad rows dropped, markup stripped, only a last initial kept", () => {
  const p = parsePeople(RAW);
  assert.deepEqual(p.map((x) => x.id), ["a1", "a2", "a4"]);
  assert.equal(p[0].lastInitial, "T"); assert.equal(p[0].org, "Acme Ltd"); assert.equal(p[1].firstName, "Priya"); assert.equal(p[2].lastInitial, "");
  assert.deepEqual(parsePeople(null), []); assert.deepEqual(parsePeople({ people: "x" }), []);
});

test("ranking puts people with an email first, then the most senior", () => {
  assert.equal(seniorityRank("Founder & CEO"), 1); assert.equal(seniorityRank("Head of Operations"), 2); assert.equal(seniorityRank("Sales Manager"), 3); assert.equal(seniorityRank("Office Assistant"), 9); assert.equal(seniorityRank(null), 9);
  assert.deepEqual(rankPeople(parsePeople(RAW)).map((x) => x.id), ["a1", "a4", "a2"]);
});

test("only a work address on the company's own domain is accepted", () => {
  assert.equal(workEmail("Sam.Taylor@Acme.co.uk", "acme.co.uk"), "sam.taylor@acme.co.uk");
  assert.equal(workEmail("sam@mail.acme.co.uk", "acme.co.uk"), "sam@mail.acme.co.uk");
  for (const bad of ["sam@gmail.com", "sam@hotmail.co.uk", "sam@otheracme.co.uk", "sam@acme.co.uk.evil.com", "not an email", "", null, undefined]) assert.equal(workEmail(bad, "acme.co.uk"), null, String(bad));
  assert.equal(workEmail("sam@acme.co.uk", null), null);
});

test("a LinkedIn profile is normalised for a contact, and anything else is refused", () => {
  assert.equal(linkedinProfile("http://uk.linkedin.com/in/sam-taylor-123/?trk=x"), "https://www.linkedin.com/in/sam-taylor-123");
  for (const bad of ["https://www.linkedin.com/company/acme", "https://evil.com/in/sam", "javascript:alert(1)", "", null]) assert.equal(linkedinProfile(bad), null, String(bad));
});

test("the recorded basis names the source and date", () => assert.match(consentText("16 Oct 2026"), /legitimate interest.*Apollo.*16 Oct 2026/));

import { describeApolloError } from "../lib/apollo.ts";
test("Apollo errors are explained, trimmed and never contain the key", () => {
  assert.match(describeApolloError(401, null), /APOLLO_API_KEY/);
  assert.match(describeApolloError(403, { error: "no access" }), /People API Search.*People Enrichment.*master-key/);
  assert.match(describeApolloError(429, null), /credits/);
  assert.match(describeApolloError(422, { message: "bad domain" }), /bad domain/);
  assert.doesNotMatch(describeApolloError(500, { error: "oops key-abc123456 leaked" }, "key-abc123456"), /key-abc123456/);
  assert.ok(describeApolloError(500, { error: "x".repeat(900) }).length < 330);
  assert.equal(describeApolloError(500, null), "Apollo answered 500.");
});
