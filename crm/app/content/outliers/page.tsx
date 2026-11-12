import Link from "next/link";
import { TrendingUp } from "lucide-react";
import { query } from "@/lib/db";
import { loadCreatorSettings } from "@/lib/creatorScrape";
import OutlierActions from "@/components/OutlierActions";
import BreakdownPanel from "@/components/BreakdownPanel";
import ContentTabs from "@/components/ContentTabs";
import { EmptyState, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Outliers" };

const TABS = [["new", "New"], ["saved", "Swipe file"], ["dismissed", "Dismissed"]] as const;
const NAME: Record<string, string> = { tiktok: "TikTok", instagram: "Instagram", youtube: "YouTube", linkedin: "LinkedIn" };
const n = (v: string | number | null) => (v === null ? "–" : Number(v).toLocaleString("en-GB"));

export default async function Outliers({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const asked = (await searchParams).tab;
  const tab = TABS.some(([k]) => k === asked) ? asked! : "new";
  const s = await loadCreatorSettings();
  const posts = await query<any>(
    `SELECT p.id, p.platform, p.url, p.caption, p.posted_at, p.duration_s, p.views::text, p.likes::text, p.comments::text, p.saves::text, p.outlier_score::float8 AS score,
            p.cta_keyword, p.hashtags, p.sound, p.post_type, p.breakdown, c.handle, c.display_name, c.link_in_bio, c.why_i_follow
       FROM creator_posts p JOIN creators c ON c.id = p.creator_id
      WHERE p.outlier_score >= $1 AND p.review = $2
      ORDER BY CASE WHEN $2 = 'new' THEN p.posted_at END DESC NULLS LAST, p.reviewed_at DESC NULLS LAST LIMIT 100`, [s.threshold, tab]);
  const counts = Object.fromEntries((await query<{ review: string; n: string }>(`SELECT review, count(*) AS n FROM creator_posts WHERE outlier_score >= $1 GROUP BY 1`, [s.threshold])).map((r) => [r.review, Number(r.n)]));
  return (
    <>
      <PageHeader
        back={{ href: "/content", label: "Content" }}
        title="Outliers"
        description={`Posts that got ${s.threshold}× or more of that creator's usual views, newest first. See the hook, the format and the keyword they use to bring people in, then make your own version in your own words.`}
      />
      <ContentTabs current="research" />
      <div className="pills" style={{ marginBottom: 12 }} aria-label="Research sections">
        <Link href="/content/creators" className="pill">Creators</Link>
        <Link href="/content/outliers" className="pill on">Outliers</Link>
        <Link href="/content/trends" className="pill">Trends</Link>
      </div>
      <div className="pills" style={{ marginBottom: 16 }} aria-label="Filter">
        {TABS.map(([k, label]) => <Link key={k} href={`/content/outliers?tab=${k}`} className={`pill${k === tab ? " on" : ""}`}>{label} ({counts[k] ?? 0})</Link>)}
      </div>
      {posts.length === 0 ? (
        <div className="card"><EmptyState title={tab === "new" ? "No outliers yet" : "Nothing here yet"} icon={<TrendingUp size={22} />}>
          {tab === "new" ? <>Follow a few creators and check them on the <Link href="/content/creators">Creators page</Link>. A creator needs {s.minBaseline} posts older than {s.minAgeHours} hours before any post can be called an outlier.</> : "Posts you move here will show up in this tab."}
        </EmptyState></div>
      ) : (
        <div className="stack">
          {posts.map((p: any) => (
            <article key={p.id} className="card stack" style={{ gap: 8 }}>
              <div className="row-between" style={{ gap: 12, flexWrap: "wrap" }}>
                <span><b>{p.display_name ?? p.handle}</b> <span className="muted">· {NAME[p.platform]} @{p.handle} · {p.posted_at ? new Date(p.posted_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "date unknown"}</span></span>
                <span className="badge tone-good">{p.score.toFixed(1)}× their usual</span>
              </div>
              <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{p.caption ?? "(no caption)"}</p>
              <p className="muted" style={{ margin: 0 }}>
                {n(p.views)} views · {n(p.likes)} likes · {n(p.comments)} comments{p.saves !== null ? ` · ${n(p.saves)} saves` : ""}
                {p.duration_s ? ` · ${p.duration_s}s` : ""}{p.post_type ? ` · ${p.post_type}` : ""}{p.sound ? ` · sound: ${p.sound}` : ""}
              </p>
              <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                {p.cta_keyword && <span className="badge tone-blue" title="The word they ask people to comment or message">Keyword: {p.cta_keyword}</span>}
                {(p.hashtags ?? []).slice(0, 6).map((h: string) => <span key={h} className="badge tone-neutral">#{h}</span>)}
                {p.link_in_bio && <span className="muted">Their link in bio: <a href={p.link_in_bio} target="_blank" rel="noreferrer">{p.link_in_bio.replace(/^https?:\/\//, "").slice(0, 36)}</a></span>}
              </div>
              <BreakdownPanel postId={Number(p.id)} initial={p.breakdown ?? null} />
              <div className="row-between" style={{ gap: 12, flexWrap: "wrap" }}>
                <a href={p.url} target="_blank" rel="noreferrer">Watch it</a>
                <OutlierActions id={Number(p.id)} review={tab} />
              </div>
            </article>
          ))}
        </div>
      )}
    </>
  );
}
