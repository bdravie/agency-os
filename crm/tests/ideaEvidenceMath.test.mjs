import test from "node:test";
import assert from "node:assert/strict";
import { anonymisedPains, bannedTerms, cleanGenerated, cleanScores, evidenceDigest, mentionsAny, pillarMix, pipelineProblems, scoredLow } from "../lib/ideaEvidenceMath.ts";

const companies = [
  { name: "Salaudeen Smiles Limited", trading_name: "Swinnow Dental", domain: "www.swinnowdental.co.uk" },
  { name: "Acme Roofing Ltd", trading_name: null, domain: "acmeroofing.com" },
  { name: "AB", trading_name: null, domain: null },
];
const banned = bannedTerms(companies, ["Jo Bloggs", "Madonna", null]);

test("banned terms: names with and without Ltd, trading names, domains and stems, full contact names, nothing too short", () => {
  for (const t of ["salaudeen smiles limited", "salaudeen smiles", "swinnow dental", "swinnowdental.co.uk", "swinnowdental", "acme roofing", "acmeroofing.com", "acmeroofing", "jo bloggs"]) assert.ok(banned.includes(t), t);
  assert.ok(!banned.includes("ab"));
  assert.ok(!banned.includes("madonna")); // a single name is not a full contact name
  assert.equal(mentionsAny("I read Swinnow Dental's home page", banned), "swinnow dental");
  assert.equal(mentionsAny("No enquiry form found", banned), null);
});
test("pains: only gaps seen at 2 or more different businesses, never one that names a business", () => {
  const rows = [
    { company_id: 1, kind: "gap", area: "Enquiries and booking", title: "Enquiries depend on phone or email only" },
    { company_id: 2, kind: "gap", area: "Enquiries and booking", title: "Enquiries depend on phone or email only" },
    { company_id: 2, kind: "gap", area: "Enquiries and booking", title: "Enquiries depend on phone or email only" },  // same business twice counts once
    { company_id: 3, kind: "gap", area: "Website", title: "No privacy policy link found" },                                // only one business
    { company_id: 1, kind: "strength", area: "Website", title: "Clear prices" }, { company_id: 2, kind: "strength", area: "Website", title: "Clear prices" },
    { company_id: 1, kind: "gap", area: "Marketing", title: "Swinnow Dental has no analytics" }, { company_id: 2, kind: "gap", area: "Marketing", title: "Swinnow Dental has no analytics" },
  ];
  assert.deepEqual(anonymisedPains(rows, banned), [{ area: "Enquiries and booking", title: "Enquiries depend on phone or email only", companies: 2 }]);
  assert.deepEqual(anonymisedPains(rows, banned, 1).map((p) => p.title).sort(), ["Enquiries depend on phone or email only", "No privacy policy link found"]);
});
test("the evidence digest drops any line that names a business, cites ids, and fits the size limit", () => {
  const e = {
    winners: [{ hook: "Quotes going quiet?", platform: "instagram", x: 2.4 }],
    outliers: [{ id: 31, hookType: "Question", format: "talking head", beats: ["a", "b", "c", "d"], why: "clear promise" }],
    trends: [{ id: 7, title: "Missed call text back is trending", detail: null }, { id: 8, title: "Acme Roofing went viral", detail: "see acmeroofing.com" }],
    pains: [{ area: "Enquiries and booking", title: "Enquiries depend on phone or email only", companies: 4 }, { area: "X", title: "Swinnow Dental has no form", companies: 3 }],
  };
  const d = evidenceDigest(e, banned);
  assert.match(d, /W1: "Quotes going quiet\?" on instagram, 2\.4×/);
  assert.match(d, /O31: Question hook, talking head\. Steps: a > b > c\./);
  assert.match(d, /T7: Missed call text back/);
  assert.match(d, /P1: Enquiries and booking: Enquiries depend on phone or email only \(seen at 4 businesses\)/);
  for (const name of ["Acme", "acmeroofing", "Swinnow"]) assert.ok(!d.toLowerCase().includes(name.toLowerCase()), name);
  const long = { ...e, trends: Array.from({ length: 300 }, (_, i) => ({ id: i, title: `Trend number ${i} about something quite long indeed`, detail: null })) };
  assert.ok(evidenceDigest(long, banned, 2000).length <= 2000);
  assert.equal(evidenceDigest({ winners: [], outliers: [], trends: [], pains: [] }, banned), "");
});
test("pillar mix follows the weekly 2:1:1:1 and always adds up", () => {
  assert.deepEqual(pillarMix(10), { "Show the build": 4, "Build in public": 2, "Teach / steal this": 2, "Niche pain": 2 });
  assert.deepEqual(pillarMix(5), { "Show the build": 2, "Build in public": 1, "Teach / steal this": 1, "Niche pain": 1 });
  for (const n of [1, 3, 7, 10, 13, 20]) assert.equal(Object.values(pillarMix(n)).reduce((a, b) => a + b, 0), n);
});
test("generated ideas: only valid tags, no figures, no repeats, and a cited source is kept only if it was really supplied", () => {
  const ids = { trends: new Set([7]), outliers: new Set([31]), pains: 2, winners: 1 };
  const g = (o = {}) => ({ idea: "Show a quote chaser", hook: "Quotes going quiet?", pillar: "Show the build", hook_type: "Question", niche: "trades", based_on: { kind: "generated", ref: null }, ...o });
  const r = cleanGenerated({ ideas: [
    g(),
    g({ idea: "Cited trend", based_on: { kind: "trend", ref: "T7" } }),
    g({ idea: "Made-up trend", based_on: { kind: "trend", ref: "T99" } }),
    g({ idea: "Outlier based", based_on: { kind: "outlier", ref: "O31" } }),
    g({ idea: "Pain based", based_on: { kind: "pipeline", ref: "P2" } }),
    g({ idea: "Pain out of range", based_on: { kind: "pipeline", ref: "P3" } }),
    g({ idea: "Bad pillar", pillar: "Nope" }), g({ idea: "Bad niche", niche: "gardening" }), g({ idea: "Claims a result: made £5,000 a month" }), g({ idea: "Already have this" }),
    g({ idea: "Dental one", niche: "dental" }),
  ] }, ["trades", "dental"], ids, ["already have this"], null);
  assert.deepEqual(r.ideas.map((i) => [i.idea, i.source, i.source_ref]), [
    ["Show a quote chaser", "generated", null], ["Cited trend", "trend", "trend:7"], ["Made-up trend", "generated", null], ["Outlier based", "outlier", "creator_post:31"],
    ["Pain based", "pipeline", "pain:2"], ["Pain out of range", "generated", null], ["Dental one", "generated", null],
  ]);
  assert.equal(r.dropped, 4);
  assert.deepEqual(cleanGenerated({ ideas: [g({ niche: "dental" })] }, ["trades", "dental"], ids, [], "trades").ideas[0].niche, "trades"); // a chosen niche wins
});
test("scores: kept when in range, matched by position, low scores archived", () => {
  const s = cleanScores({ scores: [{ index: 0, score: 8, reason: "clear" }, { index: 2, score: 3.6, reason: "vague" }, { index: 5, score: 9, reason: "out of range" }, { index: 1, score: 14, reason: "bad" }] }, 3);
  assert.deepEqual(s, [{ score: 8, reason: "clear" }, null, { score: 4, reason: "vague" }]);
  assert.deepEqual([scoredLow(4), scoredLow(5), scoredLow(null)], [true, false, false]);
});
test("pipeline ideas: no business names, no @, no money figures, and only counts that were supplied", () => {
  const facts = "Researched 12 dental businesses; 9 had this gap.";
  const ok = [{ idea: "I looked at 12 dental sites; 9 had no enquiry form", hook: "9 of 12 dental sites had no form" }, { idea: "b", hook: "c" }, { idea: "d", hook: "e" }];
  assert.deepEqual(pipelineProblems(ok, banned, facts), []);
  const bad = [{ idea: "Swinnow Dental has no form", hook: "x" }, { idea: "We saw 40 sites with it", hook: "y @someone" }, { idea: "They lose £2,000 a month", hook: "z" }];
  const p = pipelineProblems(bad, banned, facts).join("|");
  assert.match(p, /idea 1 mentions "swinnow dental"/);
  assert.match(p, /idea 2 uses a number that was not supplied \(40\)/);
  assert.match(p, /idea 2 contains an @ name/);
  assert.match(p, /idea 3 states a money amount/);
  assert.match(pipelineProblems([ok[0]], banned, facts).join(), /exactly 3 ideas/);
});
