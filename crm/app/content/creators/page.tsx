import { Download } from "lucide-react";
import { query } from "@/lib/db";
import { apifyToken } from "@/lib/apify";
import { creatorBudgets, creatorSpend, loadCreatorSettings } from "@/lib/creatorScrape";
import { estimateCostUsd } from "@/lib/creatorMath";
import CreatorsPanel, { type CreatorRow } from "@/components/CreatorsPanel";
import ContentTabs from "@/components/ContentTabs";
import { PageHeader } from "@/components/ui";
import Link from "next/link";

export const dynamic = "force-dynamic";
export const metadata = { title: "Creators" };

export default async function Creators() {
  const [rows, s, spend] = await Promise.all([
    query<any>(
      `SELECT c.id, c.platform, c.handle, c.profile_url, c.niche, c.why_i_follow, c.active, c.display_name, c.followers::text AS followers, c.link_in_bio, c.last_checked_at,
              (SELECT count(*) FROM creator_posts p WHERE p.creator_id = c.id) AS posts
         FROM creators c ORDER BY c.active DESC, c.created_at DESC`),
    loadCreatorSettings(),
    creatorSpend(),
  ]);
  const flagged = new Map((await query<{ creator_id: string; n: string }>(`SELECT creator_id, count(*) AS n FROM creator_posts WHERE outlier_score >= $1 GROUP BY 1`, [s.threshold])).map((r) => [Number(r.creator_id), Number(r.n)]));
  const creators: CreatorRow[] = rows.map((r: any) => ({
    ...r, id: Number(r.id), posts: Number(r.posts), outliers: flagged.get(Number(r.id)) ?? 0, last_checked_at: r.last_checked_at ? String(r.last_checked_at) : null,
    estimate: estimateCostUsd(r.platform, s.postsPerCreator, s.actors),
  }));
  const b = creatorBudgets();
  return (
    <>
      <PageHeader
        back={{ href: "/content", label: "Content" }}
        title="Creators"
        description="Creators whose content you learn from. Check them for their latest public posts, and see which ones took off."
        actions={<>
          <a href="/api/content/creators/export" className="btn secondary"><Download size={16} aria-hidden /> Export CSV</a>
        </>}
      />
      <ContentTabs current="research" />
      <div className="pills" style={{ marginBottom: 16 }} aria-label="Research sections">
        <Link href="/content/creators" className="pill on">Creators</Link>
        <Link href="/content/outliers" className="pill">Outliers</Link>
        <Link href="/content/trends" className="pill">Trends</Link>
      </div>
      <CreatorsPanel creators={creators} spend={spend} budget={{ daily: b.daily, monthly: b.monthly }} tokenSet={!!apifyToken()} maxActive={s.maxActive} />
    </>
  );
}
