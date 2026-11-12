import test from "node:test";
import assert from "node:assert/strict";
import {
  getDayOfYear,
  getDailyVerse,
  getRandomVerse,
  CURATED_VERSES,
} from "../lib/bibleVerses.ts";

test("getDayOfYear computes expected day range", () => {
  const jan1 = new Date("2026-01-01T12:00:00Z");
  assert.equal(getDayOfYear(jan1), 1);

  const now = new Date();
  const day = getDayOfYear(now);
  assert.ok(day >= 1 && day <= 366);
});

test("getDailyVerse returns complete verse structure with YouVersion link", () => {
  const verse = getDailyVerse();
  assert.ok(verse.id > 0);
  assert.ok(verse.reference.length > 3);
  assert.ok(verse.text.length > 10);
  assert.ok(verse.youVersionUrl.startsWith("https://www.bible.com/"));
});

test("getRandomVerse avoids repeating current verse when multiple exist", () => {
  const current = CURATED_VERSES[0];
  const next = getRandomVerse(current.id);
  assert.notEqual(next.id, current.id);
  assert.ok(next.text.length > 5);
});
