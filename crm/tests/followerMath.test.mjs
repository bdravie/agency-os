import test from "node:test";
import assert from "node:assert/strict";
import {
  canAutoPollPlatform,
  isSnapshotRateLimited,
  formatFollowerCount,
  calculateMilestone,
  calculateFollowerGrowth,
} from "../lib/followerMath.ts";

test("canAutoPollPlatform strictly refuses LinkedIn auto-polling", () => {
  assert.equal(canAutoPollPlatform("linkedin"), false);
  assert.equal(canAutoPollPlatform("LinkedIn"), false);
  assert.equal(canAutoPollPlatform("LINKEDIN"), false);

  assert.equal(canAutoPollPlatform("youtube"), true);
  assert.equal(canAutoPollPlatform("instagram"), true);
  assert.equal(canAutoPollPlatform("tiktok"), true);
  assert.equal(canAutoPollPlatform("unknown"), false);
});

test("isSnapshotRateLimited throttles rapid polling", () => {
  const now = Date.now();
  const twoMinutesAgo = new Date(now - 2 * 60 * 1000).toISOString();
  const fourMinutesAgo = new Date(now - 4 * 60 * 1000).toISOString();

  assert.equal(isSnapshotRateLimited(twoMinutesAgo, 3), true);
  assert.equal(isSnapshotRateLimited(fourMinutesAgo, 3), false);
  assert.equal(isSnapshotRateLimited(null, 3), false);
});

test("formatFollowerCount produces readable metric strings", () => {
  assert.equal(formatFollowerCount(450), "450");
  assert.equal(formatFollowerCount(1200), "1.2k");
  assert.equal(formatFollowerCount(15000), "15k");
  assert.equal(formatFollowerCount(125400), "125.4k");
  assert.equal(formatFollowerCount(1200000), "1.2M");
});

test("calculateMilestone computes target tier and progress", () => {
  // 500 target from 0
  const m1 = calculateMilestone(250);
  assert.equal(m1.nextMilestone, 500);
  assert.equal(m1.progress, 50);

  // Between 5k and 10k: 7500 is halfway (50%)
  const m2 = calculateMilestone(7500);
  assert.equal(m2.nextMilestone, 10000);
  assert.equal(m2.progress, 50);

  // At exactly 10k: next target is 25k (0%)
  const m3 = calculateMilestone(10000);
  assert.equal(m3.nextMilestone, 25000);
  assert.equal(m3.progress, 0);
});

test("calculateFollowerGrowth calculates accurate daily and weekly deltas", () => {
  const now = new Date("2026-11-20T12:00:00Z");
  const snapshots = [
    {
      platform: "youtube",
      follower_count: 1500,
      captured_at: "2026-11-20T11:00:00Z",
      source: "api",
    },
    {
      platform: "youtube",
      follower_count: 1480,
      captured_at: "2026-11-19T10:00:00Z", // ~25 hours ago
      source: "api",
    },
    {
      platform: "youtube",
      follower_count: 1400,
      captured_at: "2026-11-13T10:00:00Z", // ~7 days ago
      source: "api",
    },
    {
      platform: "youtube",
      follower_count: 1200,
      captured_at: "2026-10-20T10:00:00Z", // ~31 days ago
      source: "api",
    },
  ];

  const growth = calculateFollowerGrowth(snapshots, now);
  assert.equal(growth.current, 1500);
  assert.equal(growth.deltaDay, 20); // 1500 - 1480
  assert.equal(growth.deltaWeek, 100); // 1500 - 1400
  assert.equal(growth.deltaMonth, 300); // 1500 - 1200
  assert.equal(growth.nextMilestone, 2500);
});
