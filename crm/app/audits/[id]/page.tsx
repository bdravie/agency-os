import Link from "next/link";
import { notFound } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import { query } from "@/lib/db";
import { loadAudit } from "@/lib/auditData";
import { saveAuditSettings } from "@/lib/auditActions";
import { signatureOf } from "@/lib/auditReport";
import { FREQUENCIES, SENSITIVITIES, label } from "@/lib/audit";
import { auditModel } from "@/lib/llm";
import { gbp } from "@/lib/quote";
import AuditTaskForm from "@/components/AuditTaskForm";
import AuditReportPanel from "@/components/AuditReportPanel";
import ToastForm from "@/components/ToastForm";
import { Badge, EmptyState, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const d = Number.isInteger(Number((await params).id)) ? await loadAudit(Number((await params).id)) : null;
  return { title: d ? `Audit: ${d.audit.company_name}` : "Audit" };
}

export default async function AuditPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const d = await loadAudit(id);
  if (!d) notFound();
  const { audit, tasks, params: p, ranked, summary, report } = d;
  const [docs, [{ n }]] = await Promise.all([
    query<any>(`SELECT id, filename, created_at, size_bytes FROM company_documents WHERE audit_id = $1 ORDER BY created_at DESC`, [id]),
    query<{ n: string }>(`SELECT count(*) AS n FROM activities WHERE type = 'audit_report_drafted' AND occurred_at::date = current_date`),
  ]);
  const maxScore = Math.max(1, ...ranked.map((t) => t.score));
  const top = ranked.filter((t) => t.top);
  const cap = Number(process.env.AUDIT_DAILY_CAP ?? 10) || 10;

  return (
    <>
      <PageHeader
        back={{ href: "/audits", label: "Audits" }}
        title={audit.title}
        description={<span className="row" style={{ gap: 10 }}><Link href={`/companies/${audit.company_id}`}>{audit.company_name}</Link>{audit.deal_id && <Link href={`/deals/${audit.deal_id}`}>Deal: {audit.deal_title}</Link>}<Badge value={audit.status === "intake" ? "Draft" : audit.status === "report_drafted" ? "Scripted" : "Won"} /><span className="muted">{audit.status === "intake" ? "Intake" : audit.status === "report_drafted" ? "Report drafted" : "Delivered"}</span></span>}
      />

      <div className="stack">
        <details className="card">
          <summary>Audit settings and business context</summary>
          <ToastForm action={saveAuditSettings} success="Settings saved" className="stack" style={{ gap: 10, marginTop: 12 }}>
            <input type="hidden" name="id" value={id} />
            <label className="stack" style={{ gap: 4 }}><span className="field-label">Title</span><input name="title" defaultValue={audit.title} required /></label>
            <label className="stack" style={{ gap: 4 }}><span className="field-label">What the business does (no personal details)</span><textarea name="context" rows={3} defaultValue={audit.context ?? ""} placeholder="e.g. A 12-person heating and plumbing firm. Jobs are booked by phone and scheduled in a spreadsheet; invoices go out from accounting software." /></label>
            <div className="row">
              <label className="stack" style={{ gap: 4 }}><span className="field-label">Value of an hour (£)</span><input name="hourly_rate" type="number" min="1" max="500" step="1" defaultValue={audit.rate} style={{ width: 130 }} /></label>
              <label className="stack" style={{ gap: 4 }}><span className="field-label">Share of task time that can be automated (%)</span><input name="automation_share" type="number" min="10" max="100" step="5" defaultValue={Math.round(audit.share * 100)} style={{ width: 130 }} /></label>
            </div>
            <p className="muted" style={{ margin: 0 }}>These two assumptions drive every saving shown here and in the report. They are planning estimates, not promises.</p>
            <button className="secondary" style={{ alignSelf: "flex-start" }}>Save settings</button>
          </ToastForm>
        </details>

        <section className="card">
          <h2>1 · Intake: the client&apos;s recurring tasks</h2>
          <p className="muted">One row per task. Use a role or team for &ldquo;done by&rdquo; (never a person&apos;s name), and don&apos;t enter emails or phone numbers. Ease is your 1–5 judgement; leave it on Auto to start from how often the task happens.</p>
          <div className="stack" style={{ gap: 10 }}>
            {tasks.map((t) => <AuditTaskForm key={`${t.id}:${t.name}:${t.hours_per_week}:${t.frequency}:${t.error_rate_pct}:${t.revenue_impact}:${t.data_sensitivity}:${t.ease}:${t.performed_by}`} auditId={id} task={t} />)}
            <AuditTaskForm auditId={id} />
          </div>
        </section>

        <section className="card">
          <h2>2 · Ranking</h2>
          {ranked.length === 0 ? (
            <EmptyState title="Nothing to rank yet">Add tasks above and they&apos;re scored and ranked here automatically.</EmptyState>
          ) : (
            <>
              <p className="muted">Score = hours saved × value × ease × data-sensitivity penalty. The top three are the best tasks that don&apos;t involve special-category data.</p>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>#</th><th>Task</th><th className="num">Hours/wk</th><th className="num">Saves h/wk</th><th className="num">Saves £/yr</th><th>Data</th><th>Score</th></tr></thead>
                  <tbody>
                    {ranked.map((t) => (
                      <tr key={t.id ?? t.name} className={t.eligible ? "" : "held"}>
                        <td>{t.rank}</td>
                        <td><b>{t.name}</b>{t.top && <> <span className="badge tone-good">Top {top.indexOf(t) + 1}</span></>}
                          <div className="muted">{[t.performed_by, label(FREQUENCIES, t.frequency).toLowerCase(), `ease ${t.ease_used}/5`, t.error_rate_pct ? `${t.error_rate_pct}% errors` : null].filter(Boolean).join(" · ")}</div>
                          {t.flags.filter((f) => !f.startsWith("High")).map((f) => <div key={f} className="muted row" style={{ gap: 4, alignItems: "flex-start" }}><ShieldAlert size={13} aria-hidden style={{ flex: "none", marginTop: 3 }} />{f}</div>)}
                        </td>
                        <td className="num">{t.hours_per_week}</td><td className="num">{t.hoursSavedWeek}</td><td className="num">{gbp(t.annualGbp)}</td>
                        <td><span className={`badge tone-${t.data_sensitivity === "none" ? "neutral" : t.data_sensitivity === "personal" ? "warn" : "bad"}`}>{label(SENSITIVITIES, t.data_sensitivity)}</span></td>
                        <td style={{ minWidth: 150 }}><div className="row" style={{ gap: 8 }}><span className={`rank-bar${t.eligible ? "" : " held"}`} style={{ flex: 1 }} title={`Score ${t.score}`}><i style={{ width: `${(t.score / maxScore) * 100}%` }} /></span><b>{t.score}</b></div></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="fees" style={{ marginTop: 12 }}>
                <div><span className="muted">Top three could save</span><b>{summary.topHoursWeek} h/week</b></div>
                <div><span className="muted">Worth about</span><b>{gbp(summary.topAnnualGbp)}<span className="muted">/yr</span></b></div>
                <div><span className="muted">Of recurring work listed</span><b>{summary.taskHoursWeek} h/week</b></div>
                {summary.held.length > 0 && <div><span className="muted">Held back (special category)</span><b>{summary.held.length}</b></div>}
              </div>
              <p className="muted" style={{ margin: "8px 0 0" }}>Assumes {Math.round(p.automationShare * 100)}% of task time can be automated, valued at {gbp(p.hourlyRate)} an hour over 46 working weeks.</p>
            </>
          )}
        </section>

        <section className="card">
          <h2>3 · Report</h2>
          <AuditReportPanel
            auditId={id} report={report} model={auditModel()} usage={{ used: Number(n), cap }} docs={docs} canDraft={top.length > 0}
            stale={!!report?.signature && report.signature !== signatureOf(ranked)} topNames={top.map((t) => t.name)}
          />
        </section>
      </div>
    </>
  );
}
