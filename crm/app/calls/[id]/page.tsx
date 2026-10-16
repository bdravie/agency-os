import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarClock, Quote, X } from "lucide-react";
import { query } from "@/lib/db";
import { addCallObjection, deleteCall, purgeTranscript, removeCallObjection, saveCallEdits } from "@/lib/callActions";
import { callsModel } from "@/lib/llm";
import { dateOnly } from "@/lib/format";
import CallAnalyseButton from "@/components/CallAnalyseButton";
import ToastForm from "@/components/ToastForm";
import ConfirmButton from "@/components/ConfirmButton";
import { EmptyState, PageHeader, Pill } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function CallPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ note?: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const note = (await searchParams).note;
  const [call] = await query<any>(
    `SELECT c.*, c.follow_up_on::text AS follow_day, co.name AS company_name, d.title AS deal_title
       FROM calls c JOIN companies co ON co.id = c.company_id LEFT JOIN deals d ON d.id = c.deal_id WHERE c.id = $1`, [id]);
  if (!call) notFound();
  const [objections, library, [task], [{ n }]] = await Promise.all([
    query<any>(`SELECT x.id, x.quote, o.id AS oid, o.name, o.best_response FROM call_objections x JOIN objections o ON o.id = x.objection_id WHERE x.call_id = $1 ORDER BY x.id`, [id]),
    query<{ name: string }>(`SELECT name FROM objections ORDER BY name`),
    call.follow_up_task_id ? query<any>(`SELECT title, due_at, done_at FROM tasks WHERE id = $1`, [call.follow_up_task_id]) : Promise.resolve([undefined]),
    query<{ n: string }>(`SELECT count(*) AS n FROM activities WHERE type = 'call_analysed' AND occurred_at::date = current_date`),
  ]);
  const usage = { used: Number(n), cap: Number(process.env.CALLS_DAILY_CAP ?? 20) || 20 };
  const analysed = call.status === "analysed";
  const pains = call.pains as { pain: string; quote: string | null }[], budget = call.budget_signals as { signal: string; quote: string | null }[];

  return (
    <>
      <PageHeader
        back={{ href: "/calls", label: "Calls" }}
        title={call.title}
        description={<span className="row" style={{ gap: 10 }}>
          <Link href={`/companies/${call.company_id}`}>{call.company_name}</Link>
          {call.deal_id && <Link href={`/deals/${call.deal_id}`}>Deal: {call.deal_title}</Link>}
          <span>{dateOnly(call.occurred_at)}</span>
          <Pill label={analysed ? "Analysed" : call.status === "failed" ? "Analysis failed" : "Saved"} tone={analysed ? "good" : call.status === "failed" ? "bad" : "neutral"} />
        </span>}
      />
      {note && <div className="next" role="status" style={{ marginBottom: 16 }}><div><div className="next-label">Note</div><b style={{ fontWeight: 550 }}>{note}</b></div></div>}

      <div className="stack">
        {!analysed && (
          <section className="card">
            <h2>Analyse this call</h2>
            <p className="muted">{call.source === "notes" ? "Your notes" : "The transcript"} ({call.transcript_chars.toLocaleString("en-GB")} characters) will be read for pains, budget signals, objections and the agreed next step, and a follow-up task is created.</p>
            <CallAnalyseButton callId={id} again={false} model={callsModel()} usage={usage} hasTranscript={!!call.transcript} />
          </section>
        )}

        {analysed && (
          <>
            <section className="card">
              <h2>Summary and next step</h2>
              <ToastForm action={saveCallEdits} success="Saved" className="stack" style={{ gap: 10 }}>
                <input type="hidden" name="id" value={id} />
                <label className="stack" style={{ gap: 4 }}><span className="field-label">Summary</span><textarea name="summary" rows={3} defaultValue={call.summary ?? ""} /></label>
                <div className="row">
                  <label className="stack" style={{ gap: 4, flex: 1, minWidth: 260 }}><span className="field-label">Agreed next step</span><input name="next_step" defaultValue={call.next_step ?? ""} placeholder="Nothing agreed" /></label>
                  <label className="stack" style={{ gap: 4 }}><span className="field-label">Follow-up date</span><input name="follow_up_on" type="date" defaultValue={call.follow_day ?? ""} /></label>
                </div>
                <div className="row">
                  <button className="secondary">Save</button>
                  {call.follow_up_assumed && <Pill label="Date assumed: none was agreed" tone="warn" />}
                  {task && <span className="row muted" style={{ gap: 6 }}><CalendarClock size={14} aria-hidden /><Link href="/tasks">Task</Link>: {task.title} · due {dateOnly(task.due_at)}{task.done_at ? " · done" : ""}</span>}
                </div>
              </ToastForm>
            </section>

            <div className="grid">
              <section className="card">
                <h2>Pains</h2>
                {pains.length === 0 ? <p className="muted">None mentioned.</p> : <ul>{pains.map((p, i) => (
                  <li key={i}>{p.pain}{p.quote && <div className="muted row" style={{ gap: 6, alignItems: "flex-start" }}><Quote size={12} aria-hidden style={{ flex: "none", marginTop: 4 }} />&ldquo;{p.quote}&rdquo;</div>}</li>
                ))}</ul>}
              </section>
              <section className="card">
                <h2>Budget signals</h2>
                {budget.length === 0 ? <p className="muted">Nothing said about budget.</p> : <ul>{budget.map((b, i) => (
                  <li key={i}>{b.signal}{b.quote && <div className="muted row" style={{ gap: 6, alignItems: "flex-start" }}><Quote size={12} aria-hidden style={{ flex: "none", marginTop: 4 }} />&ldquo;{b.quote}&rdquo;</div>}</li>
                ))}</ul>}
              </section>
            </div>
          </>
        )}

        {analysed && (
          <section className="card">
            <div className="row-between"><h2 style={{ margin: 0 }}>Objections raised</h2><Link href="/objections" className="muted">Objection Library</Link></div>
            {objections.length === 0 && <p className="muted" style={{ marginTop: 10 }}>No objections raised on this call.</p>}
            <div className="stack" style={{ gap: 10, marginTop: 10 }}>
              {objections.map((o: any) => (
                <div key={o.id} className="offer-line">
                  <div className="row-between">
                    <b><Link href={`/objections#o${o.oid}`}>{o.name}</Link></b>
                    <ToastForm action={removeCallObjection} success="Removed" className="row"><input type="hidden" name="id" value={o.id} /><button className="link" aria-label={`Remove ${o.name}`} title="Remove from this call"><X size={15} /></button></ToastForm>
                  </div>
                  {o.quote && <div className="muted row" style={{ gap: 6, alignItems: "flex-start" }}><Quote size={12} aria-hidden style={{ flex: "none", marginTop: 4 }} />&ldquo;{o.quote}&rdquo;</div>}
                  {o.best_response
                    ? <div className="response-box"><span className="field-label">Your best response</span><p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{o.best_response}</p></div>
                    : <p className="muted" style={{ margin: "6px 0 0" }}>No best response saved yet. <Link href={`/objections#o${o.oid}`}>Write one in the library</Link>.</p>}
                </div>
              ))}
            </div>
            <ToastForm action={addCallObjection} success="Objection added" reset className="row" style={{ marginTop: 12 }}>
              <input type="hidden" name="call_id" value={id} />
              <input name="name" list="objection-names" placeholder="Add an objection the AI missed…" aria-label="Objection" style={{ flex: 1, minWidth: 220 }} />
              <datalist id="objection-names">{library.map((l) => <option key={l.name} value={l.name} />)}</datalist>
              <input name="quote" placeholder="Quote (optional)" aria-label="Quote" style={{ flex: 1, minWidth: 180 }} />
              <button className="secondary">Add</button>
            </ToastForm>
          </section>
        )}

        {analysed && <CallAnalyseButton callId={id} again model={callsModel()} usage={usage} hasTranscript={!!call.transcript} />}

        <details className="card">
          <summary>{call.source === "notes" ? "Your notes" : "Transcript"} ({call.transcript_chars.toLocaleString("en-GB")} characters)</summary>
          {call.transcript ? <pre className="script-box" style={{ marginTop: 12, maxHeight: 420 }}>{call.transcript}</pre>
            : <p className="muted" style={{ marginTop: 10 }}>The text was removed. The analysis above is kept.</p>}
          <div className="row" style={{ marginTop: 12 }}>
            {call.transcript && <ToastForm action={purgeTranscript} success="Transcript text removed" confirm="Remove the transcript text? The analysis stays, but you won't be able to analyse this call again." className="row"><input type="hidden" name="id" value={id} /><button className="secondary">Remove the text, keep the analysis</button></ToastForm>}
            <form action={deleteCall}><input type="hidden" name="id" value={id} /><ConfirmButton className="link" title="Delete this call completely" message="Delete this call completely, including its transcript and analysis? This can't be undone.">Delete call</ConfirmButton></form>
          </div>
          <p className="muted" style={{ marginBottom: 0 }}>Contact details and speaker names were masked before this was saved. The original upload was not kept.</p>
        </details>
      </div>
    </>
  );
}
