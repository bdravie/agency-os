// Server-side follower tracking integrations and polling engine.
// Fetches follower counts from official APIs / gateway when configured,
// and enforces safety rules (e.g. LinkedIn must never be polled automatically).

import { query } from "./db";
import {
  canAutoPollPlatform,
  isSnapshotRateLimited,
  calculateFollowerGrowth,
  type FollowerPlatform,
  type FollowerSnapshot,
  type FollowerGrowth,
} from "./followerMath";

export type FollowerAccountRecord = {
  id: number;
  platform: FollowerPlatform;
  handle: string;
  account_id: string | null;
  url: string | null;
  enabled: boolean;
  auto_poll: boolean;
  last_polled_at: string | null;
  created_at: string;
};

export type PlatformSummary = {
  account: FollowerAccountRecord;
  growth: FollowerGrowth;
  history: FollowerSnapshot[];
};

/**
 * Fetches YouTube subscriber count using YouTube Data API v3.
 * Supports channel handles (e.g. "@bradravie") or channel IDs.
 */
export async function fetchYouTubeSubscribers(
  handleOrId: string
): Promise<{ count: number; channelTitle?: string } | null> {
  const apiKey =
    process.env.YOUTUBE_API_KEY ||
    process.env.GOOGLE_PLACES_API_KEY ||
    process.env.GOOGLE_CLIENT_ID;

  if (!apiKey) {
    return null;
  }

  const clean = handleOrId.trim();
  const isHandle = clean.startsWith("@") || !clean.startsWith("UC");
  const param = isHandle
    ? `forHandle=${encodeURIComponent(clean.replace(/^@/, ""))}`
    : `id=${encodeURIComponent(clean)}`;

  const url = `https://www.googleapis.com/youtube/v3/channels?part=statistics,snippet&${param}&key=${apiKey}`;

  try {
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) return null;
    const data = await res.json();
    const item = data.items?.[0];
    if (!item?.statistics?.subscriberCount) return null;

    const count = Number(item.statistics.subscriberCount);
    return {
      count: Number.isFinite(count) ? count : 0,
      channelTitle: item.snippet?.title,
    };
  } catch {
    return null;
  }
}

/**
 * Fetches follower count for Instagram or TikTok via the configured social engine (e.g. Upload-Post gateway).
 */
export async function fetchGatewayFollowers(
  platform: FollowerPlatform,
  handle: string
): Promise<{ count: number } | null> {
  if (platform === "linkedin") {
    throw new Error("LinkedIn cannot be polled automatically per CLAUDE.md safety rules.");
  }

  const apiKey = process.env.UPLOAD_POST_API_KEY;
  if (!apiKey) {
    return null;
  }

  try {
    const cleanHandle = handle.replace(/^@/, "").trim();
    const res = await fetch(
      `https://api.upload-post.com/v1/accounts/stats?platform=${platform}&username=${encodeURIComponent(cleanHandle)}`,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: "application/json",
        },
      }
    );
    if (!res.ok) return null;
    const json = await res.json();
    const count = Number(json.follower_count ?? json.followers ?? json.subscribers);
    if (Number.isFinite(count) && count >= 0) {
      return { count };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Polls a specific account and saves a new snapshot if counts have changed or periodic interval has elapsed.
 */
export async function pollAccount(
  account: FollowerAccountRecord,
  force = false
): Promise<{ success: boolean; newCount?: number; message?: string }> {
  if (!account.enabled) {
    return { success: false, message: "Account is disabled." };
  }

  if (!canAutoPollPlatform(account.platform)) {
    return {
      success: false,
      message: `${account.platform} must be updated by hand to protect your account.`,
    };
  }

  if (!force && isSnapshotRateLimited(account.last_polled_at, 3)) {
    return { success: false, message: "Rate limit: checked less than 3 minutes ago." };
  }

  let result: { count: number } | null = null;

  if (account.platform === "youtube") {
    result = await fetchYouTubeSubscribers(account.account_id || account.handle);
  } else if (account.platform === "instagram" || account.platform === "tiktok") {
    result = await fetchGatewayFollowers(account.platform, account.handle);
  }

  // Record that we attempted polling
  await query(
    `UPDATE follower_accounts SET last_polled_at = now(), updated_at = now() WHERE id = $1`,
    [account.id]
  );

  if (!result || !Number.isFinite(result.count)) {
    return {
      success: false,
      message: `No API response for ${account.platform}. Configure API key in .env or update count by hand.`,
    };
  }

  // Get previous snapshot to record daily delta
  const [prev] = await query<any>(
    `SELECT follower_count FROM follower_snapshots WHERE account_id = $1 ORDER BY captured_at DESC LIMIT 1`,
    [account.id]
  );

  const delta = prev ? result.count - Number(prev.follower_count) : 0;

  await query(
    `INSERT INTO follower_snapshots (account_id, platform, follower_count, delta_daily, source)
     VALUES ($1, $2, $3, $4, 'api')`,
    [account.id, account.platform, result.count, delta]
  );

  return { success: true, newCount: result.count };
}

/**
 * Polls all enabled auto-poll accounts.
 */
export async function pollAllEnabledAccounts(force = false) {
  const accounts = await query<FollowerAccountRecord>(
    `SELECT id, platform, handle, account_id, url, enabled, auto_poll, last_polled_at::text, created_at::text
     FROM follower_accounts
     WHERE enabled = true AND auto_poll = true`
  );

  const results = [];
  for (const acc of accounts) {
    if (canAutoPollPlatform(acc.platform)) {
      const res = await pollAccount(acc, force);
      results.push({ platform: acc.platform, ...res });
    }
  }
  return results;
}

/**
 * Loads summaries for all 4 platforms with their latest metrics, growth rates, and history.
 */
export async function loadFollowerDashboard(): Promise<PlatformSummary[]> {
  try {
    const accounts = await query<FollowerAccountRecord>(
      `SELECT id, platform, handle, account_id, url, enabled, auto_poll, last_polled_at::text, created_at::text
       FROM follower_accounts
       ORDER BY CASE platform
         WHEN 'youtube' THEN 1
         WHEN 'instagram' THEN 2
         WHEN 'tiktok' THEN 3
         WHEN 'linkedin' THEN 4
         ELSE 5
       END`
    );

    const summaries: PlatformSummary[] = [];

    for (const acc of accounts) {
      const snapshots = await query<FollowerSnapshot>(
        `SELECT id, account_id, platform, follower_count, delta_daily, source, notes, captured_at::text
         FROM follower_snapshots
         WHERE account_id = $1
         ORDER BY captured_at DESC
         LIMIT 60`,
        [acc.id]
      );

      const growth = calculateFollowerGrowth(snapshots);

      summaries.push({
        account: acc,
        growth,
        history: snapshots,
      });
    }

    return summaries;
  } catch {
    // If table doesn't exist yet before migration
    return [];
  }
}
