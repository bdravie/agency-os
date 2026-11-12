"use server";

import { revalidatePath } from "next/cache";
import { query } from "./db";
import { requireLogin } from "./auth";
import { cleanHandle } from "./creatorMath";
import { cleanSwipe, type SwipeInput } from "./linkedinSwipeMath";
import { ukNow } from "./linkedinSchedule";
import { draftPost, insertPost } from "./linkedinPost";
import type { Breakdown } from "./breakdownMath";

// The LinkedIn swipe file: public posts the owner saw and pasted by hand, kept on a LinkedIn creator (reference only, never checked automatically).
// Stored like any creator post, so the existing Break down step works on them. Never stored: comments, commenters, tagged people, anything fetched.

type Result = { error?: string };
const refresh = () => { revalidatePath("/content"); revalidatePath("/content/creators"); };

/** Saves one pasted LinkedIn post to the swipe file, under the creator it came from (added as a LinkedIn creator if new). */
export async function addSwipeAction(input: SwipeInput & { creator: string; why: string }): Promise<Result> {
  await requireLogin();
  const who = cleanHandle("linkedin", String(input?.creator ?? ""));
  if ("error" in who) return { error: `Creator: ${who.error} Paste their profile link (linkedin.com/in/…).` };
  const s = cleanSwipe({ url: String(input.url ?? ""), text: String(input.text ?? ""), type: String(input.type ?? ""), reactions: String(input.reactions ?? ""), comments: String(input.comments ?? ""), reposts: String(input.reposts ?? ""), postedOn: String(input.postedOn ?? "") }, ukNow().today);
  if ("error" in s) return s;
  const why = String(input.why ?? "").replace(/\s+/g, " ").trim().slice(0, 200) || null;
  const [creator] = await query<{ id: string }>(
    `INSERT INTO creators (platform, handle, profile_url, why_i_follow) VALUES ('linkedin', $1, $2, $3)
     ON CONFLICT (platform, handle) DO UPDATE SET why_i_follow = COALESCE(creators.why_i_follow, EXCLUDED.why_i_follow) RETURNING id`,
    [who.handle, who.profileUrl, why]);
  const rows = await query<{ id: string }>(
    `INSERT INTO creator_posts (creator_id, platform, external_id, url, caption, posted_at, likes, comments, shares, post_type, review, reviewed_at)
     VALUES ($1, 'linkedin', $2, $3, $4, $5::date, $6, $7, $8, $9, 'saved', now())
     ON CONFLICT (external_id) DO NOTHING RETURNING id`,
    [creator.id, s.externalId, s.url, s.text, s.postedOn, s.reactions, s.comments, s.reposts, s.type]);
  if (!rows.length) return { error: "That post is already in your swipe file." };
  refresh();
  return {};
}

/** Takes a post out of the swipe file. The creator stays on the Creators page. */
export async function deleteSwipeAction(form: FormData): Promise<Result> {
  await requireLogin();
  const id = Number(form.get("id"));
  if (!Number.isInteger(id)) return { error: "That post is no longer there." };
  await query(`DELETE FROM creator_posts WHERE id = $1 AND platform = 'linkedin'`, [id]);
  refresh();
  return {};
}

/**
 * Write my version (click-only): one of the three ideas from a swipe breakdown becomes a LinkedIn post, written by the usual drafting step and checked the same way.
 * The AI is given the idea and the structure only, never the original wording. Returns the new post's id.
 */
export async function writeFromSwipeAction(postId: number, index: number): Promise<{ id?: number; error?: string }> {
  await requireLogin();
  const [p] = await query<{ url: string | null; breakdown: Breakdown | null }>(`SELECT url, breakdown FROM creator_posts WHERE id = $1 AND platform = 'linkedin'`, [postId]);
  const idea = p?.breakdown?.ideas?.[index];
  if (!p || !idea) return { error: "That idea is no longer there. Break the post down again." };
  if (idea.content_id) return { id: idea.content_id };
  try {
    const b = p.breakdown!;
    const r = await draftPost({
      topic: idea.idea,
      notes: `Start from this opening line idea (reword it if it reads better): ${idea.hook}\n\nBorrow this structure, in this order (it comes from a post that did well; never its wording): ${b.beats.join(" > ")}\nFormat: ${b.format}`,
    });
    if (!r.ok) return { error: r.error };
    const id = await insertPost(r.draft, { niche: idea.niche, pillar: idea.pillar, hookType: idea.hook_type, source: "outlier", sourceRef: p.url });
    idea.content_id = id;
    await query(`UPDATE creator_posts SET breakdown = $2 WHERE id = $1`, [postId, JSON.stringify(b)]);
    refresh();
    return { id };
  } catch (err) {
    return { error: `The post could not be written: ${err instanceof Error ? err.message : String(err)}` };
  }
}
