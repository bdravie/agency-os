import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateContrastRatio,
  hexToRgb,
  evaluatePlatformRisk,
  scoreThumbnailPerformance,
} from "../lib/thumbnailMath.ts";

test("calculateContrastRatio correctly calculates WCAG contrast ratios", () => {
  const white = hexToRgb("#ffffff");
  const black = hexToRgb("#000000");
  assert.equal(calculateContrastRatio(white, black), 21.0);
  assert.equal(calculateContrastRatio(white, white), 1.0);

  // Brand Coral on Brand Navy
  const coral = hexToRgb("#FF6B5B");
  const navy = hexToRgb("#14213D");
  const brandContrast = calculateContrastRatio(coral, navy);
  assert.ok(brandContrast >= 4.5, `Brand contrast was ${brandContrast}`);
});

test("evaluatePlatformRisk flags positioning claims as High risk", () => {
  const badHeadline = "How I made £50k in 30 days";
  const evalResult = evaluatePlatformRisk("16:9", badHeadline, 45);
  assert.equal(evalResult.risk, "High");
  assert.ok(evalResult.reasons.some((r) => r.includes("positioning rule")));
});

test("evaluatePlatformRisk checks 9:16 TikTok and Reels safe zones", () => {
  // Safe position (40% height)
  const safe = evaluatePlatformRisk("9:16", "MISSED CALLS?", 40);
  assert.equal(safe.risk, "Low");
  assert.equal(safe.reasons.length, 0);

  // Top header occlusion (8% height)
  const topOccluded = evaluatePlatformRisk("9:16", "MISSED CALLS?", 8);
  assert.equal(topOccluded.risk, "Medium");
  assert.ok(topOccluded.reasons.some((r) => r.includes("top 15%")));

  // Bottom caption occlusion (80% height)
  const bottomOccluded = evaluatePlatformRisk("9:16", "MISSED CALLS?", 80);
  assert.equal(bottomOccluded.risk, "Medium");
  assert.ok(bottomOccluded.reasons.some((r) => r.includes("bottom 28%")));
});

test("scoreThumbnailPerformance rewards brevity, contrast, and intrigue", () => {
  // Ideal: 2-3 words, AAA contrast (>7.0), intrigue word
  const topScore = scoreThumbnailPerformance("WHY QUOTES GO COLD", 8.5, "16:9");
  assert.ok(topScore >= 8, `Expected high score, got ${topScore}`);

  // Weak: 12 words, low contrast (<3.0)
  const weakScore = scoreThumbnailPerformance("Here is a very long explanation about why everything takes so much extra time and money", 2.2, "16:9");
  assert.ok(weakScore <= 3, `Expected low score, got ${weakScore}`);
});
