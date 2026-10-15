import Link from "next/link";
import { GraduationCap, TriangleAlert } from "lucide-react";
import { query } from "@/lib/db";
import { dueForSession, loadTraining } from "@/lib/enablementData";
import { createSessionTask } from "@/lib/enablementActions";
import { OVERDUE_DAYS } from "@/lib/enablementMath";
import { longDate } from "@/lib/outcomeMath";
import ToastForm from "@/components/ToastForm";
import { EmptyState, PageHeader, Pill, Stat } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Enablement" };

export default async function Enablement() {
  const [rows, [{ n }]] = await Promise.all([
    loadTraining(),
    query<{ n: string }>(`SELECT count(*) AS n FROM enablement_sessions WHERE held_on > current_date - 30`),
  ]);
  const retained = rows.filter((r) => r.retained), due = dueForSession(rows);
  const staff = rows.reduce((t, r) => t + r.staff, 0);

  return (
    <>
      <PageHeader title="Enablement" description="Training you give clients: sessions, who attended, what you handed over, and who is overdue a session."
        actions={<Link href="/enablement/new" className="btn"><GraduationCap size={16} aria-hidden /> Open a client</Link>} />
      <section className="stats">
        <Stat label="Retained clients" value={retained.length} hint="active, with a monthly fee" />
        <Stat label={`${OVERDUE_DAYS}+ days without a session`} value={due.length} hint={due.length ? "see below" : "everyone is up to date"} />
        <Stat label="Sessions, last 30 days" value={Number(n)} />
        <Stat label="Staff being trained" value={staff} hint="across all clients" />
      </section>

      {due.length > 0 && (
        <section className="card" style={{ marginBottom: 20, borderColor: "var(--warn)" }}>
          <h2 className="row" style={{ gap: 8 }}><TriangleAlert size={18} aria-hidden style={{ color: "var(--warn)" }} /> Overdue a session</h2>
          <ul>{due.map((r) => (
            <li key={r.id} className="row-between" style={{ gap: 12 }}>
              <span style={{ flex: 1, minWidth: 260 }}>
                <Link href={`/enablement/${r.id}`}><b>{r.name}</b></Link><br />
                <span className="muted">{r.lastSession ? `Last session ${longDate(r.lastSession)} (${r.status.label})` : r.status.days === null ? "No session on record" : `No session yet, ${r.status.days} days since the service started`}{r.nextScheduled ? ` · next scheduled ${longDate(r.nextScheduled)}` : " · nothing scheduled"}</span>
              </span>
              <span className="row">
                <Link href={`/enablement/${r.id}#log`} className="btn secondary">Log a session</Link>
                <ToastForm action={createSessionTask} success="Task added for tomorrow"><input type="hidden" name="company_id" value={r.id} /><button className="secondary">Add task</button></ToastForm>
              </span>
            </li>
          ))}</ul>
        </section>
      )}

      {rows.length === 0 ? (
        <div className="card"><EmptyState title="No clients yet" icon={<GraduationCap size={22} />}>Once a client has a service, they appear here. Open one to log a session or hand over prompts and templates.</EmptyState></div>
      ) : (
        <section className="card">
          <div className="table-wrap"><table>
            <thead><tr><th>Client</th><th>Retained</th><th>Last session</th><th>Next scheduled</th><th>Staff</th><th>Avg skill</th></tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.id}>
                <td><Link href={`/enablement/${r.id}`}><b>{r.name}</b></Link></td>
                <td>{r.retained ? <Pill label="Retained" tone="good" /> : <Pill label="No retainer" tone="neutral" />}</td>
                <td>{r.lastSession ? <>{longDate(r.lastSession)} <span className="muted">· {r.status.label}</span></> : <span className="muted">None yet</span>} {r.status.due && <Pill label="Overdue" tone="warn" />}</td>
                <td className="muted">{r.nextScheduled ? longDate(r.nextScheduled) : "-"}</td>
                <td>{r.staff || <span className="muted">-</span>}</td>
                <td>{r.avgSkill ?? <span className="muted">-</span>}</td>
              </tr>
            ))}</tbody>
          </table></div>
        </section>
      )}
    </>
  );
}
