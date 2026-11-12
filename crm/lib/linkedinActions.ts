"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { query } from "./db";
import { requireLogin } from "./auth";
import { draftPost, insertPost, suggestImage } from "./linkedinPost";
import { applyReminder, closeReminder, ukNow } from "./linkedinSchedule";
import { scheduleProblem } from "./linkedinScheduleMath";
import {
  IMAGE_KINDS, IMAGE_SIZES, LINKEDIN_FORMAT, cleanPostImage, imageProblems, postProblem, starterImage,
  type ImageKind, type ImageSize,
} from "./linkedinMath";

// Everything Content > LinkedIn saves. Nothing here posts to LinkedIn or reads it: the owner copies the text and downloads the image.

type Result = { error?: string };
const MAX_IMAGES = 12;   // per post, so a post cannot collect an endless pile of tries
const message = (err: unknown) => (err instanceof Error ? err.message : String(err));
const refresh = (id?: number) => { revalidatePath("/content"); if (id) revalidatePath(`/content/linkedin/${id}`); };
const idOf = (v: unknown) => { const n = Number(v); return Number.isInteger(n) && n > 0 ? n : null; };

async function loadPost(id: number | null) {
  if (!id) return null;
  const [p] = await query<{ id: string; idea: string; script: string | null; status: string; source_ref: string | null }>(
    `SELECT id, idea, script, status, source_ref FROM content_items WHERE id = $1 AND format = $2`, [id, LINKEDIN_FORMAT]);
  return p ?? null;
}

/** Draft post (click-only): writes one post from a video idea, a topic or both, saves it and opens it. */
export async function draftLinkedInPostAction(_prev: string | null, form: FormData): Promise<string | null> {
  await requireLogin();
  let id: number;
  try {
    const fromItemId = idOf(form.get("from_id"));
    const r = await draftPost({ fromItemId, topic: String(form.get("topic") ?? ""), notes: String(form.get("notes") ?? "") });
    if (!r.ok) return r.error;
    id = await insertPost(r.draft, { niche: r.niche, pillar: r.pillar, fromItemId, source: "generated" });
  } catch (err) {
    return `The post could not be written: ${message(err)}`;
  }
  refresh();
  redirect(`/content/linkedin/${id}`);
}

/** Write it myself: an empty post with a title, opened for the owner to write. */
export async function newLinkedInPostAction(form: FormData): Promise<Result & { id?: number }> {
  await requireLogin();
  const title = String(form.get("title") ?? "").replace(/\s+/g, " ").trim();
  const problem = postProblem(title, "");
  if (problem) return { error: problem };
  const id = await insertPost({ title, opening: "", openingAlt: "", text: "" }, { source: "manual" });
  refresh();
  return { id };
}

/** Saves the owner's edit of the title and text. Their words are theirs: only length and contact details are refused. */
export async function saveLinkedInPostAction(input: { id: number; title: string; text: string }): Promise<Result> {
  await requireLogin();
  const post = await loadPost(idOf(input?.id));
  if (!post) return { error: "That post no longer exists." };
  const title = String(input.title ?? "").replace(/\s+/g, " ").trim();
  const text = String(input.text ?? "").replace(/\r\n?/g, "\n").trim();
  const problem = postProblem(title, text);
  if (problem) return { error: problem };
  await query(`UPDATE content_items SET idea = $2, script = $3 WHERE id = $1`, [post.id, title, text]);
  refresh(Number(post.id));
  return {};
}

/** Rewrite with AI (click-only, after the owner confirms): replaces the text and both opening lines, from the same video it came from or from its current text. */
export async function redraftLinkedInPostAction(input: { id: number; steer?: string }): Promise<Result> {
  await requireLogin();
  const post = await loadPost(idOf(input?.id));
  if (!post) return { error: "That post no longer exists." };
  if (post.status === "Posted") return { error: "This post is already posted, so it is kept as it went out." };
  try {
    const from = post.source_ref?.match(/^linkedin:content:(\d+)$/)?.[1];
    const steer = String(input.steer ?? "").trim().slice(0, 500);
    const r = await draftPost({
      fromItemId: from ? Number(from) : null, topic: post.idea,
      notes: [post.script?.trim() ? `The current version of the post, to improve on (keep its facts):\n${post.script.trim()}` : "", steer ? `What the owner wants changed: ${steer}` : ""].filter(Boolean).join("\n\n"),
    });
    if (!r.ok) return { error: r.error };
    await query(`UPDATE content_items SET hook = $2, hook_alt = $3, script = $4 WHERE id = $1`, [post.id, r.draft.opening || null, r.draft.openingAlt || null, r.draft.text]);
  } catch (err) {
    return { error: `The post could not be rewritten: ${message(err)}` };
  }
  refresh(Number(post.id));
  return {};
}

/** Deletes a post that has not gone out, with its images. A posted one is kept, because its numbers hang off it. */
export async function deleteLinkedInPostAction(form: FormData): Promise<Result> {
  await requireLogin();
  const post = await loadPost(idOf(form.get("id")));
  if (!post) return { error: "That post no longer exists." };
  if (post.status === "Posted") return { error: "A posted post is kept, because its numbers are recorded against it." };
  await closeReminder(Number(post.id));   // so its reminder leaves the calendar too
  await query(`DELETE FROM content_items WHERE id = $1 AND format = $2 AND status <> 'Posted'`, [post.id, LINKEDIN_FORMAT]);
  refresh();
  return {};
}

