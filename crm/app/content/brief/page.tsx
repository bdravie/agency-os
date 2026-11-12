import Link from "next/link";
import { query } from "@/lib/db";
import type { BriefNumbers, BriefProse } from "@/lib/briefMath";
import WriteBrief from "@/components/WriteBrief";
import ContentTabs from "@/components/ContentTabs";
import { PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Weekly brief" };

const x = (n: number) => `${n.toFixed(1)}×`;
const longDate = (d: string) => new Date(d + "T12:00:00").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

export default async function Brief({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  const asked = (await searchParams).week;
  const [{ monday }] = await query<{ monday: string }>(`SELECT (date_trunc('week', now() AT TIME ZONE 'Europe/London'))::date::text AS monday`);
  const all = await query<{ week_start: string }>(`SELECT week_start::text FROM content_briefs ORDER BY week_start DESC LIMIT 12`);
  const week = asked && all.some((b) => b.week_start === asked) ? asked : all[0]?.week_start ?? null;
  const [b] = week ? await query<{ numbers: BriefNumbers; prose: BriefProse; model: string | null; created_at: string }>(`SELECT numbers, prose, model, created_at FROM content_briefs WHERE week_start = $1`, [week]) : [];
  const n = b?.numbers;
  const best = (g: BriefNumbers["pillars"]) => g.find((r) => !r.thin) ?? null;
  return (
    <>
      <PageHeader
        back={{ href: "/content", label: "Content" }}
        title="Weekly brief"
        description={`What last week showed and what to film next. This week starts ${longDate(monday)}. The numbers are worked out in code from the same data as What's working; the AI only writes the words.`}
        actions={<Link href="/content/insights" className="btn secondary">What's working</Link>}
      />
      <ContentTabs current="brief" />
      <div className="stack">
        <section className="card row-between" style={{ gap: 12, flexWrap: "wrap" }}>
          <span>{all.some((r) => r.week_start === monday) ? "This week's brief is written." : "No brief yet for this week."}</span>
          <WriteBrief has={all.some((r) => r.week_start === monday)} />
        </section>

        {!b || !n ? <section className="card"><p className="muted">No brief has been written yet. Click the button above once you have posted something or noted a trend.</p></section> : (
          <>
            <section className="card stack" style={{ gap: 10 }} aria-labelledby="head-h">
              <h2 id="head-h">Week of {longDate(n.weekStart)}</h2>
              <p style={{ fontWeight: 600, margin: 0 }}>{b.prose.headline}</p>
              <div className="grid">
                <div><h3>What happened</h3><ul className="fx-bullets">{b.prose.what_happened.map((t, i) => <li key={i}>{t}</li>)}</ul></div>
                <div><h3>What to do this week</h3><ul className="fx-bullets">{b.prose.what_to_do.map((t, i) => <li key={i}>{t}</li>)}</ul></div>
              </div>
              <p className="muted">Written {new Date(b.created_at).toLocaleString("en-GB")}{b.model ? ` · ${b.model}` : ""}</p>
            </section>

            <div className="grid">
              <section className="card" aria-label="Last week's posts">
                <h2>Last week's posts</h2>
                <p className="muted">{n.lastWeek.length} against a target of {n.target} a week.</p>
                {n.lastWeek.length === 0 ? <p className="muted">Nothing was posted.</p> : <ul>{n.lastWeek.map((p, i) => <li key={i} className="row-between"><span>{p.hook}</span><b>{p.label}</b></li>)}</ul>}
              </section>
              <section className="card" aria-label="What is working">
                <h2>What's working</h2>
                <p>Best pillar: <b>{best(n.pillars) ? `${best(n.pillars)!.key}, median ${x(best(n.pillars)!.median)} over ${best(n.pillars)!.n} posts` : "no group has 3 posts yet"}</b></p>
                <p>Best hook type: <b>{best(n.hookTypes) ? `${best(n.hookTypes)!.key}, median ${x(best(n.hookTypes)!.median)} over ${best(n.hookTypes)!.n} posts` : "no group has 3 posts yet"}</b></p>
                <p>Keyword replies counted by hand: <b>{n.keywordReplies}</b></p>
              </section>
              <section className="card" aria-label="New outliers">
                <h2>New outliers</h2>
                <p className="muted">{n.outliers.total} from creators you follow.</p>
                <ul>{n.outliers.top.map((o, i) => <li key={i} className="row-between"><span>@{o.handle} · {o.platform}{o.keyword ? ` · keyword ${o.keyword}` : ""}</span><b>{x(o.x)}</b></li>)}</ul>
                {n.outliers.total > 0 && <Link href="/content/outliers">Open outliers</Link>}
              </section>
              <section className="card" aria-label="Trends">
                <h2>Trends to use</h2>
                {n.trends.length === 0 ? <p className="muted">None noted. <Link href="/content/trends">Add one</Link>.</p> : <ul>{n.trends.map((t) => <li key={t.id}>{t.title}</li>)}</ul>}
              </section>
            </div>

            <section className="card" aria-labelledby="film-h">
              <h2 id="film-h">Film these {n.film.length}</h2>
              {n.film.length === 0 ? <p className="muted">No open ideas. Generate some on the Content page.</p> : (
                <ol style={{ listStyle: "decimal", paddingLeft: 22 }}>{n.film.map((f) => <li key={f.id}><Link href={`/content/${f.id}`}>{f.idea}</Link> <span className="muted">(rank {f.rank})</span></li>)}</ol>
              )}
            </section>
          </>
        )}

        {all.length > 1 && (
          <section className="card"><h2>Earlier briefs</h2>
            <div className="pills">{all.map((r) => <Link key={r.week_start} href={`/content/brief?week=${r.week_start}`} className={`pill${r.week_start === week ? " on" : ""}`}>{new Date(r.week_start + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</Link>)}</div>
          </section>
        )}
      </div>
    </>
  );
}
