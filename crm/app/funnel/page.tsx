import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { loadFunnel, type Basis } from "@/lib/funnel";
import { days, pct, type By } from "@/lib/funnelMath";
import { gbp } from "@/lib/quote";
import Bars from "@/components/Bars";
import { EmptyState, PageHeader, Stat } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Funnel" };

type SP = { by?: string; offset?: string; basis?: string };

export default async function Funnel({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const by: By = sp.by === "week" || sp.by === "all" ? sp.by : "month";
  const offset = by === "all" ? 0 : Math.min(0, Math.max(-60, Number(sp.offset) || 0));
  const basis: Basis = sp.basis === "moved" ? "moved" : "created";
  const d = await loadFunnel(by, offset, basis);
  const href = (o: Partial<{ by: string; offset: number; basis: string }>) => `/funnel?${new URLSearchParams({ by, offset: String(offset), basis, ...Object.fromEntries(Object.entries(o).map(([k, v]) => [k, String(v)])) })}`;
  const lostTotal = d.lostReasons.reduce((s, r) => s + r.n, 0);
  const empty = d.rows[0].reached === 0 && d.deals === 0;

  return (
    <>
      <PageHeader title="Funnel" description="How deals move through the pipeline, where they stall, why they're lost and which channels work." />

      <div className="filter-bar">
        <div className="seg" role="group" aria-label="Period">
          {(["week", "month", "all"] as const).map((b) => <Link key={b} href={href({ by: b, offset: 0 })} aria-current={by === b ? "true" : undefined} className={by === b ? "on" : ""}>{b === "all" ? "All time" : b === "week" ? "Week" : "Month"}</Link>)}
        </div>
        {by !== "all" && (
          <div className="row" style={{ gap: 4 }}>
            <Link href={href({ offset: offset - 1 })} className="btn secondary" aria-label={`Previous ${by}`}><ChevronLeft size={16} aria-hidden /></Link>
            <span className="period-label">{d.range.label}</span>
            {offset < 0 ? <Link href={href({ offset: offset + 1 })} className="btn secondary" aria-label={`Next ${by}`}><ChevronRight size={16} aria-hidden /></Link> : <span className="btn secondary disabled" aria-hidden><ChevronRight size={16} /></span>}
          </div>
        )}
        <div className="seg" role="group" aria-label="What to count" style={{ marginLeft: "auto" }}>
          <Link href={href({ basis: "created" })} className={basis === "created" ? "on" : ""} aria-current={basis === "created" ? "true" : undefined} title="Deals added in this period, and how far each has got since">Deals created</Link>
          <Link href={href({ basis: "moved" })} className={basis === "moved" ? "on" : ""} aria-current={basis === "moved" ? "true" : undefined} title="Stage moves that happened in this period, whatever the deal's age">Stage moves</Link>
        </div>
      </div>

      <section className="stats" aria-label="Headline numbers">
        <Stat label={basis === "created" ? "Deals created" : "Deals with a stage move"} value={d.deals} hint={`${d.open} still open`} />
        <Stat label="Close rate" value={pct(d.closeRate)} hint={d.won + d.lost ? `${d.won} won · ${d.lost} lost` : "No closed deals yet"} />
        <Stat label="Average days to win" value={days(d.avgDaysToWin)} hint="from creation to Won" />
        <Stat label="Won value" value={gbp(d.wonSetup)} hint={`+ ${gbp(d.wonMonthly)}/mo`} />
      </section>

      {empty ? (
        <div className="card"><EmptyState title="No deals in this period">Try another week or month, or switch to All time. Deals appear here as you add them and move them through the pipeline.</EmptyState></div>
      ) : (
        <div className="stack">
          <section className="card">
            <h2>Conversion between stages</h2>
            <p className="muted">{basis === "created" ? "Deals created in this period, and how many reached each stage." : "Deals that moved into each stage during this period."} Each stage shows its share of the one before.{basis === "moved" && " In this view a percentage can pass 100%, because deals that move into a stage this period may have entered the previous one earlier."}</p>
            <Bars ariaLabel="Deals reaching each stage" items={d.rows.map((r) => ({
              label: r.label, value: r.reached, display: String(r.reached),
              sub: r.pctPrev === null ? "" : `${pct(r.pctPrev)} of ${d.rows[d.rows.indexOf(r) - 1].label}`,
              tip: `${r.label}: ${r.reached} deal${r.reached === 1 ? "" : "s"}${r.pctPrev === null ? "" : `, ${pct(r.pctPrev)} of the previous stage, ${pct(r.pctLead)} of ${d.rows[0].label}`}`,
            }))} />
          </section>

          <div className="grid">
            <section className="card">
              <h2>Average days in each stage</h2>
              <Bars ariaLabel="Average days in each stage" items={d.durations.map((s) => ({
                label: s.label, value: s.avgDays ?? 0, display: days(s.avgDays), sub: s.n ? `${s.n} move${s.n === 1 ? "" : "s"} timed` : s.current ? `${s.current} there now` : "",
                tip: s.avgDays === null ? `${s.label}: no timed moves yet` : `${s.label}: ${days(s.avgDays)} on average across ${s.n} timed stay${s.n === 1 ? "" : "s"}`,
              }))} />
              <p className="muted" style={{ marginTop: 10 }}>Only moves made since stage history was switched on are timed.</p>
            </section>

            <section className="card">
              <h2>Top reasons deals are lost</h2>
              {lostTotal === 0 ? <p className="muted">No lost deals in this period.</p> : (
                <>
                  <Bars ariaLabel="Lost reasons" max={Math.max(...d.lostReasons.map((r) => r.n))} items={d.lostReasons.map((r) => ({
                    label: r.label, value: r.n, display: String(r.n), sub: pct(r.pct), tip: `${r.label}: ${r.n} of ${lostTotal} lost deal${lostTotal === 1 ? "" : "s"} (${pct(r.pct)})`,
                  }))} />
                  {d.lostNotes.length > 0 && (
                    <ul style={{ marginTop: 12 }}>{d.lostNotes.map((n) => <li key={n.id}><Link href={`/deals/${n.id}`}>{n.title}</Link><div className="muted">{n.note}</div></li>)}</ul>
                  )}
                </>
              )}
            </section>
          </div>

          <section className="card table-wrap">
            <h2>By outreach channel</h2>
            <table>
              <thead><tr><th>Channel</th><th className="num">Deals</th><th className="num">Contacted</th><th className="num">Reply rate</th><th className="num">Calls booked</th><th className="num">Won</th><th className="num">Close rate</th><th className="num">Won value</th></tr></thead>
              <tbody>
                {d.channels.map((c) => (
                  <tr key={c.code} className={c.deals === 0 ? "dim" : ""}>
                    <td><b>{c.label}</b></td><td className="num">{c.deals}</td><td className="num">{c.contacted}</td><td className="num">{pct(c.replyRate)}</td>
                    <td className="num">{c.calls}</td><td className="num">{c.won}</td><td className="num">{pct(c.closeRate)}</td>
                    <td className="num">{c.won ? `${gbp(c.wonSetup)} + ${gbp(c.wonMonthly)}/mo` : "–"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="muted" style={{ marginTop: 10 }}>Reply rate is replied ÷ contacted. Close rate is won ÷ (won + lost). Set the channel on a deal when you create it, or on its page; if you don&apos;t, it&apos;s guessed from your first logged email or message to the company. Deals made before channels existed show as &ldquo;Not set&rdquo;.</p>
          </section>

          <details className="card">
            <summary>Show the funnel as a table</summary>
            <div className="table-wrap" style={{ marginTop: 12 }}>
              <table>
                <thead><tr><th>Stage</th><th className="num">Reached</th><th className="num">% of previous</th><th className="num">% of first stage</th><th className="num">Avg days in stage</th></tr></thead>
                <tbody>{d.rows.map((r) => {
                  const dur = d.durations.find((x) => x.stage === r.stage);
                  return <tr key={r.stage}><td>{r.label}</td><td className="num">{r.reached}</td><td className="num">{pct(r.pctPrev)}</td><td className="num">{pct(r.pctLead)}</td><td className="num">{dur ? days(dur.avgDays) : "–"}</td></tr>;
                })}</tbody>
              </table>
            </div>
          </details>
        </div>
      )}

      <p className="muted" style={{ marginTop: 18 }}>
        Stage moves are recorded automatically from the day this was switched on. Deals that existed before then count as having reached only their current stage, and their earlier moves can&apos;t be timed.
      </p>
    </>
  );
}
