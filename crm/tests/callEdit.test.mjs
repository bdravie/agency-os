import test from "node:test";
import assert from "node:assert/strict";
import { KIND_LABEL, analysisIsStale, canEditNotes, defaultTitle, isKind, prepareNotesEdit } from "../lib/callEdit.ts";

test("kinds: only the three known values are accepted, and each has a label and a title", () => {
  assert.ok(isKind("call") && isKind("video") && isKind("in_person"));
  assert.ok(!isKind("meeting") && !isKind(null) && !isKind(undefined));
  assert.equal(KIND_LABEL.in_person, "In-person meeting");
  assert.equal(defaultTitle("in_person", "Acme Ltd"), "Meeting with Acme Ltd");
  assert.equal(defaultTitle("video", "Acme Ltd"), "Video call with Acme Ltd");
  assert.equal(defaultTitle("call", "Acme Ltd"), "Call with Acme Ltd");
});

test("edited notes: emails and phone numbers are masked again, and a change is detected", () => {
  const r = prepareNotesEdit("Met at their yard.\nSarah's email is sarah@example.com, mobile 07700 900123.\n\n\n\nWants quotes sent faster.", "Met at their yard.");
  assert.ok(!("error" in r));
  assert.ok(r.text.includes("[email]") && r.text.includes("[phone]"));
  assert.ok(!r.text.includes("sarah@example.com") && !r.text.includes("900123"));
  assert.equal(r.masked, 2);
  assert.ok(!r.text.includes("\n\n\n"));           // runs of blank lines are tidied
  assert.equal(r.changed, true);
});

test("edited notes: saving the same text again is not a change (so the analysis is not marked out of date)", () => {
  const stored = "Met at their yard.\n\nWants quotes sent faster.";
  const again = prepareNotesEdit(`  ${stored}  \r\n`, stored);
  assert.ok(!("error" in again));
  assert.equal(again.changed, false);
  // Preparing already-prepared text changes nothing, so re-saving after a mask is also stable.
  const masked = prepareNotesEdit("Call me on 07700 900123", null);
  assert.ok(!("error" in masked));
  const twice = prepareNotesEdit(masked.text, masked.text);
  assert.ok(!("error" in twice));
  assert.equal(twice.changed, false);
});

test("edited notes: empty and over-long text are refused", () => {
  assert.ok("error" in prepareNotesEdit("   \n  ", "old"));
  assert.ok("error" in prepareNotesEdit("x".repeat(80_001), "old"));
});

test("the analysis is out of date only when the notes were edited after it ran", () => {
  assert.equal(analysisIsStale(null, "2026-11-08T10:00:00Z"), false);                       // never analysed
  assert.equal(analysisIsStale("2026-11-08T10:00:00Z", null), false);                       // never edited
  assert.equal(analysisIsStale("2026-11-08T10:00:00Z", "2026-11-08T11:00:00Z"), true);
  assert.equal(analysisIsStale("2026-11-08T12:00:00Z", "2026-11-08T11:00:00Z"), false);     // analysed again after the edit
  assert.equal(analysisIsStale(new Date("2026-11-08T10:00:00Z"), new Date("2026-11-09T10:00:00Z")), true);
});

test("only the owner's own notes can be edited, and only while the text is still there", () => {
  assert.equal(canEditNotes("notes", true), true);
  assert.equal(canEditNotes("notes", false), false);   // text was removed on purpose
  assert.equal(canEditNotes("transcript", true), false);
  assert.equal(canEditNotes("vtt", true), false);
});
