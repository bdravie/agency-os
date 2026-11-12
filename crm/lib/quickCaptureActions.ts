"use server";

import { revalidatePath } from "next/cache";
import { query } from "./db";
import { checkNoteSafety, DEFAULT_CHECKLIST, statusFromChecklist, type ProjectChecklistItem } from "./quickCaptureMath";
import { categoriseQuickCapture } from "./quickCaptureCategorise";
import { listContentCategories } from "./contentCategories";

export async function saveQuickCaptureAction(formData: FormData) {
  const rawNote = String(formData.get("note") || "").trim();
  const safety = checkNoteSafety(rawNote);
  if (!safety.ok) {
    throw new Error(safety.error);
  }

  const categories = await listContentCategories(false);
  const categorised = await categoriseQuickCapture(rawNote, categories);

  const [item] = await query<{ id: string }>(
    `INSERT INTO content_items (
       idea, hook, format, status, pillar, hook_type, niche, source, source_ref, notes, platforms
     )
     VALUES ($1, $2, 'Short video', 'Idea', $3, $4, $5, 'quick_capture', 'note', $6, '{"instagram","tiktok","youtube"}')
     RETURNING id`,
    [
      categorised.title,
      categorised.suggestedHook || null,
      categorised.pillar,
      categorised.hookType,
      categorised.niche === "untagged" ? null : categorised.niche,
      rawNote,
    ]
  );

  const itemId = Number(item.id);

  await query(
    `INSERT INTO content_projects (
       content_item_id, raw_notes, summary, talking_points, checklist
     )
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (content_item_id) DO UPDATE
       SET raw_notes = EXCLUDED.raw_notes,
           summary = EXCLUDED.summary,
           talking_points = EXCLUDED.talking_points,
           updated_at = now()`,
    [
      itemId,
      rawNote,
      categorised.summary,
      categorised.talkingPoints,
      JSON.stringify(DEFAULT_CHECKLIST),
    ]
  );

  revalidatePath("/content");
}

export async function toggleProjectChecklistStepAction(formData: FormData) {
  const contentItemId = Number(formData.get("contentItemId"));
  const stepKey = String(formData.get("stepKey") || "").trim();

  if (!Number.isInteger(contentItemId) || !stepKey) {
    throw new Error("Invalid project step");
  }

  const [project] = await query<{ checklist: ProjectChecklistItem[] }>(
    `SELECT checklist FROM content_projects WHERE content_item_id = $1`,
    [contentItemId]
  );

  const currentList: ProjectChecklistItem[] = project?.checklist && Array.isArray(project.checklist)
    ? project.checklist
    : DEFAULT_CHECKLIST;

  const updated = currentList.map((item) =>
    item.key === stepKey ? { ...item, done: !item.done } : item
  );

  const nextStatus = statusFromChecklist(updated);

  await query(
    `INSERT INTO content_projects (content_item_id, checklist, updated_at)
     VALUES ($1, $2, now())
     ON CONFLICT (content_item_id) DO UPDATE
       SET checklist = EXCLUDED.checklist, updated_at = now()`,
    [contentItemId, JSON.stringify(updated)]
  );

  // Keep content_items status in sync with checklist milestones
  await query(
    `UPDATE content_items SET status = $1 WHERE id = $2 AND status <> 'Archived'`,
    [nextStatus, contentItemId]
  );

  revalidatePath("/content");
  revalidatePath(`/content/${contentItemId}`);
}

export async function updateProjectFootagePathAction(formData: FormData) {
  const contentItemId = Number(formData.get("contentItemId"));
  const footagePath = String(formData.get("footagePath") || "").trim();

  if (!Number.isInteger(contentItemId)) {
    throw new Error("Invalid project");
  }

  await query(
    `INSERT INTO content_projects (content_item_id, footage_path, updated_at)
     VALUES ($1, $2, now())
     ON CONFLICT (content_item_id) DO UPDATE
       SET footage_path = EXCLUDED.footage_path, updated_at = now()`,
    [contentItemId, footagePath || null]
  );

  revalidatePath("/content");
  revalidatePath(`/content/${contentItemId}`);
}
