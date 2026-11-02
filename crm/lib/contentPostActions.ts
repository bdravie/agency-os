"use server";

import { revalidatePath } from "next/cache";
import { query, tx } from "./db";
import { logActivity } from "./activity";
import { requireLogin } from "./auth";
import { loadContentConfig } from "./content";
import { BUCKETS, PLATFORM_LABEL, cleanMetrics, cleanPostEntries, cleanPostUrl, type Platform } from "./contentMath";

type Result = { ok: true; message: string } | { ok: false; error: string };
const fail = (error: string): Result => ({ ok: false, error });
const DUPLICATE = "That link is already saved on another post.";
const isDuplicate = (err: unknown) => (err as { code?: string })?.code === "23505";

function refresh(id?: number) {
  revalidatePath("/content");
  if (id) revalidatePath(`/content/${id}`);
}

/**
 * Mark a video as posted: saves one post per ticked platform (with its link and the hook that was used) and moves the card to Posted,
 * all or nothing. Nothing is posted anywhere by the app: you post by hand, then record it here.
 */
export async function markPosted(contentId: number, entries: { platform: string; url: string; hook?: string }[], hook: string, postedAt: string | null): Promise<Result> {
  await requireLogin();
  const config = await loadContentConfig();
  const clean = cleanPostEntries(entries.map((e) => ({ platform: e.platform, url: e.url })), config.platforms);
  if ("error" in clean) return fail(clean.error);
  const hookBy = Object.fromEntries(entries.map((e) => [e.platform, (e.hook ?? "").trim()]));
  const when = postedAt ? new Date(postedAt) : new Date();
  if (Number.isNaN(when.getTime()) || when.getTime() > Date.now() + 5 * 60_000) return fail("The posting time cannot be in the future.");
  try {
    await tx(async (c) => {
      const found = await c.query(`SELECT status FROM content_items WHERE id = $1 FOR UPDATE`, [contentId]);
      if (!found.rows[0]) throw new Error("That idea no longer exists.");
      for (const e of clean.entries) {
        await c.query(`INSERT INTO posts (content_item_id, platform, url, hook_used, posted_at) VALUES ($1,$2,$3,$4,$5)`, [contentId, e.platform, e.url, (hookBy[e.platform] || hook).trim().slice(0, 300) || null, when]);
      }
      await c.query(`UPDATE content_items SET status = 'Posted', posted_at = COALESCE(posted_at, $2) WHERE id = $1`, [contentId, when]);
    });
  } catch (err) {
    return fail(isDuplicate(err) ? DUPLICATE : err instanceof Error ? err.message : "Could not save.");
  }
  await logActivity("content_posted", { channel: clean.entries.map((e) => e.platform).join(","), body: `Posted to ${clean.entries.map((e) => PLATFORM_LABEL[e.platform]).join(" and ")}`, meta: { content_item_id: contentId } });
  refresh(contentId);
  return { ok: true, message: `Marked as posted on ${clean.entries.map((e) => PLATFORM_LABEL[e.platform]).join(" and ")}` };
}

/** Add another platform (or a link you skipped) to a video that is already posted. */
export async function addPost(contentId: number, platform: string, url: string, hook: string): Promise<Result> {
  await requireLogin();
  const config = await loadContentConfig();
  if (!config.platforms.includes(platform)) return fail(`${PLATFORM_LABEL[platform as Platform] ?? platform} is not one of your platforms.`);
  const clean = cleanPostUrl(platform, url);
  if ("error" in clean) return fail(clean.error);
  try {
    const rows = await query<{ id: number }>(
      `INSERT INTO posts (content_item_id, platform, url, hook_used, posted_at)
       SELECT id, $2, $3, $4, COALESCE(posted_at, now()) FROM content_items WHERE id = $1 RETURNING id`,
      [contentId, platform, clean.url, hook.trim().slice(0, 300) || null]);
    if (!rows.length) return fail("That idea no longer exists.");
  } catch (err) {
    return fail(isDuplicate(err) ? DUPLICATE : "Could not save.");
  }
  await logActivity("content_posted", { channel: platform, body: `Added ${PLATFORM_LABEL[platform as Platform]} link`, meta: { content_item_id: contentId } });
  refresh(contentId);
  return { ok: true, message: `${PLATFORM_LABEL[platform as Platform]} link saved` };
}

/** Save the numbers for one checkpoint (24 hours, 72 hours or 7 days). Entering the same checkpoint again replaces it. */
export async function saveMetrics(postId: number, bucket: number, raw: Record<string, string>): Promise<Result> {
  await requireLogin();
  if (!(BUCKETS as readonly number[]).includes(bucket)) return fail("Choose 24 hours, 72 hours or 7 days.");
  const clean = cleanMetrics(raw);
  if ("error" in clean) return fail(clean.error);
  const m = clean.metrics;
  const rows = await query<{ content_item_id: number }>(
    `INSERT INTO post_metrics (post_id, bucket, captured_at, age_hours, views, likes, comments, shares, saves, follows, avg_watch_s, source)
     SELECT p.id, $2, now(), round((extract(epoch FROM now() - p.posted_at) / 3600)::numeric, 1), $3,$4,$5,$6,$7,$8,$9, 'manual' FROM posts p WHERE p.id = $1
     ON CONFLICT (post_id, bucket) DO UPDATE SET captured_at = now(), age_hours = EXCLUDED.age_hours, views = EXCLUDED.views, likes = EXCLUDED.likes,
       comments = EXCLUDED.comments, shares = EXCLUDED.shares, saves = EXCLUDED.saves, follows = EXCLUDED.follows, avg_watch_s = EXCLUDED.avg_watch_s, source = 'manual'
     RETURNING (SELECT content_item_id FROM posts WHERE id = $1) AS content_item_id`,
    [postId, bucket, m.views, m.likes, m.comments, m.shares, m.saves, m.follows, m.avg_watch_s]);
  if (!rows.length) return fail("That post no longer exists.");
  await logActivity("content_metrics", { body: `Numbers saved at ${bucket === 168 ? "7 days" : bucket + " hours"}`, meta: { content_item_id: rows[0].content_item_id, post_id: postId } });
  refresh(Number(rows[0].content_item_id));
  return { ok: true, message: "Numbers saved" };
}

/** Remove a post link added by mistake, with its numbers. The video stays marked as posted. */
export async function removePost(postId: number): Promise<Result> {
  await requireLogin();
  const rows = await query<{ content_item_id: number }>(`DELETE FROM posts WHERE id = $1 RETURNING content_item_id`, [postId]);
  if (!rows.length) return fail("That post no longer exists.");
  refresh(Number(rows[0].content_item_id));
  return { ok: true, message: "Post link removed" };
}
