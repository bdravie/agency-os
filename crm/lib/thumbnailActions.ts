"use server";

import { revalidatePath } from "next/cache";
import { query } from "./db";
import { requireLogin } from "./auth";
import { assess, generateThumbnailConcepts } from "./thumbnailAi";
import type { ThumbnailFormat } from "./thumbnailMath";
import { MAX_ASSETS, MAX_ASSET_BYTES, cleanDesign, coverTextProblem, sniffImage } from "./thumbnailDesign";

const isFormat = (f: string): f is ThumbnailFormat => f === "16:9" || f === "9:16";

export async function generateThumbnailsAction(formData: FormData) {
  await requireLogin();
  const rawId = formData.get("contentItemId");
  let contentItemId = rawId ? Number(rawId) : 0;
  const asked = String(formData.get("format") || "16:9").trim();
  const format: ThumbnailFormat = isFormat(asked) ? asked : "16:9";
  const rawClipId = formData.get("clipId");
  const clipId = rawClipId && Number(rawClipId) > 0 ? Number(rawClipId) : null;

  if (!contentItemId || !Number.isInteger(contentItemId)) {
    const [latest] = await query<any>(`SELECT id FROM content_items WHERE status NOT IN ('Archived') ORDER BY id DESC LIMIT 1`);
    if (latest?.id) contentItemId = Number(latest.id);
    else throw new Error("Please choose a video project.");
  }

  const [item] = await query<any>(`SELECT id, idea, hook, pillar, niche FROM content_items WHERE id = $1`, [contentItemId]);
  if (!item) throw new Error("Video item not found.");

  let frameUrl: string | null = null;
  if (clipId) {
    const [clip] = await query<any>(`SELECT frame_path FROM footage_clips WHERE id = $1`, [clipId]);
    if (clip?.frame_path) frameUrl = `/api/footage/${clipId}/frame`;
  }

  const concepts = await generateThumbnailConcepts(item.idea, item.hook, item.pillar, item.niche, format);
  for (const c of concepts) {
    await query(
      `INSERT INTO content_thumbnails (content_item_id, clip_id, format, headline, subhead, frame_url, contrast_ratio, performance_score, platform_risk, risk_reasons, design)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::text[], $11::jsonb)`,
      [contentItemId, clipId, format, c.headline, c.subhead || null, frameUrl, c.contrastRatio, c.performanceScore, c.platformRisk, c.riskReasons, JSON.stringify(c.design)]);
  }
  revalidatePath("/content");
}

/**
 * Saves the owner's edit of one cover: the words and the design (layout, title style, stickers, logos).
 * The words are the owner's own, so only the positioning rule is enforced (no figures that read as claims, no contact details);
 * the design is clamped by cleanDesign, and a logo that is no longer in the library is dropped.
 */
export async function saveThumbnailDesignAction(input: { id: number; headline: string; subhead: string; design: unknown }): Promise<{ error?: string }> {
  await requireLogin();
  const id = Number(input?.id);
  if (!Number.isInteger(id)) return { error: "That cover no longer exists." };
  const headline = String(input.headline ?? "").replace(/\s+/g, " ").trim().toUpperCase();
  const subhead = String(input.subhead ?? "").replace(/\s+/g, " ").trim();
  if (!headline) return { error: "Give the cover a title." };
  if (headline.length > 60) return { error: "The title is too long for a cover (60 characters at most; 2 to 4 words reads best)." };
  if (subhead.length > 60) return { error: "The supporting line is too long (60 characters at most)." };
  const problem = coverTextProblem(headline) ?? coverTextProblem(subhead);
  if (problem) return { error: problem };

  const [t] = await query<{ format: string }>(`SELECT format FROM content_thumbnails WHERE id = $1`, [id]);
  if (!t) return { error: "That cover no longer exists." };
  const design = cleanDesign(input.design, headline);
  if (design.logos.length) {
    const have = new Set((await query<{ id: string }>(`SELECT id FROM thumbnail_assets WHERE id = ANY($1::bigint[])`, [design.logos.map((l) => l.asset)])).map((r) => Number(r.id)));
    design.logos = design.logos.filter((l) => have.has(l.asset));
  }
  const a = assess(headline, subhead || null, design, t.format as ThumbnailFormat);
  await query(
    `UPDATE content_thumbnails SET headline = $2, subhead = $3, design = $4::jsonb, contrast_ratio = $5, performance_score = $6, platform_risk = $7, risk_reasons = $8::text[] WHERE id = $1`,
    [id, headline, subhead || null, JSON.stringify(design), a.contrastRatio, a.performanceScore, a.platformRisk, a.riskReasons]);
  revalidatePath("/content");
  return {};
}

