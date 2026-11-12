"use server";

import { revalidatePath } from "next/cache";
import { query } from "./db";
import {
  canAutoPollPlatform,
  type FollowerPlatform,
} from "./followerMath";
import {
  pollAccount,
  pollAllEnabledAccounts,
  type FollowerAccountRecord,
} from "./followerTracking";

/**
 * Records a manual follower snapshot.
 * Essential for LinkedIn (which must never be automated) and manual overrides.
 */
export async function recordManualFollowersAction(formData: FormData) {
  const rawAccountId = formData.get("accountId");
  const platform = String(formData.get("platform") || "").toLowerCase() as FollowerPlatform;
  const count = Number(formData.get("count"));
  const notes = String(formData.get("notes") || "").trim() || null;

  if (!Number.isFinite(count) || count < 0) {
    throw new Error("Please enter a valid follower count (0 or higher).");
  }

  let accountId: number;

  if (rawAccountId && Number(rawAccountId) > 0) {
    accountId = Number(rawAccountId);
  } else {
    // Find or create account record
    const [acc] = await query<any>(
      `SELECT id FROM follower_accounts WHERE platform = $1 LIMIT 1`,
      [platform]
    );
    if (acc) {
      accountId = acc.id;
    } else {
      const [newAcc] = await query<any>(
        `INSERT INTO follower_accounts (platform, handle, auto_poll)
         VALUES ($1, $2, $3)
         RETURNING id`,
        [platform, `@${platform}`, platform !== "linkedin"]
      );
      accountId = newAcc.id;
    }
  }

  // Previous count for delta
  const [prev] = await query<any>(
    `SELECT follower_count FROM follower_snapshots WHERE account_id = $1 ORDER BY captured_at DESC LIMIT 1`,
    [accountId]
  );
  const delta = prev ? count - Number(prev.follower_count) : 0;

  await query(
    `INSERT INTO follower_snapshots (account_id, platform, follower_count, delta_daily, source, notes)
     VALUES ($1, $2, $3, $4, 'manual', $5)`,
    [accountId, platform, Math.round(count), delta, notes]
  );

  revalidatePath("/content");
  revalidatePath("/");
}

/**
 * Triggers an immediate API poll for an account or all enabled platforms.
 */
export async function pollFollowersAction(formData: FormData) {
  const rawAccountId = formData.get("accountId");

  if (rawAccountId && Number(rawAccountId) > 0) {
    const [account] = await query<FollowerAccountRecord>(
      `SELECT id, platform, handle, account_id, url, enabled, auto_poll, last_polled_at::text, created_at::text
       FROM follower_accounts WHERE id = $1`,
      [Number(rawAccountId)]
    );
    if (!account) throw new Error("Account not found.");
    if (!canAutoPollPlatform(account.platform)) {
      throw new Error(`${account.platform} cannot be polled automatically to protect your account.`);
    }

    const res = await pollAccount(account, true);
    if (!res.success) {
      throw new Error(res.message || "Failed to poll follower count.");
    }
  } else {
    await pollAllEnabledAccounts(true);
  }

  revalidatePath("/content");
  revalidatePath("/");
}

/**
 * Updates account handle, external profile URL, or auto-polling setting.
 */
export async function updateFollowerAccountAction(formData: FormData) {
  const accountId = Number(formData.get("accountId"));
  const handle = String(formData.get("handle") || "").trim();
  const url = String(formData.get("url") || "").trim() || null;
  const platform = String(formData.get("platform") || "").toLowerCase();
  const autoPoll = formData.get("autoPoll") === "true";

  if (!accountId || !handle) {
    throw new Error("Account ID and handle are required.");
  }

  // Guard: LinkedIn can NEVER be set to auto-poll
  const safeAutoPoll = platform === "linkedin" ? false : autoPoll;

  await query(
    `UPDATE follower_accounts
     SET handle = $2, url = $3, auto_poll = $4, updated_at = now()
     WHERE id = $1`,
    [accountId, handle, url, safeAutoPoll]
  );

  revalidatePath("/content");
  revalidatePath("/");
}
