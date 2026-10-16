import Link from "next/link";
import { notFound } from "next/navigation";
import { TriangleAlert } from "lucide-react";
import { query } from "@/lib/db";
import { loadOutcome, todayIso } from "@/lib/outcomeData";
import { addMetric, createCheckInTask, deleteMetric, deleteOutcome, saveMetric, saveOutcomeSettings } from "@/lib/outcomeActions";
import { CASE_STUDY_DAYS, addMonths, fmtNum, fmtValue, longDate, monthLabel, monthStart, type Verdict } from "@/lib/outcomeMath";
import { outcomesModel } from "@/lib/llm";
import ConfirmButton from "@/components/ConfirmButton";
import OutcomeCaseStudy from "@/components/OutcomeCaseStudy";
import OutcomeLogForm from "@/components/OutcomeLogForm";
import OutcomeReportPanel from "@/components/OutcomeReportPanel";
import OutcomeSpark from "@/components/OutcomeSpark";
import OutcomeState from "@/components/OutcomeState";
import ToastForm from "@/components/ToastForm";
import { PageHeader, Pill } from "@/components/ui";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const l = Number.isInteger(id) ? await loadOutcome(id) : null;
  return { title: l ? `Results: ${l.outcome.company_name}` : "Outcomes" };
}

const TONE: Record<Verdict, "good" | "warn" | "bad"> = { better: "good", flat: "warn", worse: "bad" };
const WORD: Record<Verdict, string> = { better: "Better", flat: "About the same", worse: "Worse" };

