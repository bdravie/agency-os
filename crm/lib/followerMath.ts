// Pure maths and safety guardrails for follower tracking.
// Zero Node or database imports so this module can run in both client and server bundles and be tested directly.

export type FollowerPlatform = "youtube" | "instagram" | "tiktok" | "linkedin";

export const FOLLOWER_PLATFORMS: readonly FollowerPlatform[] = [
  "youtube",
  "instagram",
  "tiktok",
  "linkedin",
] as const;

export type FollowerSnapshot = {
  id?: number;
  account_id?: number | null;
  platform: FollowerPlatform;
  follower_count: number;
  delta_daily?: number | null;
  source: "api" | "manual";
  notes?: string | null;
  captured_at: string;
};

export type FollowerGrowth = {
  current: number;
  previousDay: number | null;
  deltaDay: number;
  deltaWeek: number;
  deltaMonth: number;
  pacePerDay: number;
  nextMilestone: number;
  milestoneProgress: number; // 0 to 100
};

export const MILESTONES = [
  500, 1000, 2500, 5000, 10000, 25000, 50000, 100000, 250000, 500000, 1000000,
] as const;

/**
 * Strict safety guardrail: LinkedIn is never checked automatically.
 * Scraping or automating LinkedIn risks account suspension.
 */
export function canAutoPollPlatform(platform: string): boolean {
  if (platform.toLowerCase() === "linkedin") {
    return false;
  }
  return ["youtube", "instagram", "tiktok"].includes(platform.toLowerCase());
}

/**
 * Rate limit guard to prevent hitting external APIs excessively while dashboard is open.
 * Returns true if the last poll occurred within the minimum interval (default 3 minutes).
 */
export function isSnapshotRateLimited(
  lastPolledAt: string | Date | null | undefined,
  minIntervalMinutes = 3
): boolean {
  if (!lastPolledAt) return false;
  const last = typeof lastPolledAt === "string" ? new Date(lastPolledAt) : lastPolledAt;
  const elapsedMs = Date.now() - last.getTime();
  const minIntervalMs = minIntervalMinutes * 60 * 1000;
  return elapsedMs < minIntervalMs;
}

/**
 * Formats a follower count with standard metric abbreviations (e.g. 1,250 -> 1.3k, 12,400 -> 12.4k).
 */
export function formatFollowerCount(count: number): string {
  if (!Number.isFinite(count) || count < 0) return "0";
  if (count < 1000) return count.toLocaleString("en-GB");
  if (count < 1000000) {
    const formatted = (count / 1000).toFixed(1).replace(/\.0$/, "");
    return `${formatted}k`;
  }
  const formatted = (count / 1000000).toFixed(2).replace(/\.?0+$/, "");
  return `${formatted}M`;
}

/**
 * Finds the next milestone tier for a given count and computes percentage progression.
 */
export function calculateMilestone(current: number): { nextMilestone: number; progress: number } {
  if (current <= 0) {
    return { nextMilestone: MILESTONES[0], progress: 0 };
  }
  for (let i = 0; i < MILESTONES.length; i++) {
    const target = MILESTONES[i];
    if (current < target) {
      const prev = i === 0 ? 0 : MILESTONES[i - 1];
      const range = target - prev;
      const done = current - prev;
      const progress = Math.min(100, Math.max(0, Math.round((done / range) * 100)));
      return { nextMilestone: target, progress };
    }
  }
  // Above 1M, step by 500k
  const step = 500000;
  const target = Math.ceil((current + 1) / step) * step;
  const prev = target - step;
  const progress = Math.min(100, Math.max(0, Math.round(((current - prev) / step) * 100)));
  return { nextMilestone: target, progress };
}

/**
 * Calculates current count, daily delta, 7-day delta, 30-day delta, and pace per day from snapshot history.
 */
export function calculateFollowerGrowth(
  snapshots: FollowerSnapshot[],
  now: Date = new Date()
): FollowerGrowth {
  if (!snapshots || snapshots.length === 0) {
    return {
      current: 0,
      previousDay: null,
      deltaDay: 0,
      deltaWeek: 0,
      deltaMonth: 0,
      pacePerDay: 0,
      nextMilestone: MILESTONES[0],
      milestoneProgress: 0,
    };
  }

  // Ensure chronological descending order (newest first)
  const sorted = [...snapshots].sort(
    (a, b) => new Date(b.captured_at).getTime() - new Date(a.captured_at).getTime()
  );

  const current = sorted[0].follower_count;
  const nowMs = now.getTime();
  const dayMs = 24 * 60 * 60 * 1000;

  // Find snapshots matching historical windows
  let dayAgoSnapshot: FollowerSnapshot | null = null;
  let weekAgoSnapshot: FollowerSnapshot | null = null;
  let monthAgoSnapshot: FollowerSnapshot | null = null;

  for (const s of sorted) {
    const elapsed = nowMs - new Date(s.captured_at).getTime();
    if (!dayAgoSnapshot && elapsed >= dayMs * 0.8) {
      dayAgoSnapshot = s;
    }
    if (!weekAgoSnapshot && elapsed >= dayMs * 6.5) {
      weekAgoSnapshot = s;
    }
    if (!monthAgoSnapshot && elapsed >= dayMs * 28) {
      monthAgoSnapshot = s;
    }
  }

  // Fallbacks if history is young
  if (!dayAgoSnapshot && sorted.length > 1) {
    dayAgoSnapshot = sorted[sorted.length - 1];
  }
  if (!weekAgoSnapshot && sorted.length > 1) {
    weekAgoSnapshot = sorted[sorted.length - 1];
  }
  if (!monthAgoSnapshot && sorted.length > 1) {
    monthAgoSnapshot = sorted[sorted.length - 1];
  }

  const deltaDay = dayAgoSnapshot ? current - dayAgoSnapshot.follower_count : 0;
  const deltaWeek = weekAgoSnapshot ? current - weekAgoSnapshot.follower_count : 0;
  const deltaMonth = monthAgoSnapshot ? current - monthAgoSnapshot.follower_count : 0;

  // Pace per day based on earliest snapshot
  const oldest = sorted[sorted.length - 1];
  const totalDays = Math.max(1, (nowMs - new Date(oldest.captured_at).getTime()) / dayMs);
  const totalDelta = current - oldest.follower_count;
  const pacePerDay = Math.round((totalDelta / totalDays) * 10) / 10;

  const { nextMilestone, progress } = calculateMilestone(current);

  return {
    current,
    previousDay: dayAgoSnapshot ? dayAgoSnapshot.follower_count : null,
    deltaDay,
    deltaWeek,
    deltaMonth,
    pacePerDay,
    nextMilestone,
    milestoneProgress: progress,
  };
}

export function platformLabel(platform: FollowerPlatform): string {
  switch (platform) {
    case "youtube":
      return "YouTube";
    case "instagram":
      return "Instagram";
    case "tiktok":
      return "TikTok";
    case "linkedin":
      return "LinkedIn";
  }
}

export function metricLabel(platform: FollowerPlatform): string {
  return platform === "youtube" ? "Subscribers" : "Followers";
}
