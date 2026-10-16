import Link from "next/link";
import { TrendingUp, TriangleAlert } from "lucide-react";
import { query } from "@/lib/db";
import { loadOutcomes } from "@/lib/outcomeData";
import { createCheckInTask } from "@/lib/outcomeActions";
import { fmtValue, monthLabel } from "@/lib/outcomeMath";
import OutcomeState from "@/components/OutcomeState";
import ToastForm from "@/components/ToastForm";
import { EmptyState, PageHeader, Pill, Stat } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Outcomes" };

export default async function Outcomes() {
  const [all, untracked] = await Promise.all([
    loadOutcomes(),
    query<{ id: number; name: string }>(`SELECT c.id, c.name FROM companies c WHERE c.status = 'Client' AND NOT EXISTS (SELECT 1 FROM outcomes o WHERE o.company_id = c.id) ORDER BY c.name LIMIT 12`),
  ]);
  const active = all.filter((l) => l.outcome.status === "active");
  const flagged = active.filter((l) => l.assessment.flagged);
  const improving = active.filter((l) => l.assessment.state === "improving").length;

  return (
    <>
      <PageHeader title="Outcomes" description="Before-and-after results for each client: the proof that the work paid off, and an early warning when it hasn't."
        actions={<Link href="/outcomes/new" className="btn"><TrendingUp size={16} aria-hidden /> Start tracking a client</Link>} />
      <section className="stats">
        <Stat label="Clients tracked" value={active.length} hint={`${all.length - active.length} paused or ended`} />
        <Stat label="Need attention" value={flagged.length} hint={flagged.length ? "flat, slipping or no data" : "nobody is flat right now"} />
        <Stat label="Clearly improving" value={improving} hint="at least one metric 10%+ better" />
      </section>

      {flagged.length > 0 && (
        <section className="card" style={{ marginBottom: 20, borderColor: "var(--warn)" }}>
          <h2 className="row" style={{ gap: 8 }}><TriangleAlert size={18} aria-hidden style={{ color: "var(--warn)" }} /> Step in before they churn</h2>
          <ul>{flagged.map((l) => (
            <li key={l.outcome.id} className="row-between" style={{ gap: 12 }}>
              <span className="row" style={{ gap: 10, flex: 1, minWidth: 260 }}>
                <OutcomeState state={l.assessment.state} />
                <span><Link href={`/outcomes/${l.outcome.id}`}><b>{l.outcome.company_name}</b></Link><br /><span className="muted">{l.assessment.headline}</span></span>
              </span>
              <ToastForm action={createCheckInTask} success="Check-in task added for tomorrow"><input type="hidden" name="id" value={l.outcome.id} /><button className="secondary">Add check-in task</button></ToastForm>
            </li>
          ))}</ul>
        </section>
      )}

      {untracked.length > 0 && (
        <section className="card" style={{ marginBottom: 20 }}>
          <h2>Clients with no results tracking yet</h2>
          <p className="muted" style={{ marginTop: 0 }}>Record the baseline at kickoff so later months have something to be compared with.</p>
          <div className="row">{untracked.map((c) => <Link key={c.id} href={`/outcomes/new?company=${c.id}`} className="btn secondary">{c.name}</Link>)}</div>
        </section>
      )}

      {all.length === 0 ? (
        <div className="card"><EmptyState title="No results tracked yet" icon={<TrendingUp size={22} />}>Start with a client you have just kicked off: record today&apos;s missed calls, response time, bookings and admin hours, then log the same numbers each month.</EmptyState></div>
      ) : (
        <section className="card">
          <div className="table-wrap"><table>
            <thead><tr><th>Client</th><th>Status</th><th>Day</th><th>Best result so far</th><th>Last logged</th></tr></thead>
            <tbody>{all.map((l) => {
              const best = l.assessment.metrics.filter((m) => m.latest).sort((a, b) => (b.imp ?? 0) - (a.imp ?? 0))[0];
              return (
                <tr key={l.outcome.id}>
                  <td><Link href={`/outcomes/${l.outcome.id}`}><b>{l.outcome.company_name}</b></Link>{l.outcome.status !== "active" && <> <Pill label={l.outcome.status === "paused" ? "Paused" : "Ended"} tone="neutral" /></>}</td>
                  <td><OutcomeState state={l.assessment.state} /></td>
                  <td>{l.assessment.days}</td>
                  <td>{best ? <>{best.name}: {fmtValue(best.baseline, best.unit)} → <b>{fmtValue(best.latest!.value, best.unit)}</b> <span className="muted">({best.moved})</span></> : <span className="muted">Nothing logged yet</span>}</td>
                  <td className="muted">{l.assessment.latestPeriod ? monthLabel(l.assessment.latestPeriod) : "-"}</td>
                </tr>
              );
            })}</tbody>
          </table></div>
        </section>
      )}
    </>
  );
}
