"use server";

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { revalidatePath } from "next/cache";
import { query } from "./db";
import {
  isVideoFilename,
  canRenameClip,
  sanitizeProposedFilename,
  estimateScanCost,
} from "./footageSafety";
import { probeVideo, extractFrame } from "./footageFfmpeg";
import { classifyClipWithAi } from "./footageAi";

const CACHE_DIR = path.resolve(process.cwd(), ".footage-cache");

/**
 * Triggers macOS native Finder dialog so the user can visually choose a folder
 * without needing to remember or manually type complex paths.
 */
export async function browseFolderAction(): Promise<{ path?: string; error?: string }> {
  try {
    if (process.platform !== "darwin") {
      return { error: "Native folder browsing is available on macOS." };
    }
    const res = spawnSync(
      "/usr/bin/osascript",
      ["-e", 'POSIX path of (choose folder with prompt "Select your raw footage folder:")'],
      { encoding: "utf8", timeout: 60_000 }
    );
    if (res.status === 0 && res.stdout) {
      const selected = res.stdout.trim().replace(/\/$/, "");
      return { path: selected };
    }
    return { error: "No folder selected." };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

export async function scanFootageFolderAction(formData: FormData) {
  const rawPath = String(formData.get("folderPath") || "").trim();
  if (!rawPath) {
    throw new Error("Please enter a local footage folder path.");
  }

  const folderPath = path.resolve(rawPath);
  if (!fs.existsSync(folderPath) || !fs.statSync(folderPath).isDirectory()) {
    throw new Error(`Directory not found: "${folderPath}". Please check the path and try again.`);
  }

  const allEntries = fs.readdirSync(folderPath);
  const videoFiles = allEntries.filter(isVideoFilename);

  if (videoFiles.length === 0) {
    throw new Error(`No supported video files (.mp4, .mov, .mkv, .webm) found in "${folderPath}".`);
  }

  const cost = estimateScanCost(videoFiles.length);

  const [scan] = await query<{ id: string }>(
    `INSERT INTO footage_scans (folder_path, clip_count, estimated_cost, real_cost)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [folderPath, videoFiles.length, cost.estimatedCost, cost.estimatedCost]
  );
  const scanId = Number(scan.id);

  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }

  for (const filename of videoFiles) {
    const fullPath = path.join(folderPath, filename);
    const meta = probeVideo(fullPath);

    const frameFilename = `frame_${scanId}_${path.basename(filename, path.extname(filename))}.jpg`;
    const framePath = path.join(CACHE_DIR, frameFilename);
    const frameTimestamp = meta.duration > 3 ? Math.min(2.0, meta.duration / 2) : 0.5;

    const frameExtracted = extractFrame(fullPath, framePath, frameTimestamp);
    const aiLabel = await classifyClipWithAi(filename, meta);

    await query(
      `INSERT INTO footage_clips (
         scan_id, folder_path, current_name, original_name, suggested_name, clip_type,
         duration_s, resolution, fps, frame_path, ai_label, ai_confidence
       )
       VALUES ($1, $2, $3, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT (folder_path, current_name) DO UPDATE SET
         scan_id = EXCLUDED.scan_id,
         suggested_name = EXCLUDED.suggested_name,
         clip_type = EXCLUDED.clip_type,
         duration_s = EXCLUDED.duration_s,
         resolution = EXCLUDED.resolution,
         fps = EXCLUDED.fps,
         frame_path = EXCLUDED.frame_path,
         ai_label = EXCLUDED.ai_label,
         ai_confidence = EXCLUDED.ai_confidence`,
      [
        scanId,
        folderPath,
        filename,
        aiLabel.suggestedName,
        aiLabel.clipType,
        meta.duration,
        meta.resolution,
        meta.fps,
        frameExtracted ? framePath : null,
        aiLabel.label,
        aiLabel.confidence,
      ]
    );
  }

  revalidatePath("/content");
}

export async function applyRenameAction(formData: FormData) {
  const clipId = Number(formData.get("clipId"));
  const newNameRaw = String(formData.get("newName") || "").trim();

  if (!Number.isInteger(clipId) || !newNameRaw) {
    throw new Error("Invalid rename request.");
  }

  const [clip] = await query<any>(
    `SELECT id, folder_path, current_name, used_in_project_id FROM footage_clips WHERE id = $1`,
    [clipId]
  );
  if (!clip) throw new Error("Clip not found.");

  const safety = canRenameClip(clip);
  if (!safety.allowed) {
    throw new Error(safety.reason);
  }

  const cleanName = sanitizeProposedFilename(newNameRaw, clip.current_name);
  if (cleanName === clip.current_name) {
    return; // No change needed
  }

  const oldPath = path.join(clip.folder_path, clip.current_name);
  const newPath = path.join(clip.folder_path, cleanName);

  if (!fs.existsSync(oldPath)) {
    throw new Error(`File does not exist on disk: ${oldPath}`);
  }
  if (fs.existsSync(newPath)) {
    throw new Error(`A file named "${cleanName}" already exists in that folder.`);
  }

  // Atomic file rename on local disk (never delete or move)
  fs.renameSync(oldPath, newPath);

  await query(
    `INSERT INTO footage_renames (clip_id, folder_path, old_name, new_name)
     VALUES ($1, $2, $3, $4)`,
    [clipId, clip.folder_path, clip.current_name, cleanName]
  );

  await query(
    `UPDATE footage_clips SET current_name = $1, renamed_at = now() WHERE id = $2`,
    [cleanName, clipId]
  );

  revalidatePath("/content");
}

export async function undoRenameAction(formData: FormData) {
  const renameId = Number(formData.get("renameId"));
  if (!Number.isInteger(renameId)) throw new Error("Invalid undo request.");

  const [r] = await query<any>(
    `SELECT id, clip_id, folder_path, old_name, new_name, undone_at
     FROM footage_renames WHERE id = $1`,
    [renameId]
  );
  if (!r) throw new Error("Rename record not found.");
  if (r.undone_at) throw new Error("This rename has already been undone.");

  const currentPath = path.join(r.folder_path, r.new_name);
  const targetPath = path.join(r.folder_path, r.old_name);

  if (!fs.existsSync(currentPath)) {
    throw new Error(`Current file not found: ${currentPath}`);
  }
  if (fs.existsSync(targetPath)) {
    throw new Error(`Cannot undo: "${r.old_name}" already exists.`);
  }

  // Reverse atomic file rename
  fs.renameSync(currentPath, targetPath);

  await query(`UPDATE footage_renames SET undone_at = now() WHERE id = $1`, [renameId]);
  await query(`UPDATE footage_clips SET current_name = $1 WHERE id = $2`, [r.old_name, r.clip_id]);

  revalidatePath("/content");
}

export async function assignClipToProjectAction(formData: FormData) {
  const clipId = Number(formData.get("clipId"));
  const rawProjectId = formData.get("projectId");
  const contentItemId = rawProjectId && Number(rawProjectId) > 0 ? Number(rawProjectId) : null;

  if (!Number.isInteger(clipId)) throw new Error("Invalid clip.");

  if (contentItemId) {
    const [item] = await query<any>(`SELECT id FROM content_items WHERE id = $1`, [contentItemId]);
    if (!item) throw new Error("Video project not found.");

    await query(
      `INSERT INTO content_projects (content_item_id, updated_at)
       VALUES ($1, now())
       ON CONFLICT (content_item_id) DO NOTHING`,
      [contentItemId]
    ).catch(() => {});
  }

  try {
    await query(
      `UPDATE footage_clips SET used_in_project_id = $1 WHERE id = $2`,
      [contentItemId, clipId]
    );
  } catch (err: any) {
    if (/footage_clips_used_in_project_id_fkey/i.test(err?.message || "")) {
      await query(`ALTER TABLE footage_clips DROP CONSTRAINT IF EXISTS footage_clips_used_in_project_id_fkey`).catch(() => {});
      await query(`ALTER TABLE footage_clips ADD CONSTRAINT footage_clips_used_in_project_id_fkey FOREIGN KEY (used_in_project_id) REFERENCES content_items(id) ON DELETE SET NULL`).catch(() => {});
      await query(
        `UPDATE footage_clips SET used_in_project_id = $1 WHERE id = $2`,
        [contentItemId, clipId]
      );
    } else {
      throw err;
    }
  }

  revalidatePath("/content");
}
