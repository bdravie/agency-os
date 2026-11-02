import { query } from "@/lib/db";
import { toCsv } from "@/lib/creatorMath";

export const dynamic = "force-dynamic";

// A spreadsheet of everything saved about the creators you follow: public profile and post numbers only. Login is enforced by middleware.
export async function GET() {
  const rows = await query<any>(
    `SELECT c.platform, c.handle, c.display_name, c.followers, c.link_in_bio, c.bio, p.url, p.posted_at, p.post_type, p.duration_s, p.views, p.likes, p.comments, p.shares, p.saves,
            p.outlier_score, p.cta_keyword, p.hashtags, p.sound, p.caption, p.review
       FROM creator_posts p JOIN creators c ON c.id = p.creator_id ORDER BY c.handle, p.posted_at DESC NULLS LAST`);
  const csv = toCsv(
    ["platform", "creator", "display name", "followers", "link in bio", "bio", "post url", "posted at", "type", "seconds", "views", "likes", "comments", "shares", "saves", "x their usual", "keyword", "hashtags", "sound", "caption", "review"],
    rows.map((r: any) => [r.platform, r.handle, r.display_name, r.followers, r.link_in_bio, r.bio, r.url, r.posted_at ? new Date(r.posted_at).toISOString() : "", r.post_type, r.duration_s, r.views, r.likes, r.comments, r.shares, r.saves, r.outlier_score, r.cta_keyword, (r.hashtags ?? []).join(" "), r.sound, r.caption, r.review]));
  return new Response(csv, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="creator-posts-${new Date().toISOString().slice(0, 10)}.csv"`, "cache-control": "no-store" } });
}
