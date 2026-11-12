import Link from "next/link";
import { BarChart3 } from "lucide-react";
import { MIN_GROUP } from "@/lib/insightsMath";
import type { LinkedInInsights as Data } from "@/lib/linkedinInsights";
import { EmptyState } from "./ui";

const x = (n: number) => `${n.toFixed(1)}×`;

/** What's working on LinkedIn: your own LinkedIn posts ranked by the × score (72-hour impressions against your usual), every way you can act on. Numbers worked out in code. */
export default function LinkedInInsights({ data }: { data: Data }) {
  return (
    <div className="stack" style={{ gap: 16 }}>
      <section className="card">
        <h2>What's working on LinkedIn</h2>
        <p className="muted" style={{ margin: 0 }}>
          Each post is scored on its impressions at 72 hours against the median of your other LinkedIn posts (1.0× is your usual). A group needs {MIN_GROUP} posts before it is ranked.
          {" "}{data.posted} LinkedIn post{data.posted === 1 ? "" : "s"} recorded, {data.scored} scored{data.waiting ? `, ${data.waiting} still waiting for their 72-hour numbers` : ""}.
        </p>
      </section>

      {data.scored === 0 ? (
        <div className="card">
          <EmptyState title="Nothing to rank yet" icon={<BarChart3 size={22} />}>
            Mark posts as posted, then type in their impressions at 24 hours, 72 hours and 7 days (the sidebar reminds you). Scores start from the third post with 72-hour numbers.
            {data.waiting > 0 && <> <Link href="/content?tab=board">Enter the numbers on the Board</Link>.</>}
          </EmptyState>
        </div>
      ) : (
        <>
          <div className="grid">
            {data.tables.map((t) => (
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
            {([["Best posts", data.top], ["Weakest posts", data.bottom]] as const).map(([title, list]) => (
              <section key={title} className="card" aria-label={title}>
                <h2>{title}</h2>
                {list.length === 0 ? <p className="muted">Not enough posts to separate best from weakest yet.</p> : (
                  <ul>{list.map((p) => (
                    <li key={p.postId} className="row-between" style={{ gap: 12 }}>
                      <span><a href={p.url} target="_blank" rel="noreferrer">{p.hookUsed || p.title}</a></span>
                      <b>{x(p.multiple)}</b>
                    </li>
                  ))}</ul>
                )}
              </section>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
