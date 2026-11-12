import { query } from "./db";
import { formatScript, writeScript } from "./content";
import { pickHooks } from "./filmMath";
import { loadBanned } from "./ideaGeneration";
import { loadInsights } from "./contentInsights";
import { evidenceDigest } from "./ideaEvidenceMath";
import type { Breakdown } from "./breakdownMath";

/**
 * What has worked, for the script prompt: your own hooks that beat your usual numbers and the structures from outliers you have broken down.
 * Every line is scrubbed against the CRM's business and contact names in code. With nothing to go on (or if it cannot be read) the script is written from the idea alone.
 */
export async function scriptEvidence(): Promise<string> {
  try {
    const [banned, ins, rows] = await Promise.all([
      loadBanned(),
      loadInsights("all"),
      query<{ id: string; breakdown: Breakdown }>(`SELECT id, breakdown FROM creator_posts WHERE breakdown IS NOT NULL ORDER BY id DESC LIMIT 6`),
    ]);
    return evidenceDigest({
      winners: ins.top.filter((p) => typeof p.multiple === "number" && p.multiple > 1).slice(0, 5).map((p) => ({ hook: p.hookUsed ?? p.idea, platform: p.platform, x: p.multiple })),
      outliers: rows.map((r) => ({ id: Number(r.id), hookType: r.breakdown.hook_type, format: r.breakdown.format, beats: r.breakdown.beats ?? [], why: r.breakdown.why_it_worked?.[0] ?? "" })),
      trends: [], pains: [],
    }, banned, 2500);
  } catch {
    return "";
  }
}

/**
 * Write the script for one idea and save it: hook A (the favourite), hook B (the first genuinely different option), the script, the caption and the keyword. A waiting idea moves to Script ready.
 * `keepExisting` is for bulk scripting from the board: an idea that already has a script (perhaps one you wrote) keeps it and only moves to Script ready.
 * `userNotes` allows rewriting directly from rough notes, captured drafts, or talking points.
 */
export async function scriptItem(
  id: number,
  opts: { keepExisting?: boolean; userNotes?: string | null } = {}
): Promise<{ ok: true } | { ok: false; error: string }> {
  const [item] = await query<{
    idea: string;
    status: string;
    script: string | null;
    notes: string | null;
  }>(`SELECT idea, status, script, notes FROM content_items WHERE id = $1`, [id]);
  if (!item) return { ok: false, error: "That idea no longer exists." };
  if (item.status === "Archived") return { ok: false, error: "That idea is archived. Restore it first." };
  if (opts.keepExisting && item.script?.trim()) {
    await query(`UPDATE content_items SET status = 'Scripted' WHERE id = $1 AND status = 'Idea'`, [id]);
    return { ok: true };
  }

  const [project] = await query<{
    raw_notes: string | null;
    talking_points: string[] | null;
    summary: string | null;
  }>(`SELECT raw_notes, talking_points, summary FROM content_projects WHERE content_item_id = $1`, [id]);

  let notesToRewrite = opts.userNotes?.trim() || "";

  if (!notesToRewrite) {
    if (item.script?.trim() && !item.script.includes("HOOK OPTIONS") && !item.script.includes("ON-SCREEN TEXT")) {
      notesToRewrite = item.script.trim();
    } else if (project?.raw_notes?.trim()) {
      notesToRewrite = project.raw_notes.trim();
      if (project.talking_points && Array.isArray(project.talking_points) && project.talking_points.length > 0) {
        notesToRewrite += `\n\nKey talking points:\n` + project.talking_points.map((p) => `- ${p}`).join("\n");
      }
    } else if (item.notes?.trim()) {
      notesToRewrite = item.notes.trim();
    }
  }

  const s = await writeScript(item.idea, notesToRewrite || null, await scriptEvidence());
  const { a, b } = pickHooks(s.hooks ?? [], s.favourite_hook ?? "");
  await query(
    `UPDATE content_items SET hook = $2, hook_alt = $3, script = $4, caption = $5, keyword = $6, status = CASE WHEN status = 'Idea' THEN 'Scripted' ELSE status END WHERE id = $1`,
    [id, a, b, formatScript(s), s.caption, String(s.keyword ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "") || null]
  );
  return { ok: true };
}
