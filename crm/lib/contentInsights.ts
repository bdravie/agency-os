import { query } from "./db";
import { loadPosts } from "./contentPerformance";
import { hookAB } from "./filmMath";
import { digest, dayPart, sourceLabel, funnel, groupScores, lengthBand, rankIdeas, topBottom, weekdayOf, winner, type FunnelRow, type Group, type RankedIdea, type ScoredPost } from "./insightsMath";

export type Insights = {
  scoredPosts: number; totalPosts: number;
  tables: { title: string; groups: Group[] }[];
  top: ScoredPost[]; bottom: ScoredPost[];
  funnel: FunnelRow[];
  next: RankedIdea[];
  text: string;
};

/** Everything on the What's working page. All numbers are worked out here, in code (insightsMath); the AI only words them. */
export async function loadInsights(niche = "all"): Promise<Insights> {
  const [posts, items, replyRows] = await Promise.all([
    loadPosts(),
    query<any>(`SELECT id, idea, pillar, hook_type, format, niche, length_s, idea_score, status, source, hook, hook_alt FROM content_items`),
    query<{ id: string; n: string }>(`SELECT (meta->>'content_item_id') AS id, count(*) AS n FROM activities WHERE type = 'content_keyword_reply' AND meta ? 'content_item_id' GROUP BY 1`),
  ]);
  const byId = new Map<number, any>(items.map((i: any) => [Number(i.id), i]));
  const keep = (n: string | null) => niche === "all" || (niche === "untagged" ? !n : n === niche);
  const scored: ScoredPost[] = posts.flatMap((p) => {
    const it = byId.get(p.content_item_id);
    const m72 = p.metrics.find((m) => m.bucket === 72);
    if (!it || p.performance.status !== "ok" || !m72 || !keep(it.niche)) return [];
    return [{
      postId: p.id, contentId: p.content_item_id, platform: p.platform, multiple: p.performance.multiple, views72: Number(m72.views), postedAt: p.posted_at, url: p.url,
      idea: it.idea, source: it.source, itemHook: it.hook, itemHookAlt: it.hook_alt, hookUsed: p.hook_used, pillar: it.pillar, hookType: it.hook_type, format: it.format, niche: it.niche, lengthS: it.length_s,
    }];
  });
  const pillars = groupScores(scored, (p) => p.pillar);
  const hooks = groupScores(scored, (p) => p.hookType);
  const tables = [
    { title: "Pillar", groups: pillars }, { title: "Hook type", groups: hooks },
    { title: "Format", groups: groupScores(scored, (p) => p.format) }, { title: "Niche", groups: groupScores(scored, (p) => p.niche) },
    { title: "Video length", groups: groupScores(scored, (p) => lengthBand(p.lengthS)) },
    { title: "Platform", groups: groupScores(scored, (p) => p.platform) },
    { title: "Hook A against hook B", groups: hookAB(scored) },
    { title: "Where the idea came from", groups: groupScores(scored, (p) => sourceLabel(p.source)) },
    { title: "Weekday posted", groups: groupScores(scored, (p) => weekdayOf(p.postedAt)) },
    { title: "Time of day posted", groups: groupScores(scored, (p) => dayPart(p.postedAt)) },
  ];
  const { top, bottom } = topBottom(scored);
  const views72 = (id: number) => { const v = posts.find((p) => p.id === id)?.metrics.find((m) => m.bucket === 72)?.views; return v === undefined || v === null ? null : Number(v); };
  const f = funnel(
    posts.map((p) => ({ contentId: p.content_item_id, pillar: byId.get(p.content_item_id)?.pillar ?? null, views72: views72(p.id) })),
    new Map(replyRows.map((r) => [Number(r.id), Number(r.n)])),
    new Map([...byId].map(([id, it]) => [id, it.pillar ?? null])),
  );
  const next = rankIdeas(
    items.filter((i: any) => i.status === "Idea" && keep(i.niche)).map((i: any) => ({ id: Number(i.id), idea: i.idea, idea_score: i.idea_score, pillar: i.pillar, hook_type: i.hook_type })),
    winner(pillars), winner(hooks),
  );
  return { scoredPosts: scored.length, totalPosts: posts.length, tables, top, bottom, funnel: f, next, text: digest(tables.filter((t) => t.groups.length), top, bottom, f) };
}
