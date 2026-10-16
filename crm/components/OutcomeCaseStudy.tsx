"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Lock, Sparkles } from "lucide-react";
import { draftCaseStudyAction, saveCaseStudy } from "@/lib/outcomeActions";
import type { CaseStudy } from "@/lib/outcomeData";
import ToastForm from "./ToastForm";
import CopyButton from "./CopyButton";
import { useToast } from "./Toast";

// Unlocked after 60 days of data and at least one clearly improved metric. Drafting uses Claude credits, so it only runs on click.
export default function OutcomeCaseStudy({ outcomeId, ready, reason, study, model, draftedAt, usage, modelName }: {
  outcomeId: number; ready: boolean; reason: string; study: CaseStudy | null; model: string | null; draftedAt: string | null; usage: { used: number; cap: number }; modelName: string;
}) {
  const toast = useToast(), router = useRouter();
  const [busy, setBusy] = useState(false);
  const [notes, setNotes] = useState<string[]>([]);
  const [, start] = useTransition();
  const run = () => { setBusy(true); setNotes([]); start(async () => {
    try {
      const r = await draftCaseStudyAction(outcomeId);
      if (r.error) { setNotes([r.error]); toast(r.error, "bad"); return; }
      toast("Case study drafted"); setNotes(r.warnings ?? []); router.refresh();
    } finally { setBusy(false); }
  }); };
  return (
    <div className="stack" style={{ gap: 14 }}>
      {!ready && <p className="muted row" style={{ margin: 0, gap: 8 }}><Lock size={15} aria-hidden /> {reason}</p>}
      {ready && (
        <div className="paid">
          <div className="field-label">Uses Claude credits · only when you click</div>
          <div className="row">
            <button type="button" disabled={busy || usage.used >= usage.cap} onClick={() => { if (study && !window.confirm("Draft again? This replaces the current case study and email.")) return; run(); }}>
              <Sparkles size={15} aria-hidden /> {busy ? "Drafting… (about 20 seconds)" : study ? "Draft again" : "Draft case study and testimonial request"}
            </button>
            <span className="muted">One call to <code>{modelName}</code> · {usage.used} of {usage.cap} used today.</span>
          </div>
        </div>
      )}
      {notes.length > 0 && <ul style={{ margin: 0 }}>{notes.map((n, i) => <li key={i} role="status" style={{ border: 0, padding: "2px 0", color: "var(--warn)" }}>{n}</li>)}</ul>}

      {study && (
        <ToastForm key={draftedAt ?? "x"} action={saveCaseStudy} success="Saved" className="stack" style={{ gap: 12 }}>
          <input type="hidden" name="id" value={outcomeId} />
          <p className="muted" style={{ margin: 0 }}>Draft only{model ? ` (${model})` : ""}. Check every figure, and get the client&apos;s written approval before publishing it or using their name.</p>
          <label className="stack" style={{ gap: 4 }}><span className="field-label">Headline</span><input name="headline" defaultValue={study.headline} maxLength={140} /></label>
          <label className="stack" style={{ gap: 4 }}><span className="field-label">The challenge</span><textarea name="challenge" rows={3} defaultValue={study.challenge} /></label>
          <label className="stack" style={{ gap: 4 }}><span className="field-label">What we did</span><textarea name="solution" rows={3} defaultValue={study.solution} /></label>
          <label className="stack" style={{ gap: 4 }}><span className="field-label">Results (one per line)</span><textarea name="results" rows={4} defaultValue={study.results.join("\n")} /></label>
          <div className="field-label" style={{ marginTop: 6 }}>Testimonial request email (you send it)</div>
          <label className="stack" style={{ gap: 4 }}><span className="field-label">Subject</span><input name="email_subject" defaultValue={study.email_subject} maxLength={140} /></label>
          <label className="stack" style={{ gap: 4 }}><span className="field-label">Body</span><textarea id="cs-email" name="email_body" rows={12} defaultValue={study.email_body} /></label>
          <div className="row"><button className="secondary">Save edits</button><CopyButton targetId="cs-email" /></div>
        </ToastForm>
      )}
    </div>
  );
}
