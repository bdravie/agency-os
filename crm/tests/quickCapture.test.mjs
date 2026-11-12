import test from "node:test";
import assert from "node:assert/strict";
import {
  checkNoteSafety,
  fallbackTitleFromNote,
  calculateChecklistProgress,
  statusFromChecklist,
  DEFAULT_CHECKLIST,
} from "../lib/quickCaptureMath.ts";

test("checkNoteSafety rejects email addresses", () => {
  const note = "Met a roofer who had an idea for a video. Contact him on dave@roofing.co.uk about it.";
  const res = checkNoteSafety(note);
  assert.equal(res.ok, false);
  assert.match(res.error, /Email addresses are refused/);
});

test("checkNoteSafety rejects UK phone numbers", () => {
  const note1 = "Call client back on 07700 900123 for b-roll clips.";
  assert.equal(checkNoteSafety(note1).ok, false);

  const note2 = "Office line is +44 20 7946 0123.";
  assert.equal(checkNoteSafety(note2).ok, false);
});

test("checkNoteSafety permits normal creative notes with figures and dates", () => {
  const note = `
    3 ways trades businesses lose 10 hours a week on WhatsApp quotes.
    Filming concept: Show split screen of messy voice notes vs streamlined form.
    Camera setting: 1080p 60fps. Budget roughly £150 in ads. Target 2026 pace.
  `;
  const res = checkNoteSafety(note);
  assert.equal(res.ok, true);
});

test("fallbackTitleFromNote extracts clean title under 60 chars", () => {
  const note = "# Why dental clinics miss weekend enquiries\nHere are the details...";
  assert.equal(fallbackTitleFromNote(note), "Why dental clinics miss weekend enquiries");

  const longNote = "This is an extremely long first line that goes on and on and on explaining every single detail of the whole idea without any break";
  const title = fallbackTitleFromNote(longNote);
  assert.ok(title.length <= 60);
  assert.ok(title.endsWith("…"));
});

test("calculateChecklistProgress computes correct counts and percentage", () => {
  const initial = calculateChecklistProgress(DEFAULT_CHECKLIST);
  assert.equal(initial.done, 1);
  assert.equal(initial.total, 7);
  assert.equal(initial.percent, 14);

  const half = [
    { key: "concept", label: "Concept", done: true },
    { key: "script", label: "Script", done: true },
    { key: "film", label: "Film", done: true },
    { key: "edit", label: "Edit", done: false },
  ];
  const progress = calculateChecklistProgress(half);
  assert.equal(progress.done, 3);
  assert.equal(progress.total, 4);
  assert.equal(progress.percent, 75);
});

test("statusFromChecklist reflects stage progression", () => {
  assert.equal(statusFromChecklist(DEFAULT_CHECKLIST), "Idea");

  const scripted = DEFAULT_CHECKLIST.map((i) => (i.key === "script" ? { ...i, done: true } : i));
  assert.equal(statusFromChecklist(scripted), "Scripted");

  const filmed = scripted.map((i) => (i.key === "film" ? { ...i, done: true } : i));
  assert.equal(statusFromChecklist(filmed), "Filmed");

  const scheduled = filmed.map((i) => (i.key === "schedule" ? { ...i, done: true } : i));
  assert.equal(statusFromChecklist(scheduled), "Posted");
});
