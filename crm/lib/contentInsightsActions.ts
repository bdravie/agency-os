"use server";

import { revalidatePath } from "next/cache";
import { query } from "./db";
import { logActivity } from "./activity";
import { requireLogin } from "./auth";
import { askStructured, contentModel } from "./llm";
import { loadInsights } from "./contentInsights";
import { cleanTags } from "./contentMath";
import { numbersNotIn } from "./insightsMath";
import { readFile } from "node:fs/promises";
import path from "node:path";

export type Explained = { ok: true; observations: string[]; to_try: string[] } | { ok: false; error: string };

const S = { type: "string" } as const;
const SCHEMA = {
  type: "object" as const, required: ["observations", "to_try"],
  properties: { observations: { type: "array", items: S, minItems: 3, maxItems: 3 }, to_try: { type: "array", items: S, minItems: 3, maxItems: 3 } },
};

/**
 * Click-only. Haiku words three observations and three things to try from the tables the code worked out.
 * Every number in its answer must appear in those tables: if one does not, it is asked again once, then refused.
 */
export async function explainWeek(): Promise<Explained> {
  await requireLogin();
  const ins = await loadInsights();
  if (ins.scoredPosts < 1) return { ok: false, error: "There is nothing to explain yet. Post a video and enter its 72-hour numbers first." };
  const rules = await readFile(path.join(path.resolve(process.cwd(), ".."), "prompts/content-insights.md"), "utf8");
  const prompt = `${rules}\n\nTABLES:\n${ins.text}`;
  let problems: string[] = [];
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await askStructured<{ observations: string[]; to_try: string[] }>(
        attempt === 0 ? prompt : `${prompt}\n\nYour last answer used numbers that are not in the tables (${problems.join(", ")}). Rewrite it using only numbers from the tables, copied exactly.`,
        SCHEMA, contentModel(), 1500);
      const all = [...(r.observations ?? []), ...(r.to_try ?? [])];
      problems = numbersNotIn(all.join("\n"), ins.text);
      if (!problems.length && r.observations?.length && r.to_try?.length) {
        await logActivity("content_insights", { body: "Explain this week" });
        return { ok: true, observations: r.observations, to_try: r.to_try };
      }
    } catch (err) {
      return { ok: false, error: `Something went wrong: ${err instanceof Error ? err.message : String(err)}` };
    }
  }
  return { ok: false, error: `The AI used a number that is not in your data (${problems.join(", ")}), so its answer was not shown. Try again.` };
}

/** Count one keyword reply by hand (someone commented the keyword and you sent them the build). Only a count against the video is kept: no username, no message. */
export async function logKeywordReply(contentId: number): Promise<{ ok: boolean; count: number }> {
  await requireLogin();
  const found = await query(`SELECT 1 FROM content_items WHERE id = $1`, [contentId]);
  if (!found.length) return { ok: false, count: 0 };
  await logActivity("content_keyword_reply", { body: "Keyword reply (counted by hand)", meta: { content_item_id: contentId, source: "manual" } });
  revalidatePath("/content/insights");
  return { ok: true, count: await keywordReplyCount(contentId) };
}

/** Take back the last keyword reply you counted for a video (a slip of the finger). */
export async function undoKeywordReply(contentId: number): Promise<{ ok: boolean; count: number }> {
  await requireLogin();
  await query(
    `DELETE FROM activities WHERE id = (SELECT id FROM activities WHERE type = 'content_keyword_reply' AND (meta->>'content_item_id') = $1::text ORDER BY occurred_at DESC, id DESC LIMIT 1)`, [String(contentId)]);
  revalidatePath("/content/insights");
  return { ok: true, count: await keywordReplyCount(contentId) };
}

export async function keywordReplyCount(contentId: number): Promise<number> {
  await requireLogin();
  const [r] = await query<{ n: string }>(`SELECT count(*) AS n FROM activities WHERE type = 'content_keyword_reply' AND (meta->>'content_item_id') = $1::text`, [String(contentId)]);
  return Number(r.n);
}

/** Save the tags that group a video in What's working: pillar, hook type, niche and length. */
export async function saveTags(contentId: number, raw: { pillar?: string; hook_type?: string; niche?: string; length_s?: string }): Promise<{ ok: boolean; error?: string }> {
  await requireLogin();
  const c = cleanTags(raw);
  if ("error" in c) return { ok: false, error: c.error };
  const t = c.tags;
  const rows = await query(`UPDATE content_items SET pillar = $2, hook_type = $3, niche = $4, length_s = $5 WHERE id = $1 RETURNING id`, [contentId, t.pillar, t.hook_type, t.niche, t.length_s]);
  if (!rows.length) return { ok: false, error: "That idea no longer exists." };
  revalidatePath("/content"); revalidatePath("/content/insights"); revalidatePath(`/content/${contentId}`);
  return { ok: true };
}
