import test from "node:test";
import assert from "node:assert/strict";
import { badgeText, describeNeeds, isDemoFolder, shortTitle } from "../lib/needsYouMath.ts";
import { dueCheckpoint } from "../lib/contentMath.ts";

test("nothing is due in a post's first 24 hours", () => {
  assert.equal(dueCheckpoint(0, []), null);
  assert.equal(dueCheckpoint(23.9, []), null);
});
test("each checkpoint falls due as the post reaches its age", () => {
  assert.equal(dueCheckpoint(24, []), 24);
  assert.equal(dueCheckpoint(72, []), 72);
  assert.equal(dueCheckpoint(168, []), 168);
});
test("a post is only ever waiting for one set of numbers: a missed checkpoint hands over to the next", () => {
  assert.equal(dueCheckpoint(71.9, []), 24);
  assert.equal(dueCheckpoint(80, []), 72);
  assert.equal(dueCheckpoint(200, []), 168);
});
test("saving the numbers clears the checkpoint, and the next one still falls due", () => {
  assert.equal(dueCheckpoint(80, [72]), null);
  assert.equal(dueCheckpoint(80, [24]), 72);
  assert.equal(dueCheckpoint(170, [72]), 168);
  assert.equal(dueCheckpoint(170, [24, 72, 168]), null);
});
test("numbers saved for a later checkpoint close the earlier ones", () => {
  assert.equal(dueCheckpoint(50, [72]), null);
});
test("it stops asking a week after the last checkpoint, so old posts cannot inflate the number for ever", () => {
  assert.equal(dueCheckpoint(335.9, []), 168);
  assert.equal(dueCheckpoint(336, []), null);
  assert.equal(dueCheckpoint(5000, []), null);
});

test("a badge stops counting at 99+", () => {
  assert.deepEqual([badgeText(1), badgeText(99), badgeText(100), badgeText(2500)], ["1", "99", "99+", "99+"]);
});
test("the description uses one or many, and leaves out empty groups", () => {
  const groups = (a, b) => [{ n: a, one: "post needs its numbers", many: "posts need their numbers" }, { n: b, one: "video past its posting date", many: "videos past their posting date" }];
  assert.equal(describeNeeds(groups(1, 0)), "1 post needs its numbers");
  assert.equal(describeNeeds(groups(2, 1)), "2 posts need their numbers, 1 video past its posting date");
  assert.equal(describeNeeds(groups(0, 0)), "");
});
test("only a folder directly under demos/ counts as a demo, and nothing else is looked up on disk", () => {
  assert.equal(isDemoFolder("demos/client-report"), true);
  assert.equal(isDemoFolder(" demos/client-report/ "), true);
  for (const bad of ["", null, undefined, "client-report", "demos/", "demos/../.env", "../demos/x", "/etc/passwd", "demos/a/b"]) assert.equal(isDemoFolder(bad), false, String(bad));
});
test("long titles are cut at a word", () => {
  assert.equal(shortTitle("  short   title "), "short title");
  const t = shortTitle("Why every plumber loses the same three jobs a week and what the good ones do about it instead", 40);
  assert.ok(t.length <= 40 && t.endsWith("…") && !t.includes("  "), t);
  assert.equal(t, "Why every plumber loses the same three…");
});
