import { loadSiteTests } from "@/lib/siteTests";
import RefreshSiteStats from "@/components/RefreshSiteStats";
import { EmptyState, PageHeader } from "@/components/ui";
import { demoMode } from "@/lib/db";

export const dynamic = "force-dynamic";
export const metadata = { title: "Site tests" };

const pct = (n: number | null, dp = 1) => (n === null ? "–" : `${(n * 100).toFixed(dp)}%`);
const STATUS = {
  no_data: { text: "No visitors yet", tone: "neutral" },
  too_early: { text: "Too early", tone: "neutral" },
  keep_running: { text: "Keep running", tone: "warn" },
  leader: { text: "Clear leader", tone: "good" },
} as const;

export default async function SiteTests() {
  const { views, needsMigration } = await loadSiteTests();
  return (
    <>
      <PageHeader title="Site tests" description="Which version of clrsweb.uk gets more calls booked. Counts are anonymous: how many visited, clicked and booked, never who." actions={<RefreshSiteStats />} />
      {demoMode() && <p className="muted">Demo mode: these numbers are made up.</p>}
      {needsMigration && <div className="card"><p role="alert">The results table does not exist yet. Run <code>npm run db:migrate</code> from the repo root, then reload.</p></div>}
      {views.length === 0 ? (
        <div className="card"><EmptyState title="No tests set up">Add one to config/experiments.yaml.</EmptyState></div>
      ) : (
        <div className="stack">
          {views.map(({ experiment: e, result: r, fetchedAt }) => {
            const s = STATUS[r.status];
            const metric = e.rules.metric === "booked" ? "bookings" : "button clicks";
            return (
              <section key={e.id} className="card stack" style={{ gap: 12 }} aria-labelledby={`t-${e.id}`}>
                <div className="row-between">
                  <div>
                    <h2 id={`t-${e.id}`}>{e.hypothesis || e.id}</h2>
                    <p className="muted">Started {e.started} · day {r.days} · {e.status} · counting {metric}{fetchedAt ? ` · counts copied ${new Date(fetchedAt).toLocaleString("en-GB", { timeZone: "Europe/London" })}` : " · not fetched yet"}</p>
                  </div>
                  <span className={`badge tone-${s.tone}`}>{s.text}</span>
                </div>
                <p>{r.reason}</p>
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>Version</th><th>Angle</th><th className="num">Visitors</th><th className="num">Button clicks</th><th className="num">Bookings</th><th className="num">Booking rate</th><th className="num">Chance it is best</th></tr></thead>
                    <tbody>
                      {r.variants.map((v) => (
                        <tr key={v.id}>
                          <td><strong>{v.id.toUpperCase()}</strong>{e.variants[0].id === v.id && <span className="muted"> (control)</span>}{v.leader && <> <span className="badge tone-good">Leader</span></>}</td>
                          <td>{e.variants.find((x) => x.id === v.id)?.angle}</td>
                          <td className="num">{v.visitors}</td>
                          <td className="num">{v.clicks}</td>
                          <td className="num">{v.booked}</td>
                          <td className="num">{pct(v.visitors ? v.booked / v.visitors : null)}</td>
                          <td className="num">{r.status === "no_data" ? "–" : pct(v.chanceBest, 0)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="muted">A version is only called when each has {e.rules.minVisitors} visitors, the test has run {e.rules.minDays} days, and one reaches a {Math.round(e.rules.threshold * 100)}% chance of being best. Small differences need many more visitors than a cold-email list brings, so test big ideas.</p>
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}
