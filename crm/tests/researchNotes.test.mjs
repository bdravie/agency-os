import test from "node:test";
import assert from "node:assert/strict";
import { checkResearchNotes, toOwnerNotes, ownerNotesFacts, citedNotes } from "../lib/researchNotes.ts";
import { normaliseSuggestions } from "../lib/offerSuggestNormalise.ts";

test("notes are tidied line by line, and each line becomes a citable note", () => {
  const { notes, error } = checkResearchNotes("  - Phone went to voicemail \r\n\n* No   prices shown <b>x</b>\n1. Form asks them to email ");
  assert.equal(error, undefined);
  assert.equal(notes, "Phone went to voicemail\nNo prices shown x\nForm asks them to email");
  assert.deepEqual(toOwnerNotes(notes).map((n) => n.id), ["N1", "N2", "N3"]);
  assert.match(ownerNotesFacts(toOwnerNotes(notes)), /N2 No prices shown x/);
});
test("empty notes are allowed and add nothing to the AI's facts", () => {
  assert.deepEqual(checkResearchNotes("  \n "), { notes: "" });
  assert.deepEqual(toOwnerNotes(null), []);
  assert.equal(ownerNotesFacts([]), "");
});
test("contact details and over-long notes are refused", () => {
  assert.match(checkResearchNotes("Owner is sam@oakwood.co.uk").error, /email addresses and phone numbers/);
  assert.match(checkResearchNotes("Call 07700 900123").error, /email addresses and phone numbers/);
  assert.match(checkResearchNotes("x".repeat(2001)).error, /2000 characters/);
  assert.match(checkResearchNotes(Array(21).fill("a note").join("\n")).error, /20 lines/);
});
test("an idea citing a note counts as evidence, and a figure in a note is not flagged as invented", () => {
  const raw = { business_summary: "A heating firm.", suggestions: [{ title: "Catch missed calls", automation: "Logs missed calls", outcome: "Fewer lost enquiries", why: "Voicemail 2 times", finding_ids: ["n1", "N9"], offer_name: null, kpi: "missed calls", pilot: "one week", risk: "low volume", needs_dpa: false, confidence: "medium" }], opener: "Your line went to voicemail.", opener_finding_ids: ["N1"], questions: [], not_checked: [] };
  const { result, warnings } = normaliseSuggestions(raw, { findingIds: ["F1", "N1"], offerNames: [], facts: "N1 Voicemail 2 times" });
  assert.deepEqual(result.suggestions[0].finding_ids, ["N1"]);
  assert.equal(result.suggestions[0].confidence, "medium");
  assert.equal(result.opener, "Your line went to voicemail.");
  assert.deepEqual(warnings, []);
});
test("only the notes actually cited are kept with a result", () => {
  const notes = toOwnerNotes("One\nTwo\nThree");
  assert.deepEqual(citedNotes(notes, ["F1", "N3"]), [{ id: "N3", text: "Three" }]);
});
