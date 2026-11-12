import { query } from "./db";
import { loadPosts } from "./contentPerformance";
import { dayPart, topBottom, weekdayOf, type ScoredPost } from "./insightsMath";
import { IMAGE_KINDS, LINKEDIN_FORMAT, wordCount } from "./linkedinMath";
import { linkedinTables, type LinkedInScored } from "./linkedinSwipeMath";
import type { Group } from "./insightsMath";

export type LinkedInInsights = { posted: number; scored: number; waiting: number; tables: { title: string; groups: Group[] }[]; top: LinkedInScored[]; bottom: LinkedInScored[] };

const imageLabel = (k: string | null) => (k === "video" ? "Video" : k ? IMAGE_KINDS.find((x) => x.code === k)?.label ?? k : "No image");

/**
 * What's working on LinkedIn: your own LinkedIn posts (every content item posted there, not only those written on this tab), each scored as 72-hour impressions
 * against the median of your other LinkedIn posts, the same × score as everywhere else. All numbers are worked out here, in code.
 */
export async function loadLinkedInInsights(): Promise<LinkedInInsights> {
  const [posts, items] = await Promise.all([
    loadPosts(),
    query<any>(
      `SELECT i.id, i.idea, i.script, i.format, i.hook, i.hook_alt, i.niche,
              (SELECT m.kind FROM post_images m WHERE m.content_item_id = i.id AND m.selected LIMIT 1) AS image_kind
         FROM content_items i WHERE i.id IN (SELECT content_item_id FROM posts WHERE platform = 'linkedin')`),
  ]);
  const byId = new Map<number, any>(items.map((i: any) => [Number(i.id), i]));
  const linkedin = posts.filter((p) => p.platform === "linkedin");
  const scored: LinkedInScored[] = linkedin.flatMap((p) => {
    const it = byId.get(p.content_item_id);
    const m72 = p.metrics.find((m) => m.bucket === 72);
    if (!it || p.performance.status !== "ok" || !m72) return [];
    // A video posted to LinkedIn is grouped as "Video" for image and length: its script is spoken words, not a text post.
    return [{
      postId: p.id, contentId: p.content_item_id, title: it.idea, multiple: p.performance.multiple, views72: Number(m72.views), postedAt: p.posted_at, url: p.url,
      words: it.format === LINKEDIN_FORMAT ? wordCount(it.script ?? "") : null, imageKind: it.format === LINKEDIN_FORMAT ? it.image_kind ?? null : "video",
      hookUsed: p.hook_used, hook: it.hook, hookAlt: it.hook_alt, niche: it.niche,
    }];
  });
  const tb = topBottom(scored as unknown as ScoredPost[], 3) as unknown as { top: LinkedInScored[]; bottom: LinkedInScored[] };
  return {
    posted: linkedin.length, scored: scored.length, waiting: linkedin.filter((p) => !p.metrics.some((m) => m.bucket === 72)).length,
    tables: linkedinTables(scored, weekdayOf, dayPart, imageLabel), top: tb.top, bottom: tb.bottom,
  };
}
