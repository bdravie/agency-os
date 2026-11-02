import test from "node:test";
import assert from "node:assert/strict";
import { breakdownProblems, cleanBreakdown, copiedRun, maskContact } from "../lib/breakdownMath.ts";

const NICHES = ["trades", "dental", "aesthetics"];
const idea = (o = {}) => ({ idea: "Show a roofer how missed calls become booked quotes", hook: "Missed calls are costing you jobs", pillar: "Niche pain", hook_type: "Call out the pain", niche: "trades", ...o });
const raw = (o = {}) => ({ hook: "Stop doing this", hook_type: "Contrarian", format: "Talking head", length_note: "about 30 seconds", beats: ["hook", "proof", "offer"], why_it_worked: ["clear promise"], cta: "Comment GUESTS", ideas: [idea(), idea({ pillar: "Show the build", hook_type: "Result first", niche: "dental" }), idea({ niche: "aesthetics" })], ...o });

test("clean-up keeps only ideas that fit the board, caps at 3 and fixes unknown hook types", () => {
  const b = cleanBreakdown(raw({ hook_type: "Made up", ideas: [idea(), idea({ pillar: "Nonsense" }), idea({ niche: "gardening" }), idea({ hook_type: "Nope" }), idea({ niche: "dental" }), idea(), idea()] }), NICHES, "caption", new Date("2026-11-02T12:00:00Z"));
  assert.equal(b.hook_type, null);
  assert.equal(b.ideas.length, 3);
  assert.equal(b.made_at, "2026-11-02T12:00:00.000Z");
  assert.equal(b.based_on, "caption");
});
test("a clean breakdown has no problems", () => {
  const b = cleanBreakdown(raw(), NICHES, "caption");
  assert.deepEqual(breakdownProblems(b, { caption: "Stop doing this thing, it never works for anyone", transcript: null }, ["creatorname"]), []);
});
test("copying six or more words in a row is caught, ignoring case and punctuation", () => {
  assert.equal(copiedRun("If you run a roofing company, you are still chasing quotes by hand.", "If you run a roofing company, what next?"), "if you run a roofing company");
  assert.equal(copiedRun("If you run a roofing company", "Roofers: chase quotes in one place"), null);
  assert.equal(copiedRun("short", "short"), null);
  const b = cleanBreakdown(raw({ ideas: [idea({ hook: "You are still chasing quotes by hand" }), idea({ niche: "dental" }), idea({ niche: "aesthetics" })] }), NICHES, "caption");
  const p = breakdownProblems(b, { caption: "If you run a roofing company you are still chasing quotes by hand every week", transcript: null }, []);
  assert.equal(p.length, 1);
  assert.match(p[0], /idea 1 copies wording/);
});
test("a transcript is checked for copying as well", () => {
  const b = cleanBreakdown(raw({ ideas: [idea({ idea: "Tell them the quote you sent last week is already cold" }), idea({ niche: "dental" }), idea({ niche: "aesthetics" })] }), NICHES, "caption_and_transcript");
  const p = breakdownProblems(b, { caption: "x", transcript: "Honestly the quote you sent last week is already cold, so chase it today." }, []);
  assert.match(p.join(), /idea 1 copies wording/);
});
test("claimed results, names and over-long hooks are caught", () => {
  const b = cleanBreakdown(raw({ ideas: [
    idea({ idea: "How a roofer made £10,000 in a month" }),
    idea({ hook: "We grew bookings 300% for a clinic", niche: "dental" }),
    idea({ idea: "Do what @someone does", niche: "aesthetics" }),
  ] }), NICHES, "caption");
  const p = breakdownProblems(b, { caption: "x", transcript: null }, []);
  assert.equal(p.filter((x) => /states a figure/.test(x)).length, 2);
  assert.equal(p.filter((x) => /names the creator/.test(x)).length, 1);
  const long = cleanBreakdown(raw({ ideas: [idea({ hook: "one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen" }), idea({ niche: "dental" }), idea({ niche: "aesthetics" })] }), NICHES, "caption");
  assert.match(breakdownProblems(long, { caption: "x", transcript: null }, []).join(), /longer than 14 words/);
  const named = breakdownProblems(cleanBreakdown(raw({ ideas: [idea({ idea: "Do what mattxwebb does for roofers" }), idea({ niche: "dental" }), idea({ niche: "aesthetics" })] }), NICHES, "caption"), { caption: "x", transcript: null }, ["mattxwebb"]);
  assert.match(named.join(), /names the creator/);
});
test("fewer than three usable ideas, or an empty breakdown, is a problem", () => {
  const b = cleanBreakdown(raw({ ideas: [idea()] }), NICHES, "caption");
  assert.match(breakdownProblems(b, { caption: "x", transcript: null }, []).join(), /exactly 3 usable ideas \(it has 1\)/);
  assert.match(breakdownProblems(cleanBreakdown({}, NICHES, "caption"), { caption: "x", transcript: null }, []).join(), /incomplete/);
});
test("pasted transcripts lose emails and phone numbers", () => {
  assert.equal(maskContact("Email me at jo.bloggs@example.com or call 07700 900123 today"), "Email me at [email] or call [phone] today");
  assert.equal(maskContact("Only 3 steps and 12 minutes"), "Only 3 steps and 12 minutes");
});
