"use server";

import { revalidatePath } from "next/cache";
import { query } from "./db";
import { logActivity } from "./activity";
import { requireLogin } from "./auth";
import { checkCreator, loadCreatorSettings, type CheckResult } from "./creatorScrape";
import { cleanHandle } from "./creatorMath";

type Result = { ok: true } | { ok: false; error: string };
const PLATFORMS = ["tiktok", "instagram", "youtube", "linkedin"];
const refresh = () => { revalidatePath("/content/creators"); revalidatePath("/content/outliers"); };

/** Add a creator to follow, by handle or profile link. Public professional accounts only: you are researching how they find clients. */
export async function addCreator(platform: string, handle: string, niche: string, why: string): Promise<Result> {
  await requireLogin();
  if (!PLATFORMS.includes(platform)) return { ok: false, error: "Choose a platform." };
  const h = cleanHandle(platform, handle);
  if ("error" in h) return { ok: false, error: h.error };
  const s = await loadCreatorSettings();
  const [{ n }] = await query<{ n: string }>(`SELECT count(*) AS n FROM creators WHERE active`);
  if (Number(n) >= s.maxActive) return { ok: false, error: `You are following ${n} creators, the limit in config/creators.yaml. Pause one first.` };
  const rows = await query(
    `INSERT INTO creators (platform, handle, profile_url, niche, why_i_follow) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (platform, handle) DO NOTHING RETURNING id`,
    [platform, h.handle, h.profileUrl, niche.trim().slice(0, 60) || null, why.trim().slice(0, 300) || null]);
  if (!rows.length) return { ok: false, error: "You already follow that creator." };
  await logActivity("creator_added", { channel: platform, body: `Following ${h.handle}` });
  refresh();
  return { ok: true };
}

export async function updateCreator(id: number, patch: { niche?: string; why?: string; active?: boolean }): Promise<Result> {
  await requireLogin();
  const rows = await query(
    `UPDATE creators SET niche = COALESCE($2, niche), why_i_follow = COALESCE($3, why_i_follow), active = COALESCE($4, active) WHERE id = $1 RETURNING id`,
    [id, patch.niche === undefined ? null : patch.niche.trim().slice(0, 60), patch.why === undefined ? null : patch.why.trim().slice(0, 300), patch.active ?? null]);
  if (!rows.length) return { ok: false, error: "That creator no longer exists." };
  refresh();
  return { ok: true };
}

/** Stop following a creator and delete everything saved about them (their posts go with them). The page asks for confirmation first. */
export async function removeCreator(id: number): Promise<Result> {
  await requireLogin();
  const rows = await query(`DELETE FROM creators WHERE id = $1 RETURNING id`, [id]);
  if (!rows.length) return { ok: false, error: "That creator no longer exists." };
  refresh();
  return { ok: true };
}

/** Click-only. Spends Apify credits (the cost is shown on the button first). */
export async function checkCreatorAction(id: number): Promise<CheckResult> {
  await requireLogin();
  const r = await checkCreator(id);
  if (r.ok) await logActivity("creator_checked", { body: `${r.found} posts read, ${r.outliers} outliers, cost $${r.costUsd.toFixed(3)}` });
  refresh();
  return r;
}

export async function reviewOutlier(postId: number, review: "new" | "saved" | "dismissed"): Promise<Result> {
  await requireLogin();
  if (!["new", "saved", "dismissed"].includes(review)) return { ok: false, error: "Unknown choice." };
  const rows = await query(`UPDATE creator_posts SET review = $2, reviewed_at = now() WHERE id = $1 RETURNING id`, [postId, review]);
  if (!rows.length) return { ok: false, error: "That post no longer exists." };
  refresh();
  return { ok: true };
}