export default async function OutcomePage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const l = await loadOutcome(id);
  if (!l) notFound();
  const { outcome: o, metrics, assessment: a } = l;
  const today = todayIso(), thisMonth = monthStart(today);

  const [reportRows, docs, [{ n }]] = await Promise.all([
    query<any>(`SELECT to_char(period, 'YYYY-MM-DD') AS period, wins, next_improvement, model FROM outcome_reports WHERE outcome_id = $1`, [id]),
    query<any>(`SELECT id, filename, created_at, size_bytes FROM company_documents WHERE outcome_id = $1 AND kind = 'client_report' ORDER BY created_at DESC`, [id]),
    query<{ n: string }>(`SELECT count(*) AS n FROM activities WHERE type = 'outcome_ai_drafted' AND occurred_at::date = current_date`),
  ]);
  const reports = Object.fromEntries(reportRows.map((r: any) => [r.period, { wins: r.wins as string[], next_improvement: r.next_improvement, model: r.model }]));
  const usage = { used: Number(n), cap: Number(process.env.OUTCOMES_DAILY_CAP ?? 20) || 20 };
  const loggedMonths = [...new Set(metrics.flatMap((m) => m.readings.map((r) => r.period)))].sort().reverse();

  // Table columns: kickoff month up to this month, newest six.
  const cols: string[] = [];
  for (let p = monthStart(o.kickoff_on); p <= thisMonth && cols.length < 60; p = addMonths(p, 1)) cols.push(p);
  const shown = cols.slice(-6);
  const kickoffMonth = monthStart(o.kickoff_on);
  const defaultMonth = (a.dueMonth ?? (loggedMonths[0] ?? addMonths(thisMonth, -1))).slice(0, 7);

  return (
    <>
      <PageHeader back={{ href: "/outcomes", label: "Outcomes" }} title={o.title}
        description={<span className="row" style={{ gap: 10 }}><Link href={`/companies/${o.company_id}`}>{o.company_name}</Link>{o.deal_id && <Link href={`/deals/${o.deal_id}`}>Won deal</Link>}<OutcomeState state={a.state} />{o.status !== "active" && <Pill label={o.status === "paused" ? "Paused" : "Ended"} tone="neutral" />}<span className="muted">Kickoff {longDate(o.kickoff_on)} · day {a.days}</span></span>} />

      <div className="stack">
        {a.flagged && o.status === "active" && (
          <section className="card" style={{ borderColor: "var(--warn)" }}>
            <div className="row-between">
              <div className="row" style={{ gap: 8 }}><TriangleAlert size={18} aria-hidden style={{ color: "var(--warn)" }} /><b>Worth stepping in:</b> {a.headline}</div>
              <ToastForm action={createCheckInTask} success="Check-in task added for tomorrow"><input type="hidden" name="id" value={id} /><button className="secondary">Add check-in task</button></ToastForm>
            </div>
          </section>
        )}

        <section className="card">
          <div className="row-between"><h2 style={{ margin: 0 }}>Before and now</h2><span className="muted">{a.headline}</span></div>
          <div className="table-wrap" style={{ marginTop: 10 }}><table>
            <thead><tr><th>Metric</th><th>Before</th>{shown.map((p) => <th key={p}>{monthLabel(p, true)}</th>)}<th>Change</th><th>Trend</th></tr></thead>
            <tbody>{metrics.map((m, i) => {
              const r = a.metrics[i];
              const byPeriod = new Map(m.readings.map((x) => [x.period, x.value]));
              const series = m.readings.filter((x) => x.period >= kickoffMonth).map((x) => x.value);
              return (
                <tr key={m.id}>
                  <td><b>{m.name}</b><br /><span className="muted">{m.better} is better</span></td>
                  <td>{fmtValue(m.baseline, m.unit)}</td>
                  {shown.map((p) => <td key={p} className={byPeriod.has(p) ? "" : "muted"}>{byPeriod.has(p) ? fmtNum(byPeriod.get(p)!) : "-"}</td>)}
                  <td>{r.verdict ? <><Pill label={WORD[r.verdict]} tone={TONE[r.verdict]} /> <span className="muted">{r.moved}</span></> : <span className="muted">No results yet</span>}</td>
                  <td><OutcomeSpark baseline={m.baseline} points={series} tone={r.verdict === "better" ? "good" : r.verdict === "worse" ? "bad" : "flat"} /></td>
                </tr>
              );
            })}</tbody>
          </table></div>
          <p className="muted" style={{ marginBottom: 0 }}>Better or worse means 10% or more in the good direction; anything in between counts as about the same.</p>
        </section>

        <section className="card">
          <h2>Log results</h2>
          {a.dueMonth && o.status === "active" && <p style={{ marginTop: 0, color: "var(--warn)" }}>Due: {monthLabel(a.dueMonth)} hasn&apos;t been logged yet.</p>}
          <OutcomeLogForm outcomeId={id} defaultMonth={defaultMonth} minMonth={kickoffMonth.slice(0, 7)} maxMonth={thisMonth.slice(0, 7)}
            metrics={metrics.map((m) => ({ id: m.id, name: m.name, unit: m.unit, readings: Object.fromEntries(m.readings.map((r) => [r.period, r.value])) }))} />
        </section>

        <section className="card">
          <h2>One-page monthly report</h2>
          <p className="muted" style={{ marginTop: 0 }}>Before vs now, wins and one next improvement, as a PDF you send yourself. A copy is kept on the client record.</p>
          <OutcomeReportPanel outcomeId={id} months={loggedMonths} reports={reports} docs={docs} model={outcomesModel()} usage={usage} />
        </section>

        <section className="card">
          <h2>Case study and testimonial request</h2>
          <p className="muted" style={{ marginTop: 0 }}>Available once there are {CASE_STUDY_DAYS} days of data and a clearly improved metric. Drafts only: you send the email, and the client approves the case study before it goes anywhere.</p>
          <OutcomeCaseStudy outcomeId={id} ready={a.caseStudy.ready} reason={a.caseStudy.reason} study={o.case_study} model={o.case_study_model} draftedAt={o.case_study_at ? String(o.case_study_at) : null} usage={usage} modelName={outcomesModel()} />
        </section>

        <details className="card">
          <summary>Settings, metrics and baselines</summary>
          <div className="stack" style={{ gap: 18, marginTop: 12 }}>
            <ToastForm action={saveOutcomeSettings} success="Settings saved" className="stack" style={{ gap: 10 }}>
              <input type="hidden" name="id" value={id} />
              <div className="row">
                <label className="stack" style={{ gap: 4, flex: 1, minWidth: 220 }}><span className="field-label">Title</span><input name="title" defaultValue={o.title} required /></label>
                <label className="stack" style={{ gap: 4 }}><span className="field-label">Kickoff date</span><input name="kickoff_on" type="date" defaultValue={o.kickoff_on} required /></label>
                <label className="stack" style={{ gap: 4 }}><span className="field-label">Status</span><select name="status" defaultValue={o.status}><option value="active">Active</option><option value="paused">Paused</option><option value="ended">Ended</option></select></label>
                <label className="stack" style={{ gap: 4 }}><span className="field-label">Testimonial</span><select name="testimonial_status" defaultValue={o.testimonial_status}><option value="not_asked">Not asked</option><option value="requested">Requested</option><option value="received">Received</option><option value="declined">Declined</option></select></label>
              </div>
              <label className="stack" style={{ gap: 4 }}><span className="field-label">What was set up</span><textarea name="built" rows={2} defaultValue={o.built ?? ""} /></label>
              <button className="secondary" style={{ alignSelf: "flex-start" }}>Save settings</button>
            </ToastForm>

            <div className="stack" style={{ gap: 8 }}>
              <div className="field-label">Metrics and baselines</div>
              {metrics.map((m) => (
                <div key={m.id} className="row" style={{ gap: 8 }}>
                  <ToastForm action={saveMetric} success="Metric saved" className="row" style={{ flex: 1 }}>
                    <input type="hidden" name="id" value={m.id} />
                    <input name="name" defaultValue={m.name} maxLength={80} style={{ flex: 1, minWidth: 200 }} aria-label="Name" />
                    <input name="unit" defaultValue={m.unit} maxLength={20} style={{ width: 90 }} aria-label="Unit" />
                    <select name="better" defaultValue={m.better} aria-label="Better"><option value="lower">Lower is better</option><option value="higher">Higher is better</option></select>
                    <input name="baseline" type="number" min="0" step="any" defaultValue={fmtNum(m.baseline)} style={{ width: 100 }} aria-label="Baseline" />
                    <button className="secondary">Save</button>
                  </ToastForm>
                  <ToastForm action={deleteMetric} success="Metric removed" confirm={`Remove “${m.name}” and all its logged results?`}><input type="hidden" name="id" value={m.id} /><button className="link">Remove</button></ToastForm>
                </div>
              ))}
              <ToastForm action={addMetric} success="Metric added" reset className="row">
                <input type="hidden" name="outcome_id" value={id} />
                <input name="name" placeholder="New metric name" maxLength={80} style={{ flex: 1, minWidth: 200 }} aria-label="New metric name" required />
                <input name="unit" placeholder="Unit" maxLength={20} style={{ width: 90 }} aria-label="Unit" />
                <select name="better" defaultValue="higher" aria-label="Better"><option value="higher">Higher is better</option><option value="lower">Lower is better</option></select>
                <input name="baseline" type="number" min="0" step="any" placeholder="Baseline" style={{ width: 100 }} aria-label="Baseline" required />
                <button className="secondary">Add</button>
              </ToastForm>
            </div>

            <form action={deleteOutcome}>
              <input type="hidden" name="id" value={id} />
              <ConfirmButton message="Delete this results record and all its logged numbers? Saved PDFs stay on the client record." className="link">Delete this results record</ConfirmButton>
            </form>
          </div>
        </details>
      </div>
    </>
  );
}