/**
 * Plans a post: a day, an optional time, and whether to be reminded. The reminder is a CRM task the calendar sync puts in Google Calendar
 * (no guests, nothing emailed). Clearing the day clears the time and the reminder. The app still never posts.
 */
export async function schedulePostAction(input: { id: number; date: string; time: string; remind: boolean }): Promise<Result> {
  await requireLogin();
  const post = await loadPost(idOf(input?.id));
  if (!post) return { error: "That post no longer exists." };
  if (post.status === "Posted") return { error: "This post has already gone out." };
  const date = String(input.date ?? "").trim() || null, time = String(input.time ?? "").trim() || null;
  const problem = scheduleProblem(date, time, ukNow().today);
  if (problem) return { error: problem };
  await query(`UPDATE content_items SET scheduled_for = $2, scheduled_time = $3 WHERE id = $1`, [post.id, date, date ? time : null]);
  await applyReminder(Number(post.id), input.remind === true);
  refresh(Number(post.id));
  revalidatePath("/content/calendar");
  revalidatePath("/tasks");
  return {};
}

const kindOf = (v: unknown) => (IMAGE_KINDS.some((k) => k.code === v) ? (v as ImageKind) : null);
const sizeOf = (v: unknown) => (IMAGE_SIZES.some((s) => s.code === v) ? (v as ImageSize) : "4:5");

async function roomForImage(postId: string): Promise<string | null> {
  const [{ n }] = await query<{ n: string }>(`SELECT count(*) AS n FROM post_images WHERE content_item_id = $1`, [postId]);
  return Number(n) >= MAX_IMAGES ? `A post keeps ${MAX_IMAGES} images at most. Delete one you are not using first.` : null;
}

/** Adds one image to a post. With `ai` the wording is suggested from the post (click-only, Haiku; kind "auto" lets it choose); without, a starter is built in code to edit. The first image of a post becomes the chosen one. */
export async function addPostImageAction(input: { postId: number; kind: string; size: string; ai: boolean }): Promise<Result & { imageId?: number }> {
  await requireLogin();
  const post = await loadPost(idOf(input?.postId));
  if (!post) return { error: "That post no longer exists." };
  const full = await roomForImage(post.id);
  if (full) return { error: full };
  const size = sizeOf(input.size), kind = kindOf(input.kind);
  let design;
  try {
    if (input.ai) {
      const r = await suggestImage(post.script ?? "", kind ?? "auto", size);
      if (!r.ok) return { error: r.error };
      design = r.design;
    } else {
      if (!kind) return { error: "Choose the kind of image." };
      design = { ...starterImage(kind, post.script ?? "", post.idea), size };
    }
  } catch (err) {
    return { error: `The image could not be suggested: ${message(err)}` };
  }
  const [row] = await query<{ id: string }>(
    `INSERT INTO post_images (content_item_id, kind, design, selected)
     VALUES ($1, $2, $3::jsonb, NOT EXISTS (SELECT 1 FROM post_images WHERE content_item_id = $1 AND selected)) RETURNING id`,
    [post.id, design.kind, JSON.stringify(design)]);
  refresh(Number(post.id));
  return { imageId: Number(row.id) };
}

/** Saves the owner's edit of an image. The design is clamped, and the image rule is enforced: no figures that read as claims, no guarantees, no contact details. */
export async function savePostImageAction(input: { imageId: number; design: unknown }): Promise<Result> {
  await requireLogin();
  const imageId = idOf(input?.imageId);
  const [img] = imageId ? await query<{ content_item_id: string; kind: string }>(`SELECT content_item_id, kind FROM post_images WHERE id = $1`, [imageId]) : [];
  if (!img) return { error: "That image no longer exists." };
  const design = cleanPostImage({ ...(input.design && typeof input.design === "object" ? input.design : {}), kind: img.kind });
  const problems = imageProblems(design);
  if (problems.length) return { error: problems.join(" ") };
  await query(`UPDATE post_images SET design = $2::jsonb WHERE id = $1`, [imageId, JSON.stringify(design)]);
  refresh(Number(img.content_item_id));
  return {};
}

/** Marks one image as the one that goes with the post. */
export async function selectPostImageAction(form: FormData): Promise<Result | void> {
  await requireLogin();
  const imageId = idOf(form.get("imageId"));
  const [img] = imageId ? await query<{ content_item_id: string }>(`SELECT content_item_id FROM post_images WHERE id = $1`, [imageId]) : [];
  if (!img) return { error: "That image no longer exists." };
  // Clear first, then set: the "one chosen image per post" index is checked row by row, so it must never see two at once.
  await query(`UPDATE post_images SET selected = false WHERE content_item_id = $1 AND selected AND id <> $2`, [img.content_item_id, imageId]);
  await query(`UPDATE post_images SET selected = true WHERE id = $1`, [imageId]);
  refresh(Number(img.content_item_id));
}

export async function deletePostImageAction(form: FormData): Promise<Result | void> {
  await requireLogin();
  const imageId = idOf(form.get("imageId"));
  if (!imageId) return { error: "That image no longer exists." };
  const rows = await query<{ content_item_id: string }>(`DELETE FROM post_images WHERE id = $1 RETURNING content_item_id`, [imageId]);
  if (rows[0]) refresh(Number(rows[0].content_item_id));
}
