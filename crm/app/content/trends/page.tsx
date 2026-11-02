import Link from "next/link";
import { query } from "@/lib/db";
import { loadContentConfig } from "@/lib/content";
import { nicheLabel } from "@/lib/contentConfigMath";
import { AddTrend, RemoveTrend } from "@/components/TrendsPanel";
import { PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Trends" };

export default async function Trends() {
  const [config, rows] = await Promise.all([
    loadContentConfig(),
    query<any>(`SELECT t.id, t.title, t.detail, t.url, t.niche, t.seen_at, t.used_in_content_id, (t.seen_at > now() - interval '14 days') AS fresh FROM trend_signals t ORDER BY t.seen_at DESC LIMIT 60`),
  ]);
  return (
    <>
      <PageHeader
        back={{ href: "/content", label: "Content" }}
        title="Trends"
        description="Things you notice in your feed, in TikTok Creative Center or a trending sound. Anything from the last 14 days that you have not used feeds the next batch of ideas and the weekly brief."
        actions={<Link href="/content/brief" className="btn secondary">Weekly brief</Link>}
      />
      <div className="stack">
        <section className="card" aria-labelledby="add-h"><h2 id="add-h">Add a trend</h2><AddTrend niches={config.niches} /></section>
        <section className="card" aria-labelledby="list-h">
          <h2 id="list-h">Recent trends</h2>
          {rows.length === 0 ? <p className="muted">Nothing yet. Add the first one above.</p> : (
            <ul>
              {rows.map((t: any) => (
                <li key={t.id} className="row-between" style={{ gap: 12, alignItems: "flex-start", opacity: t.used_in_content_id || !t.fresh ? 0.6 : 1 }}>
                  <span>
                    <b>{t.title}</b>{t.niche && <span className="muted"> · {nicheLabel(t.niche)}</span>}
                    {t.detail && <div className="muted">{t.detail}</div>}
                    <div className="muted">
                      {new Date(t.seen_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                      {t.used_in_content_id ? <> · used in <Link href={`/content/${t.used_in_content_id}`}>an idea</Link></> : t.fresh ? " · available for ideas" : " · older than 14 days"}
                      {t.url && <> · <a href={t.url} target="_blank" rel="noreferrer">Link</a></>}
                    </div>
                  </span>
                  <RemoveTrend id={Number(t.id)} />
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="card"><h2>Reddit and search interest</h2>
          <p className="muted">Not set up. Reddit's free terms and sign-in rules and any search-interest source are being left until the manual list proves useful. See the pre-launch list in BUILD_PLAN.md.</p>
        </section>
      </div>
    </>
  );
}
