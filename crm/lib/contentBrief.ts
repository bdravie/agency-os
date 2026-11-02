import { readFile } from "node:fs/promises";
import path from "node:path";
import { query } from "./db";
import { askStructured, briefModel } from "./llm";
import { loadInsights } from "./contentInsights";
import { loadPosts } from "./contentPerformance";
import { loadCreatorSettings } from "./creatorScrape";
import { loadContentConfig } from "./content";
import { scoreLabel } from "./contentMath";
import { briefDigest, briefIsEmpty, cleanProse, type BriefNumbers, type BriefProse } from "./briefMath";
import { numbersNotIn } from "./insightsMath";

/** Every figure in the brief, worked out here in code from the same data as the What's working page. Nothing in it comes from the AI. */
export async function buildBriefNumbers(): Promise<BriefNumbers> {
  const [{ monday }] = await query<{ monday: string }>(`SELECT (date_trunc('week', now() AT TIME ZONE 'Europe/London'))::date::text AS monday`);
  const [ins, posts, ids, items, replies, trends, settings, config] = await Promise.all([
    loadInsights("all"),
    loadPosts(),
    query<{ id: string }>(`SELECT id FROM posts WHERE (posted_at AT TIME ZONE 'Europe/London') >= ($1::date - 7) AND (posted_at AT TIME ZONE 'Europe/London') < $1::date`, [monday]),
    query<{ id: string; idea: string }>(`SELECT id, idea FROM content_items`),
    query<{ n: string }>(`SELECT count(*) AS n FROM activities WHERE type = 'content_keyword_reply' AND occurred_at > now() - interval '7 days'`),
    query<{ id: string; title: string }>(`SELECT id, title FROM trend_signals WHERE used_in_content_id IS NULL AND seen_at > now() - interval '14 days' ORDER BY seen_at DESC LIMIT 5`),
    loadCreatorSettings(),
    loadContentConfig(),
  ]);
  const lastWeekIds = new Set(ids.map((r) => Number(r.id)));
  const idea = new Map(items.map((i) => [Number(i.id), i.idea]));
  const out = await query<any>(
    `SELECT c.handle, p.platform, p.outlier_score::float8 AS x, p.cta_keyword FROM creator_posts p JOIN creators c ON c.id = p.creator_id
      WHERE p.outlier_score >= $1 AND p.review = 'new' AND p.posted_at > now() - interval '14 days' ORDER BY p.outlier_score DESC`, [settings.threshold]);
  return {
    weekStart: monday, target: config.posts_per_week,
    lastWeek: posts.filter((p) => lastWeekIds.has(p.id)).map((p) => ({ hook: p.hook_used ?? idea.get(p.content_item_id) ?? "Untitled", platform: p.platform, label: scoreLabel(p.platform, p.performance) })),
    pillars: ins.tables.find((t) => t.title === "Pillar")?.groups ?? [], hookTypes: ins.tables.find((t) => t.title === "Hook type")?.groups ?? [],
    keywordReplies: Number(replies[0].n),
    outliers: { total: out.length, top: out.slice(0, 3).map((o: any) => ({ handle: o.handle, platform: o.platform, x: Math.round(o.x * 10) / 10, keyword: o.cta_keyword })) },
    trends: trends.map((t) => ({ id: Number(t.id), title: t.title })),
    film: ins.next.map((n) => ({ id: n.id, idea: n.idea, rank: n.rank })),
  };
}

export type StoredBrief = { week_start: string; numbers: BriefNumbers; prose: BriefProse; model: string | null; created_at: string };

/**
 * Write this week's brief: the numbers come from code, Sonnet writes only the words, and every number in its answer must appear in the digest it was shown.
 * Asked again once with the stray numbers listed; if it still fails nothing is saved. Replaces an earlier brief for the same week.
 */
export async function writeBrief(): Promise<{ ok: true; brief: StoredBrief } | { ok: false; error: string }> {
  const numbers = await buildBriefNumbers();
  if (briefIsEmpty(numbers)) return { ok: false, error: "There is nothing to write about yet: no posts last week, no outliers, no trends and no open ideas." };
  const digest = briefDigest(numbers);
  const rules = await readFile(path.join(path.resolve(process.cwd(), ".."), "prompts/weekly-content-brief.md"), "utf8");
  const S = { type: "string" } as const;
  const schema = { type: "object" as const, required: ["headline", "what_happened", "what_to_do"], properties: { headline: S, what_happened: { type: "array", items: S, minItems: 3, maxItems: 3 }, what_to_do: { type: "array", items: S, minItems: 3, maxItems: 3 } } };
  let stray: string[] = [];
  for (let attempt = 0; attempt < 2; attempt++) {
    const raw = await askStructured<unknown>(
      attempt === 0 ? `${rules}\n\nNUMBERS:\n${digest}` : `${rules}\n\nNUMBERS:\n${digest}\n\nYour last answer used numbers that are not in the NUMBERS (${stray.join(", ")}). Rewrite it using only numbers from the NUMBERS, copied exactly.`,
      schema, briefModel(), 2500);
    const prose = cleanProse(raw);
    if (!prose) continue;
    stray = numbersNotIn([prose.headline, ...prose.what_happened, ...prose.what_to_do].join("\n"), digest);
    if (stray.length) continue;
    const [row] = await query<any>(
      `INSERT INTO content_briefs (week_start, numbers, prose, model) VALUES ($1,$2,$3,$4)
       ON CONFLICT (week_start) DO UPDATE SET numbers = EXCLUDED.numbers, prose = EXCLUDED.prose, model = EXCLUDED.model, created_at = now() RETURNING week_start::text, model, created_at`,
      [numbers.weekStart, JSON.stringify(numbers), JSON.stringify(prose), briefModel()]);
    return { ok: true, brief: { week_start: row.week_start, numbers, prose, model: row.model, created_at: String(row.created_at) } };
  }
  return { ok: false, error: stray.length ? `The AI used a number that is not in your data (${stray.join(", ")}), so its answer was not saved. Try again.` : "The AI's answer was incomplete. Try again." };
}
