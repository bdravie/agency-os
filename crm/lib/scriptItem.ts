import { query } from "./db";
import { formatScript, writeScript } from "./content";
import { pickHooks } from "./filmMath";

/**
 * Write the script for one idea and save it: hook A (the favourite), hook B (the first genuinely different option), the script, the caption and the keyword. A waiting idea moves to Script ready.
 * `keepExisting` is for bulk scripting from the board: an idea that already has a script (perhaps one you wrote) keeps it and only moves to Script ready.
 */
export async function scriptItem(id: number, opts: { keepExisting?: boolean } = {}): Promise<{ ok: true } | { ok: false; error: string }> {
  const [item] = await query<{ idea: string; status: string; script: string | null }>(`SELECT idea, status, script FROM content_items WHERE id = $1`, [id]);
  if (!item) return { ok: false, error: "That idea no longer exists." };
  if (item.status === "Archived") return { ok: false, error: "That idea is archived. Restore it first." };
  if (opts.keepExisting && item.script?.trim()) {
    await query(`UPDATE content_items SET status = 'Scripted' WHERE id = $1 AND status = 'Idea'`, [id]);
    return { ok: true };
  }
  const s = await writeScript(item.idea);
  const { a, b } = pickHooks(s.hooks ?? [], s.favourite_hook ?? "");
  await query(
    `UPDATE content_items SET hook = $2, hook_alt = $3, script = $4, caption = $5, keyword = $6, status = CASE WHEN status = 'Idea' THEN 'Scripted' ELSE status END WHERE id = $1`,
    [id, a, b, formatScript(s), s.caption, String(s.keyword ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "") || null]);
  return { ok: true };
}
