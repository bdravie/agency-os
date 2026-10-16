"use client";

import { useState, useTransition } from "react";
import { ExternalLink } from "lucide-react";
import { markOutreachSent } from "@/lib/actions";

type Draft = { subject: string; body: string };
type Route = { label: string; href: string };
type Kind = "first" | "followup" | "social";

export default function OutreachDraft({ companyId, to, first, followUp, social, routes, blocker }: {
  companyId: number; to: string | null; first: Draft; followUp: Draft; social: Draft; routes: Route[]; blocker: string | null;
}) {
  const [kind, setKind] = useState<Kind>(to || routes.length === 0 ? "first" : "social");
  const [drafts, setDrafts] = useState<Record<Kind, Draft>>({ first, followup: followUp, social });
  const [note, setNote] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const d = drafts[kind];
  if (blocker) {
    return (
      <div className="stack" style={{ gap: 6 }} role="alert">
        <b style={{ color: "var(--bad)" }}>Outreach is blocked for this lead.</b>
        <span>{blocker}</span>
        <span className="muted">Drafts, copy buttons and &ldquo;mark as sent&rdquo; are switched off until this is resolved. See Compliance above.</span>
      </div>
    );
  }
  const isSocial = kind === "social";
  const unfilled = d.subject.match(/\{\{.*?\}\}/g) ?? d.body.match(/\{\{.*?\}\}/g);
  const set = (patch: Partial<Draft>) => setDrafts({ ...drafts, [kind]: { ...d, ...patch } });
  const copy = async (text: string, label: string) => { await navigator.clipboard.writeText(text); setNote(`${label} copied`); };
  const mailto = `mailto:${to ?? ""}?subject=${encodeURIComponent(d.subject)}&body=${encodeURIComponent(d.body)}`;
  const missing = isSocial ? (routes.length === 0 ? "Add a company page or contact form first (Contact details above)." : null) : (!to ? "Add a generic email on this company first." : null);
  const why = blocker ?? missing ?? (unfilled ? `Fill in ${unfilled.length > 1 ? "the placeholders" : "the placeholder"} first: ${unfilled[0]}` : null);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div className="seg" role="tablist" aria-label="Message">
        <button type="button" role="tab" aria-selected={kind === "first"} onClick={() => setKind("first")}>First email</button>
        <button type="button" role="tab" aria-selected={kind === "followup"} onClick={() => setKind("followup")}>Follow-up email</button>
        <button type="button" role="tab" aria-selected={kind === "social"} onClick={() => setKind("social")}>Social message</button>
      </div>
      {isSocial ? (
        <p className="muted">
          Send it through their company page or contact form{routes.length ? ": " : "."}
          {routes.map((r, i) => <span key={r.label}>{i ? ", " : ""}<a href={r.href} target="_blank" rel="noreferrer">{r.label} <ExternalLink size={11} aria-hidden /></a></span>)}
          {" "}· Nothing is sent from here: copy it, send it yourself, then mark it sent.
        </p>
      ) : (
        <p className="muted">To: {to ?? "no generic email saved yet"} · Nothing is sent from here: copy it or open it in your mail app, then mark it sent.</p>
      )}
      {!isSocial && <input value={d.subject} onChange={(e) => set({ subject: e.target.value })} aria-label="Subject" />}
      <textarea rows={isSocial ? 8 : 12} value={d.body} onChange={(e) => set({ body: e.target.value })} aria-label="Message" />
      <p className="muted">{!isSocial && `${d.subject.length} characters in the subject · `}{d.body.split(/\s+/).filter(Boolean).length} words in the body{unfilled && " · placeholders still to fill in"}</p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {!isSocial && <button type="button" className="secondary" onClick={() => copy(d.subject, "Subject")}>Copy subject</button>}
        <button type="button" className="secondary" onClick={() => copy(d.body, "Message")}>Copy {isSocial ? "message" : "body"}</button>
        {!isSocial && <a href={mailto} aria-disabled={!to}><button type="button" className="secondary" disabled={!to}>Open in mail app</button></a>}
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
