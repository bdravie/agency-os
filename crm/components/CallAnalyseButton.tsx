"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import { analyseCallAction } from "@/lib/callActions";
import { useToast } from "./Toast";

// Runs the AI analysis. It uses Claude credits, so it only happens when you click.
export default function CallAnalyseButton({ callId, again, model, usage, hasTranscript }: { callId: number; again: boolean; model: string; usage: { used: number; cap: number }; hasTranscript: boolean }) {
  const toast = useToast();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [, start] = useTransition();
  const capped = usage.used >= usage.cap;
  return (
    <div className="paid">
      <div className="field-label">Uses Claude credits · only when you click</div>
      <div className="row">
        <button type="button" disabled={busy || capped || !hasTranscript} onClick={() => {
          if (again && !window.confirm("Analyse again? This replaces the summary, pains, objections and the follow-up task details with a fresh result.")) return;
          setBusy(true); setNote(null);
          start(async () => {
            try {
              const r = await analyseCallAction(callId);
              if (r.error) { setNote(r.error); toast(r.error, "bad"); } else { toast("Call analysed"); if (r.note) setNote(r.note); router.refresh(); }
            } finally { setBusy(false); }
          });
        }}><Sparkles size={15} aria-hidden /> {busy ? "Analysing… (about 20 seconds)" : again ? "Analyse again" : "Analyse with AI"}</button>
        <span className="muted">One call to <code>{model}</code> · {usage.used} of {usage.cap} used today. It also creates the follow-up task.</span>
      </div>
      {!hasTranscript && <p className="muted" style={{ margin: "8px 0 0" }}>The transcript text was removed, so it can&apos;t be analysed again.</p>}
      {note && <p className={note.includes("didn't") || note.includes("cap") || note.includes("removed") ? "error" : "muted"} role="status" style={{ margin: "8px 0 0" }}>{note}</p>}
    </div>
  );
}
