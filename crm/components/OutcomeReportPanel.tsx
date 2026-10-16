"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileDown, FileText, Sparkles } from "lucide-react";
import { draftMonthlyAction, saveNarrative, saveReportPdf } from "@/lib/outcomeActions";
import { monthLabel } from "@/lib/outcomeMath";
import ToastForm from "./ToastForm";
import { useToast } from "./Toast";

type Report = { wins: string[]; next_improvement: string | null; model: string | null };
type Doc = { id: number; filename: string; created_at: string; size_bytes: number };

// The one-page monthly report: pick a month, draft or write the wins and next improvement, then save the PDF.
export default function OutcomeReportPanel({ outcomeId, months, reports, docs, model, usage }: {
  outcomeId: number; months: string[]; reports: Record<string, Report>; docs: Doc[]; model: string; usage: { used: number; cap: number };
}) {
  const toast = useToast(), router = useRouter(), formEl = useRef<HTMLFormElement | null>(null);
  const [period, setPeriod] = useState(months[0]);
  const [busy, setBusy] = useState<"ai" | "pdf" | null>(null);
  const [notes, setNotes] = useState<string[]>([]);
  const [, start] = useTransition();
  const r = reports[period];

  if (months.length === 0) return <p className="muted" style={{ margin: 0 }}>Log at least one month of results to build a report.</p>;

  const draft = () => { setBusy("ai"); setNotes([]); start(async () => {
    try {
      const res = await draftMonthlyAction(outcomeId, period);
      if (res.error) { setNotes([res.error]); toast(res.error, "bad"); return; }
      toast("Wording drafted"); setNotes(res.warnings ?? []); router.refresh();
    } finally { setBusy(null); }
  }); };

  const pdf = () => { setBusy("pdf"); setNotes([]); start(async () => {
    try {
      const fd = new FormData(formEl.current!);
      const saved = (await saveNarrative(fd)) as { error?: string } | void;
      if (saved && saved.error) { setNotes([saved.error]); toast(saved.error, "bad"); return; }
      const res = await saveReportPdf(outcomeId, period);
      if (res.error || !res.documentId) { setNotes([res.error ?? "Could not build the PDF."]); toast(res.error ?? "Could not build the PDF.", "bad"); return; }
      toast("PDF saved to the client record"); if (res.note) setNotes([res.note]);
      window.open(`/documents/${res.documentId}`, "_blank"); router.refresh();
    } finally { setBusy(null); }
  }); };

  return (
    <div className="stack" style={{ gap: 14 }}>
      <label className="stack" style={{ gap: 4, alignSelf: "flex-start" }}><span className="field-label">Report month</span>
        <select value={period} onChange={(e) => { setPeriod(e.target.value); setNotes([]); }}>{months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}</select>
      </label>

      <ToastForm key={`${period}:${r?.wins.join("|")}:${r?.next_improvement}`} action={saveNarrative} success="Wording saved" className="stack" style={{ gap: 10 }}>
        <input type="hidden" name="outcome_id" value={outcomeId} /><input type="hidden" name="period" value={period} />
        <label className="stack" style={{ gap: 4 }}><span className="field-label">Wins (one per line, up to three)</span><textarea name="wins" rows={4} defaultValue={(r?.wins ?? []).join("\n")} placeholder="Missed calls fell from 20 to 8 a week." /></label>
        <label className="stack" style={{ gap: 4 }}><span className="field-label">Next improvement</span><textarea name="next_improvement" rows={3} defaultValue={r?.next_improvement ?? ""} placeholder="One concrete thing to improve next month." /></label>
        <div className="row">
          <button className="secondary" disabled={busy !== null}>Save wording</button>
          <button type="button" disabled={busy !== null} onClick={(e) => { formEl.current = e.currentTarget.closest("form"); pdf(); }}><FileDown size={15} aria-hidden /> {busy === "pdf" ? "Building…" : "Save report PDF"}</button>
          <span className="muted">Free. The numbers table is always worked out from your logged results.</span>
        </div>
      </ToastForm>

      <div className="paid">
        <div className="field-label">Uses Claude credits · only when you click</div>
        <div className="row">
          <button type="button" className="secondary" disabled={busy !== null || usage.used >= usage.cap} onClick={() => { if (r && (r.wins.length || r.next_improvement) && !window.confirm("Draft again? This replaces the wording for this month.")) return; draft(); }}>
            <Sparkles size={15} aria-hidden /> {busy === "ai" ? "Drafting… (about 15 seconds)" : r ? "Draft the wording again" : "Draft the wording with AI"}
          </button>
          <span className="muted">One call to <code>{model}</code> · {usage.used} of {usage.cap} used today. It writes wins and a next step; it never works out the numbers.</span>
        </div>
        {r?.model && <p className="muted" style={{ margin: "8px 0 0" }}>Drafted by {r.model}. Read it before sending.</p>}
      </div>
      {notes.length > 0 && <ul style={{ margin: 0 }}>{notes.map((n, i) => <li key={i} className="muted" role="status" style={{ border: 0, padding: "2px 0", color: "var(--warn)" }}>{n}</li>)}</ul>}

      {docs.length > 0 && (
        <div>
          <div className="field-label">Saved reports</div>
          <ul>{docs.map((d) => (
            <li key={d.id} className="row-between"><span className="row" style={{ gap: 6 }}><FileText size={14} aria-hidden /><a href={`/documents/${d.id}`} target="_blank" rel="noreferrer">{d.filename}</a></span><span className="muted">{new Date(d.created_at).toLocaleDateString("en-GB")} · {Math.round(d.size_bytes / 1024)} KB</span></li>
          ))}</ul>
        </div>
      )}
    </div>
  );
}
