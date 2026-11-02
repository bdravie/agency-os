import { query } from "./db";
import { performance, type Metrics, type Performance } from "./contentMath";

export type PostMetricRow = Metrics & { bucket: number; captured_at: string; age_hours: string | null; source: string };
export type PostView = {
  id: number; content_item_id: number; platform: string; url: string; hook_used: string | null; posted_at: string;
  metrics: PostMetricRow[]; performance: Performance;
};

/**
 * Every post with its saved numbers and its score. The score is worked out here, in code, never by the AI:
 * 72-hour views against the median of the latest 20 other posts on the same platform (see contentMath.performance).
 */
export async function loadPosts(contentItemId?: number): Promise<PostView[]> {
  const posts = await query<any>(`SELECT id, content_item_id, platform, url, hook_used, posted_at FROM posts ORDER BY posted_at DESC, id DESC`);
  const metrics = await query<any>(`SELECT post_id, bucket, captured_at, age_hours, views, likes, comments, shares, saves, follows, avg_watch_s, source FROM post_metrics ORDER BY bucket`);
  const byPost = new Map<number, PostMetricRow[]>();
  for (const m of metrics) {
    const row: PostMetricRow = { ...m, avg_watch_s: m.avg_watch_s === null ? null : Number(m.avg_watch_s), captured_at: String(m.captured_at) };
    byPost.set(Number(m.post_id), [...(byPost.get(Number(m.post_id)) ?? []), row]);
  }
  const at72 = (id: number) => byPost.get(id)?.find((m) => m.bucket === 72) ?? null;
  const views72 = (id: number) => at72(id)?.views ?? null;
  const out: PostView[] = posts.map((p: any) => {
    const id = Number(p.id);
    // posts are newest first, so the baseline is already "the latest posts"
    const baseline = posts.filter((o: any) => Number(o.id) !== id && o.platform === p.platform).map((o: any) => views72(Number(o.id))).filter((v: number | null): v is number => v !== null);
    return {
      id, content_item_id: Number(p.content_item_id), platform: p.platform, url: p.url, hook_used: p.hook_used, posted_at: String(p.posted_at),
      metrics: byPost.get(id) ?? [], performance: performance(at72(id), baseline),
    };
  });
  return contentItemId === undefined ? out : out.filter((p) => p.content_item_id === contentItemId);
}
