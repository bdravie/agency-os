"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileDown, Sparkles } from "lucide-react";
import { draftReportAction, savePdfAction, saveReportEdits } from "@/lib/auditActions";
import type { Report } from "@/lib/auditReport";
import ToastForm from "./ToastForm";
import { useToast } from "./Toast";

type Doc = { id: number; filename: string; created_at: string; size_bytes: number };

// The AI draft, your edits, and the saved PDFs. Drafting uses Claude credits, so it only runs when you click.
export default function AuditReportPanel({ auditId, report, model, usage, stale, docs, canDraft, topNames }: {
  auditId: number; report: Report | null; model: string; usage: { used: number; cap: number }; stale: boolean; docs: Doc[]; canDraft: boolean; topNames: string[];
}) {
  const toast = useToast();
  const router = useRouter();
  const [warnings, setWarnings] = useState<string[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState<"draft" | "pdf" | null>(null);
  const [, start] = useTransition();
  const capped = usage.used >= usage.cap;

  const draft = () => {
    if (report && !window.confirm("Draft again? This replaces the current text, including any edits you made.")) return;
    setBusy("draft"); setNote(null);
    start(async () => {
      try {
        const r = await draftReportAction(auditId);
        if (r.error) { setNote(r.error); toast(r.error, "bad"); } else { setWarnings(r.warnings ?? []); toast("Report drafted"); router.refresh(); }
      } finally { setBusy(null); }
    });
  };
  const savePdf = () => {
    setBusy("pdf"); setNote(null);
    start(async () => {
      try {
        const r = await savePdfAction(auditId);
        if (r.error || !r.documentId) { setNote(r.error ?? "Could not build the PDF."); toast(r.error ?? "Could not build the PDF.", "bad"); return; }
        toast("PDF saved to the client record");
        if (r.note) setNote(r.note);
        window.open(`/documents/${r.documentId}`, "_blank");
        router.refresh();
      } finally { setBusy(null); }
    });
  };

  return (
    <div className="stack" style={{ gap: 14 }}>
      <div className="paid">
        <div className="field-label">Uses Claude credits · only when you click</div>
        <div className="row">
          <button type="button" disabled={!canDraft || capped || busy !== null} onClick={draft}>
            <Sparkles size={15} aria-hidden /> {busy === "draft" ? "Drafting… (about 20 seconds)" : report ? "Draft again with AI" : "Draft report with AI"}
          </button>
          <span className="muted">One call to <code>{model}</code> · {usage.used} of {usage.cap} used today. It writes the wording only; every number is calculated here.</span>
        </div>
        {!canDraft && <p className="muted" style={{ margin: "8px 0 0" }}>Add at least one task that can be automated first.</p>}
      </div>

      {note && <p className="error" role="alert" style={{ margin: 0 }}>{note}</p>}
      {warnings.map((w) => <p key={w} className="error" role="alert" style={{ margin: 0 }}>{w}</p>)}
      {report && stale && <p className="error" role="alert" style={{ margin: 0 }}>The tasks or scores changed since this draft was written. Draft again, or check the text still fits.</p>}

      {report && (
        <ToastForm action={saveReportEdits} success="Edits saved" className="report-form stack" style={{ gap: 12 }}>
          <input type="hidden" name="id" value={auditId} />
          <label>Summary<textarea name="summary" rows={3} defaultValue={report.summary} /></label>
          {report.opportunities.map((o, i) => (
            <div key={i} className="stack" style={{ gap: 8, padding: 12, border: "1px solid var(--line-soft)", borderRadius: "var(--radius-sm)" }}>
              <b>{i + 1}. {topNames[i] ?? o.task}</b>
              <label>Why it is worth automating<textarea name={`why_${i}`} rows={2} defaultValue={o.why} /></label>
              <label>How it could be automated<textarea name={`approach_${i}`} rows={2} defaultValue={o.approach} /></label>
            </div>
          ))}
          <div className="grid">
            <label>Recommended build: name<input type="text" name="build_name" defaultValue={report.build.name} /></label>
            <label>Timeline (weeks)<input type="number" name="build_weeks" min="1" max="12" defaultValue={report.build.timeline_weeks} style={{ width: 120 }} /></label>
          </div>
          <label>Build description<textarea name="build_description" rows={2} defaultValue={report.build.description} /></label>
          <label>Build scope (one per line)<textarea name="build_scope" rows={5} defaultValue={report.build.scope.join("\n")} /></label>
          <label>Training needs (one per line)<textarea name="training" rows={4} defaultValue={report.training.join("\n")} /></label>
          <label>Risks (one per line, as: risk | how we handle it)<textarea name="risks" rows={5} defaultValue={report.risks.map((r) => `${r.risk} | ${r.mitigation}`).join("\n")} /></label>
          <label>Next steps (one per line)<textarea name="next_steps" rows={3} defaultValue={report.next_steps.join("\n")} /></label>
          <label className="row" style={{ flexDirection: "row", gap: 8 }}><input type="checkbox" name="show_price" defaultChecked={report.show_price !== false} /> Show the indicative Build price range in the PDF</label>
          <div className="row"><button className="secondary">Save edits</button>
            <button type="button" disabled={busy !== null} onClick={savePdf}><FileDown size={15} aria-hidden /> {busy === "pdf" ? "Building PDF…" : "Save PDF to client record"}</button>
            <span className="muted">Save your edits first, then build the PDF. It&apos;s two pages, and a copy stays on the client.</span>
          </div>
        </ToastForm>
      )}

      {docs.length > 0 && (
        <div>
          <div className="field-label">Saved PDFs</div>
          <ul>{docs.map((d) => (
            <li key={d.id} className="row-between"><a href={`/documents/${d.id}`} target="_blank" rel="noreferrer">{d.filename}</a>
              <span className="row"><span className="muted">{new Date(d.created_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })} · {Math.round(d.size_bytes / 1024)} KB</span><a href={`/documents/${d.id}?download=1`}>Download</a></span></li>
          ))}</ul>
        </div>
      )}
    </div>
  );
}
