import Link from "next/link";
import { BarChart3 } from "lucide-react";
import { loadInsights } from "@/lib/contentInsights";
import { loadContentConfig } from "@/lib/content";
import { inNiche, pickNiche } from "@/lib/contentConfigMath";
import NicheFilter from "@/components/NicheFilter";
import { query } from "@/lib/db";
import { MIN_GROUP } from "@/lib/insightsMath";
import { PLATFORM_LABEL, type Platform } from "@/lib/contentMath";
import ExplainWeek from "@/components/ExplainWeek";
import { EmptyState, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "What's working" };

const x = (n: number) => `${n.toFixed(1)}×`;

export default async function Insights({ searchParams }: { searchParams: Promise<{ niche?: string }> }) {
  const config = await loadContentConfig();
  const niche = pickNiche((await searchParams).niche, config.niches);
  const ins = await loadInsights(niche);
  const tagged = await query<{ niche: string | null }>(`SELECT DISTINCT p.content_item_id, c.niche FROM posts p JOIN content_items c ON c.id = p.content_item_id`);
  const counts: Record<string, number> = { all: tagged.length, untagged: inNiche(tagged, "untagged").length, ...Object.fromEntries(config.niches.map((n) => [n, inNiche(tagged, n).length])) };
  const nothing = ins.scoredPosts === 0;
  return (
    <>
      <PageHeader
        back={{ href: "/content", label: "Content" }}
        title="What's working"
        description="How your posts did against your usual, so you film more of what works. 1× is your usual for that platform; every figure is a median. Groups with fewer than 3 posts are greyed out and never ranked."
      />

      <NicheFilter base="/content/insights" niches={config.niches} current={niche} counts={counts} />
      <div className="stack">
        <ExplainWeek disabled={nothing} />

        {nothing && (
          <div className="card">
            <EmptyState title="Nothing to rank yet" icon={<BarChart3 size={22} />}>
              {ins.totalPosts === 0
                ? "Mark a video as posted, then enter its 72-hour numbers from the drawer."
                : `${ins.totalPosts} post${ins.totalPosts === 1 ? "" : "s"} saved, but none has a score yet. A score needs the post's 72-hour numbers and 72-hour numbers for ${MIN_GROUP} other posts on the same platform.`}
              {" "}<Link href="/content">Open Content</Link>
            </EmptyState>
          </div>
        )}

        <section className="card" aria-labelledby="next-h">
          <h2 id="next-h">Next 5 to film</h2>
          <p className="muted">Your open ideas, best first: the idea's own score, plus 1 for each of pillar and hook type that matches a current winner. Ideas have no score until the idea generator is upgraded (C7), so they count as 5.</p>
          {ins.next.length === 0 ? <p className="muted">No open ideas. Generate some on the Content page.</p> : (
            <ol className="fx-list" style={{ listStyle: "decimal", paddingLeft: 22 }}>
              {ins.next.map((i) => (
                <li key={i.id} style={{ display: "list-item", borderBottom: "1px solid var(--line)" }}>
                  <Link href={`/content/${i.id}`}>{i.idea}</Link>
                  <div className="muted">{i.reasons.join(" · ")}</div>
                </li>
              ))}
            </ol>
          )}
        </section>

        {!nothing && (
          <>
            <div className="grid">
              {ins.tables.filter((t) => t.groups.length).map((t) => (
                <section key={t.title} className="card" aria-label={t.title}>
                  <h2>{t.title}</h2>
                  <table>
                    <thead><tr><th>{t.title}</th><th className="num">Posts</th><th className="num">Median</th></tr></thead>
                    <tbody>
                      {t.groups.map((g) => (
                        <tr key={g.key} style={g.thin ? { opacity: 0.5 } : undefined} title={g.thin ? `Only ${g.n} post${g.n === 1 ? "" : "s"}: too few to trust (needs ${MIN_GROUP})` : undefined}>
                          <td>{g.key}{g.thin && <span className="muted"> · too few</span>}</td>
                          <td className="num">{g.n}</td>
                          <td className="num"><b>{x(g.median)}</b></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>
              ))}
            </div>

            <div className="grid">
              {([["Best posts", ins.top], ["Weakest posts", ins.bottom]] as const).map(([title, list]) => (
                <section key={title} className="card" aria-label={title}>
                  <h2>{title}</h2>
                  {list.length === 0 ? <p className="muted">Not enough posts to separate best from weakest yet.</p> : (
                    <ul>{list.map((p) => (
                      <li key={p.postId} className="row-between" style={{ gap: 12 }}>
                        <span><a href={p.url} target="_blank" rel="noreferrer">{p.hookUsed || p.idea}</a><span className="muted"> · {PLATFORM_LABEL[p.platform as Platform] ?? p.platform}</span></span>
                        <b>{x(p.multiple)}</b>
                      </li>
                    ))}</ul>
                  )}
                </section>
              ))}
            </div>
          </>
        )}

        <section className="card" aria-labelledby="funnel-h">
          <h2 id="funnel-h">From views to replies, by pillar</h2>
          <p className="muted">Keyword replies are counted by hand from the video's drawer. Leads, calls booked and money are not attributed to a video yet: that needs the keyword tracking on the pre-launch list.</p>
          {ins.funnel.length === 0 ? <p className="muted">Nothing posted yet.</p> : (
            <div className="table-wrap"><table>
              <thead><tr><th>Pillar</th><th className="num">Posts</th><th className="num">With 72h numbers</th><th className="num">Views at 72h</th><th className="num">Keyword replies</th></tr></thead>
              <tbody>{ins.funnel.map((r) => (
                <tr key={r.pillar}><td>{r.pillar}</td><td className="num">{r.posts}</td><td className="num">{r.withNumbers}</td><td className="num">{r.views72.toLocaleString("en-GB")}</td><td className="num">{r.keywordReplies}</td></tr>
              ))}</tbody>
            </table></div>
          )}
        </section>
      </div>
    </>
  );
}
