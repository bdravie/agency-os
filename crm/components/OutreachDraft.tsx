"use client";

import { useState, useTransition } from "react";
import { ExternalLink } from "lucide-react";
import { markOutreachSent } from "@/lib/actions";
import { generateOutreachAction } from "@/lib/outreachActions";

type Draft = { subject: string; body: string };
type Route = { label: string; href: string };
type Kind = "first" | "followup" | "social";

export default function OutreachDraft({ companyId, to, recipients, routes, blocker }: {
  companyId: number; to: string | null; recipients: { id: number; name: string; role: string | null; email: string; openers: string[] }[]; routes: Route[]; blocker: string | null;
}) {
  const [kind, setKind] = useState<Kind>(to || routes.length === 0 ? "first" : "social");
  const [drafts, setDrafts] = useState<Record<Kind, Draft> | null>(null);   // nothing is written until you click Generate
  const [genError, setGenError] = useState<string | null>(null);
  const [generating, startGen] = useTransition();
  const [note, setNote] = useState<string | null>(null);
  const [toId, setToId] = useState("");
  const [pending, start] = useTransition();
  const chosen = recipients.find((r) => String(r.id) === toId) ?? null;
  const toEmail = chosen?.email ?? to;
  if (blocker) {
    return (
      <div className="stack" style={{ gap: 6 }} role="alert">
        <b style={{ color: "var(--bad)" }}>Outreach is blocked for this lead.</b>
        <span>{blocker}</span>
        <span className="muted">Drafts, copy buttons and &ldquo;mark as sent&rdquo; are switched off until this is resolved. See Compliance above.</span>
      </div>
    );
  }
  const generate = () => {
    if (drafts && !window.confirm("Write new drafts? This replaces the ones below, including any edits you made.")) return;
    setGenError(null);
    startGen(async () => {
      const r = await generateOutreachAction(companyId, chosen?.id ?? null);
      if (r.error || !r.drafts) { setGenError(r.error ?? "Could not write the drafts."); return; }
      setDrafts(r.drafts); setNote(null);
    });
  };
  if (!drafts) {
    return (
      <div className="stack" style={{ gap: 10 }}>
        {recipients.length > 0 ? (
          <label className="row" style={{ gap: 8 }}><span className="field-label" style={{ margin: 0 }}>Write it for</span>
            <select value={toId} onChange={(e) => setToId(e.target.value)} aria-label="Recipient"><option value="">The company{to ? `: ${to}` : ""}</option>{recipients.map((r) => <option key={r.id} value={r.id}>{r.name}{r.role ? `, ${r.role}` : ""}: {r.email}</option>)}</select></label>
        ) : <p className="muted" style={{ margin: 0 }}>No decision-makers saved yet. Find them first (Decision-makers above) so the message can be personal and start with their first name. You can still write a company-level draft now.</p>}
        <div className="row"><button type="button" onClick={generate} disabled={generating}>{generating ? "Writing…" : "Generate draft"}</button><span className="muted">Nothing is written until you click. Nothing is ever sent from here.</span></div>
        {genError && <p className="error" role="alert">{genError}</p>}
      </div>
    );
  }
  const d = drafts[kind];
  const isSocial = kind === "social";
  const unfilled = d.subject.match(/\{\{.*?\}\}/g) ?? d.body.match(/\{\{.*?\}\}/g);
  const set = (patch: Partial<Draft>) => setDrafts({ ...drafts, [kind]: { ...d, ...patch } });
  // Puts a rapport opening line right after the greeting, so you can then trim the template's own opening sentence.
  const useOpener = (line: string) => { const parts = d.body.split("\n\n"); parts.splice(1, 0, line); set({ body: parts.join("\n\n") }); setNote("Opening line added after the greeting. Check the rest still reads well."); };
  const openers = chosen?.openers ?? [];
  const copy = async (text: string, label: string) => { await navigator.clipboard.writeText(text); setNote(`${label} copied`); };
  const mailto = `mailto:${toEmail ?? ""}?subject=${encodeURIComponent(d.subject)}&body=${encodeURIComponent(d.body)}`;
  const missing = isSocial ? (routes.length === 0 ? "Add a company page or contact form first (Contact details above)." : null) : (!toEmail ? "Add a generic email on this company first, or reveal a decision-maker above." : null);
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
        <div className="stack" style={{ gap: 6 }}>
          {recipients.length > 0 ? (
            <label className="row" style={{ gap: 8 }}><span className="field-label" style={{ margin: 0 }}>To</span>
              <select value={toId} onChange={(e) => setToId(e.target.value)} aria-label="Recipient"><option value="">{to ? `Company: ${to}` : "Company (no generic email saved)"}</option>{recipients.map((r) => <option key={r.id} value={r.id}>{r.name}{r.role ? `, ${r.role}` : ""}: {r.email}</option>)}</select></label>
          ) : <p className="muted" style={{ margin: 0 }}>To: {to ?? "no generic email saved yet"}</p>}
          <p className="muted" style={{ margin: 0 }}>Nothing is sent from here: copy it or open it in your mail app, then mark it sent.</p>
        </div>
      )}
      {!isSocial && <input value={d.subject} onChange={(e) => set({ subject: e.target.value })} aria-label="Subject" />}
      <textarea rows={isSocial ? 8 : 12} value={d.body} onChange={(e) => set({ body: e.target.value })} aria-label="Message" />
      {openers.length > 0 && (
        <details open><summary>Opening lines for {chosen?.name.split(" ")[0]} (from published pages)</summary>
          <ul className="stack" style={{ gap: 6, marginTop: 8 }}>{openers.map((o, i) => <li key={i} className="row-between" style={{ gap: 10 }}><i>{o}</i><button type="button" className="secondary" onClick={() => useOpener(o)}>Use</button></li>)}</ul>
        </details>
      )}
      <p className="muted">{!isSocial && `${d.subject.length} characters in the subject · `}{d.body.split(/\s+/).filter(Boolean).length} words in the body{unfilled && " · placeholders still to fill in"}</p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {!isSocial && <button type="button" className="secondary" onClick={() => copy(d.subject, "Subject")}>Copy subject</button>}
        <button type="button" className="secondary" onClick={() => copy(d.body, "Message")}>Copy {isSocial ? "message" : "body"}</button>
        <button type="button" className="secondary" onClick={generate} disabled={generating}>{generating ? "Writing…" : "Write again"}</button>
        {!isSocial && <a href={mailto} aria-disabled={!toEmail}><button type="button" className="secondary" disabled={!toEmail}>Open in mail app</button></a>}
        <button type="button" disabled={pending || !!why} title={why ?? ""}
          onClick={() => start(async () => {
            try { await markOutreachSent(companyId, kind, d.subject, chosen?.id); setNote("Logged as sent"); }
            catch (err) { setNote(err instanceof Error ? err.message : String(err)); }
          })}>Mark as sent</button>
      </div>
      {why && <p className="muted">Mark as sent is off: {why}</p>}
      {note && <p className="muted">{note}</p>}
      {genError && <p className="error" role="alert">{genError}</p>}
    </div>
  );
}