/** Adds one logo to the cover library. Images only (PNG, JPEG or WebP, told by the file's own bytes), up to 1 MB each and 30 in all. */
export async function uploadThumbnailAssetAction(form: FormData): Promise<{ error?: string } | void> {
  await requireLogin();
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose an image file." };
  if (file.size > MAX_ASSET_BYTES) return { error: "That image is over 1 MB. Export a smaller version (a logo rarely needs more than 600 pixels across)." };
  const bytes = new Uint8Array(await file.arrayBuffer());
  const mime = sniffImage(bytes);
  if (!mime) return { error: "Only PNG, JPEG or WebP images can be added (an SVG needs exporting as a PNG first)." };
  const name = (String(form.get("name") ?? "").trim() || file.name.replace(/\.[a-z0-9]+$/i, "")).replace(/[^\p{L}\p{N} ._&+-]/gu, "").trim().slice(0, 40);
  if (!name) return { error: "Give the logo a name." };
  if (coverTextProblem(name)) return { error: "A logo's name can't hold a link, email or phone number." };
  const [{ n }] = await query<{ n: string }>(`SELECT count(*) AS n FROM thumbnail_assets`);
  if (Number(n) >= MAX_ASSETS) return { error: `The library holds ${MAX_ASSETS} logos at most. Remove one you no longer use first.` };
  await query(`INSERT INTO thumbnail_assets (name, mime, data, bytes) VALUES ($1, $2, $3, $4)`, [name, mime, Buffer.from(bytes), bytes.length]);
  revalidatePath("/content");
}

/** Removes a logo from the library. Covers that used it simply draw without it. */
export async function deleteThumbnailAssetAction(form: FormData) {
  await requireLogin();
  const id = Number(form.get("assetId"));
  if (!Number.isInteger(id)) return { error: "That logo no longer exists." };
  await query(`DELETE FROM thumbnail_assets WHERE id = $1`, [id]);
  revalidatePath("/content");
}

export async function selectThumbnailAction(formData: FormData) {
  await requireLogin();
  const thumbnailId = Number(formData.get("thumbnailId"));
  if (!Number.isInteger(thumbnailId)) throw new Error("Invalid thumbnail.");
  const [t] = await query<any>(`SELECT id, content_item_id, format FROM content_thumbnails WHERE id = $1`, [thumbnailId]);
  if (!t) throw new Error("Thumbnail not found.");
  // One active cover per project and format.
  await query(`UPDATE content_thumbnails SET selected = false WHERE content_item_id = $1 AND format = $2`, [t.content_item_id, t.format]);
  await query(`UPDATE content_thumbnails SET selected = true WHERE id = $1`, [thumbnailId]);
  revalidatePath("/content");
}

export async function deleteThumbnailAction(formData: FormData) {
  await requireLogin();
  const thumbnailId = Number(formData.get("thumbnailId"));
  if (!Number.isInteger(thumbnailId)) throw new Error("Invalid thumbnail.");
  await query(`DELETE FROM content_thumbnails WHERE id = $1`, [thumbnailId]);
  revalidatePath("/content");
}
