"use server";

import { revalidatePath } from "next/cache";
import { query } from "./db";
import { logActivity } from "./activity";
import { requireLogin } from "./auth";
import { breakDown } from "./outlierBreakdown";
import type { Breakdown } from "./breakdownMath";

type Done = { ok: true; breakdown: Breakdown } | { ok: false; error: string };

const cap = () => { const n = Number(process.env.BREAKDOWN_DAILY_CAP); return Number.isInteger(n) && n > 0 ? n : 20; };

/** Click-only. Breaks down one outlier (optionally with a transcript you paste) and saves the result on the post. Costs a few pence. */
export async function breakDownOutlier(postId: number, transcript: string): Promise<Done> {
  await requireLogin();
  const [post] = await query<any>(
    `SELECT p.id, p.platform, p.caption, p.views, p.likes, p.comments, p.saves, p.shares, p.outlier_score::float8 AS score, p.duration_s, p.sound, p.post_type, p.hashtags, p.cta_keyword,
            c.handle, c.display_name, c.why_i_follow, c.niche FROM creator_posts p JOIN creators c ON c.id = p.creator_id WHERE p.id = $1`, [postId]);
  if (!post) return { ok: false, error: "That post no longer exists." };
  const [{ n }] = await query<{ n: string }>(`SELECT count(*) AS n FROM activities WHERE type = 'outlier_breakdown' AND occurred_at > now() - interval '24 hours'`);
  if (Number(n) >= cap()) return { ok: false, error: `You have run ${n} breakdowns in the last 24 hours, the daily limit (BREAKDOWN_DAILY_CAP). Try again tomorrow.` };
  if (transcript.length > 20000) return { ok: false, error: "That transcript is too long. Paste the first few minutes." };
  try {
    const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
    const r = await breakDown({
      platform: post.platform, caption: post.caption, views: num(post.views), likes: num(post.likes), comments: num(post.comments), saves: num(post.saves), shares: num(post.shares), score: post.score,
      durationS: post.duration_s, sound: post.sound, postType: post.post_type, hashtags: post.hashtags ?? [], ctaKeyword: post.cta_keyword,
      creatorHandle: post.handle, creatorName: post.display_name, whyIFollow: post.why_i_follow, creatorNiche: post.niche,
    }, transcript.trim() || null);
    if (!r.breakdown) return { ok: false, error: `The AI's answer did not pass the checks, so nothing was saved: ${r.problems.join("; ")}. Try again.` };
    await query(`UPDATE creator_posts SET breakdown = $2 WHERE id = $1`, [postId, JSON.stringify(r.breakdown)]);
    await logActivity("outlier_breakdown", { channel: post.platform, body: `Broke down a post by @${post.handle}`, meta: { creator_post_id: postId } });
    revalidatePath("/content/outliers");
    if (post.platform === "linkedin") revalidatePath("/content");
    return { ok: true, breakdown: r.breakdown };
  } catch (err) {
    return { ok: false, error: `Something went wrong: ${err instanceof Error ? err.message : String(err)}` };
  }
}

/**
 * Put one of the three adapted ideas on the Content board as a new Idea, with a link back to the original post and its pillar, hook type and niche filled in.
 * An idea is only added once: adding it again returns the one already on the board.
 */
export async function addOutlierIdea(postId: number, index: number): Promise<{ ok: true; contentId: number } | { ok: false; error: string }> {
  await requireLogin();
  const [post] = await query<{ url: string | null; breakdown: Breakdown | null }>(`SELECT url, breakdown FROM creator_posts WHERE id = $1`, [postId]);
  const idea = post?.breakdown?.ideas?.[index];
  if (!post || !idea) return { ok: false, error: "That idea is no longer there. Break the post down again." };
  if (idea.content_id) return { ok: true, contentId: idea.content_id };
  const rows = await query<{ id: string }>(
    `INSERT INTO content_items (idea, hook, format, status, pillar, hook_type, niche, source, source_ref) VALUES ($1,$2,$3,'Idea',$4,$5,$6,'outlier',$7) RETURNING id`,
    [idea.idea, idea.hook, idea.pillar, idea.pillar, idea.hook_type, idea.niche, post.url]);
  const id = Number(rows[0].id);
  idea.content_id = id;
  await query(`UPDATE creator_posts SET breakdown = $2 WHERE id = $1`, [postId, JSON.stringify(post.breakdown)]);
  await logActivity("content_idea_added", { body: idea.idea, meta: { content_item_id: id, source: "outlier" } });
  revalidatePath("/content"); revalidatePath("/content/outliers");
  return { ok: true, contentId: id };
}
