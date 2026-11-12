import test from "node:test";
import assert from "node:assert/strict";
import {
  estimateScanCost,
  isVideoFilename,
  canRenameClip,
  sanitizeProposedFilename,
  formatDuration,
} from "../lib/footageSafety.ts";

test("estimateScanCost computes accurate estimates and formatting", () => {
  const zero = estimateScanCost(0);
  assert.equal(zero.estimatedCost, 0);

  const ten = estimateScanCost(10);
  assert.equal(ten.estimatedCost, 0.02);
  assert.equal(ten.formattedCost, "$0.02");

  const twentyFive = estimateScanCost(25);
  assert.equal(twentyFive.estimatedCost, 0.05);
});

test("isVideoFilename detects video files and ignores sidecars or non-videos", () => {
  assert.equal(isVideoFilename("A001_C001_111001.mp4"), true);
  assert.equal(isVideoFilename("talking_head_take1.mov"), true);
  assert.equal(isVideoFilename("screen_recording.webm"), true);
  assert.equal(isVideoFilename("broll.mkv"), true);

  assert.equal(isVideoFilename(".DS_Store"), false);
  assert.equal(isVideoFilename("._A001.mov"), false);
  assert.equal(isVideoFilename("notes.txt"), false);
  assert.equal(isVideoFilename("thumbnail.jpg"), false);
});

test("canRenameClip refuses renaming for clips used in editing projects", () => {
  const unassigned = { current_name: "take1.mov", used_in_project_id: null };
  assert.equal(canRenameClip(unassigned).allowed, true);

  const locked = { current_name: "take1.mov", used_in_project_id: 42 };
  const check = canRenameClip(locked);
  assert.equal(check.allowed, false);
  assert.match(check.reason, /assigned to an active editing project/);
});

test("sanitizeProposedFilename cleans names and prevents path traversal", () => {
  const orig = "C0012.MP4";
  const proposed = "../../malicious/name / with spaces";
  const clean = sanitizeProposedFilename(proposed, orig);
  assert.equal(clean, "malicious-name-with-spaces.mp4");
  assert.ok(!clean.includes("/"));
  assert.ok(!clean.includes(".."));

  // Preserves casing of alphanumeric and replaces double hyphens
  assert.equal(sanitizeProposedFilename("20261111_Talking-Head--Dental", "take.mov"), "20261111-Talking-Head-Dental.mov");
});

test("formatDuration formats seconds accurately", () => {
  assert.equal(formatDuration(null), "–");
  assert.equal(formatDuration(45), "0:45");
  assert.equal(formatDuration(75), "1:15");
  assert.equal(formatDuration(3665), "1:01:05");
});
