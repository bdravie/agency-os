import test from "node:test";
import assert from "node:assert/strict";
import { cleanDemoBrief, demoBriefProblems, demoBriefPrompt, slugOf } from "../lib/demoBriefMath.ts";

const JOB = "We run a roofing firm and need a voice agent that books survey visits into our calendar.";
const raw = (o = {}) => ({
  gaps: [
    { what: "Retell AI voice agent", kind: "tool", why: "The client names it." },
    { what: "Booking into a calendar by phone", kind: "work", why: "It is the whole job." },
  ],
  covered: ["Weekly reporting: shown by the Weekly client report demo"],
  demo: {
    title: "Missed call booking demo", outcome: "Designed to turn a missed call into a booked survey visit.", covers_gaps: [1, 2, 9],
    steps: ["A call comes in.", "The agent asks for the job type.", "It books a slot."], tools: ["Retell AI", "n8n"],
    sample_data: ["10 fake callers"], out_of_scope: ["Real phone numbers"], loom_points: ["The call", "The booking", "The summary"], hours: 5.2,
  },
  data_note: null, ...o,
});

test("folder names are short kebab-case and never reuse an existing demo folder", () => {
  assert.equal(slugOf("Missed Call → Booking (Demo)!", []), "missed-call-booking-demo");
  assert.equal(slugOf("Client report", ["client-report", "client-report-2"]), "client-report-3");
  assert.equal(slugOf("???", []), "upwork-demo");
  assert.ok(slugOf("a very long title that goes on and on and on and on and on", []).length <= 40);
});

test("clean-up maps gap numbers to gaps, drops ones that do not exist and rounds hours", () => {
  const b = cleanDemoBrief(raw(), JOB, ["client-report"]);
  assert.deepEqual(b.demo.shows, ["Retell AI voice agent", "Booking into a calendar by phone"]);
  assert.equal(b.demo.slug, "missed-call-booking-demo");
  assert.equal(b.demo.hours, 5);
  assert.deepEqual(demoBriefProblems(b), []);
  assert.deepEqual(b.existing_demos, ["client-report"]);
});

test("no gaps means nothing to build, whatever demo the model wrote, and that is not a problem", () => {
  const b = cleanDemoBrief(raw({ gaps: [] }), JOB, []);
  assert.equal(b.demo, null);
  assert.deepEqual(demoBriefProblems(b), []);
  assert.equal(demoBriefPrompt(b, "Job", JOB), "");
});

test("a demo that covers no gap, has no steps or states a figure is flagged", () => {
  const d = raw().demo;
  assert.deepEqual(demoBriefProblems(cleanDemoBrief(raw({ demo: { ...d, covers_gaps: [] } }), JOB, [])), ["which gaps the demo covers"]);
  assert.deepEqual(demoBriefProblems(cleanDemoBrief(raw({ demo: { ...d, steps: ["One"] } }), JOB, [])), ["the steps"]);
  assert.deepEqual(demoBriefProblems(cleanDemoBrief(raw({ demo: { ...d, outcome: "Books 40% more visits." } }), JOB, [])), ["a figure or promise in the demo's description"]);
  assert.deepEqual(demoBriefProblems(cleanDemoBrief(raw({ demo: { ...d, title: "" } }), JOB, [])), ["the demo"]);
});

test("emails and phone numbers are removed from everything the model wrote and from the job post in the brief", () => {
  const b = cleanDemoBrief(raw({ gaps: [{ what: "Email jo@realfirm.co.uk", kind: "tool", why: "Call 020 7946 0958." }], demo: { ...raw().demo, covers_gaps: [1] } }), JOB, []);
  assert.ok(!/realfirm|7946/.test(JSON.stringify(b)));
  const text = demoBriefPrompt(b, "Job", "Contact me at owner@realfirm.co.uk or +44 20 7946 0958.");
  assert.ok(!/realfirm|7946/.test(text));
});

test("a job that points to personal data always carries the data processing agreement note", () => {
  const b = cleanDemoBrief(raw(), "We need patient reminders for our dental clinic.", []);
  assert.match(b.data_note, /data processing agreement/);
  assert.match(demoBriefPrompt(b, "Job", "x"), /data processing agreement/);
  assert.equal(cleanDemoBrief(raw(), JOB, []).data_note, null);
});

test("the brief always carries the repo's rules, the folder, the gaps and the existing demos", () => {
  const text = demoBriefPrompt(cleanDemoBrief(raw(), JOB, ["client-report"]), "Voice agent for roofers", JOB);
  for (const needle of ["demos/missed-call-booking-demo/", "Retell AI voice agent (a tool I have not used)", "fake data only", "Call it a demo", "Nothing is sent, posted or scraped", "existing: client-report", "Proof and answers", "about 5 hours", "1. A call comes in."]) {
    assert.ok(text.includes(needle), needle);
  }
  assert.ok(demoBriefPrompt(cleanDemoBrief(raw(), "x".repeat(6000), []), "Job", "x".repeat(6000)).length < 7500);
});
