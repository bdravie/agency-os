"use client";

import { useState, useTransition } from "react";
import { markOutreachSent } from "@/lib/actions";

type Draft = { subject: string; body: string };

export default function OutreachDraft({ companyId, to, first, followUp, blocker }: {
  companyId: number; to: string | null; first: Draft; followUp: Draft; blocker: string | null;
}) {
  const [kind, setKind] = useState<"first" | "followup">("first");
  const [drafts, setDrafts] = useState({ first, followup: followUp });
  const [note, setNote] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const d = drafts[kind];
  const unfilled = d.subject.match(/\{\{.*?\}\}/g) ?? d.body.match(/\{\{.*?\}\}/g);
  const set = (patch: Partial<Draft>) => setDrafts({ ...drafts, [kind]: { ...d, ...patch } });
  const copy = async (text: string, label: string) => { await navigator.clipboard.writeText(text); setNote(`${label} copied`); };
  const mailto = `mailto:${to ?? ""}?subject=${encodeURIComponent(d.subject)}&body=${encodeURIComponent(d.body)}`;
  const why = blocker ?? (!to ? "Add a generic email on this company first." : unfilled ? `Fill in ${unfilled.length > 1 ? "the placeholders" : "the placeholder"} first: ${unfilled[0]}` : null);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div className="seg" role="tablist" aria-label="Email">
        <button type="button" role="tab" aria-selected={kind === "first"} onClick={() => setKind("first")}>First email</button>
        <button type="button" role="tab" aria-selected={kind === "followup"} onClick={() => setKind("followup")}>Follow-up (3–4 days later)</button>
      </div>
      <p className="muted">To: {to ?? "no generic email saved yet"} · Nothing is sent from here: copy it or open it in your mail app, then mark it sent.</p>
      <input value={d.subject} onChange={(e) => set({ subject: e.target.value })} />
      <textarea rows={12} value={d.body} onChange={(e) => set({ body: e.target.value })} />
      <p className="muted">{d.subject.length} characters in the subject · {d.body.split(/\s+/).filter(Boolean).length} words in the body{unfilled && " · placeholders still to fill in"}</p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="button" className="secondary" onClick={() => copy(d.subject, "Subject")}>Copy subject</button>
        <button type="button" className="secondary" onClick={() => copy(d.body, "Body")}>Copy body</button>
        <a href={mailto} aria-disabled={!to}><button type="button" className="secondary" disabled={!to}>Open in mail app</button></a>
        <button type="button" disabled={pending || !!why} title={why ?? ""}
          onClick={() => start(async () => {
            try { await markOutreachSent(companyId, kind, d.subject); setNote("Logged as sent"); }
            catch (err) { setNote(err instanceof Error ? err.message : String(err)); }
          })}>Mark as sent</button>
      </div>
      {why && <p className="muted">Mark as sent is off: {why}</p>}
      {note && <p className="muted">{note}</p>}
    </div>
  );
}
