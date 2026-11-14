"use client";

import { useState, useTransition } from "react";
import { ExternalLink } from "lucide-react";
import { draftLinkedInNoteAction, markLinkedInNoteSentAction, type NoteResult } from "@/lib/linkedinNoteActions";
import { NOTE_MAX, noteWarnings } from "@/lib/linkedinNoteMath";
import RefusalText from "@/components/RefusalText";

// A LinkedIn connection note, drafted on your click (docs/NICHE_FOCUS_PLAN.md, N2). Nothing is sent from here:
// copy it, send it yourself on LinkedIn, then log it so it counts as a touch.
export default function LinkedInNote({ companyId, people, linkedinUrl, cap }: {
  companyId: number; people: { id: number; name: string; role: string | null }[]; linkedinUrl: string | null; cap: number;
}) {
  const [who, setWho] = useState<string>(people[0] ? String(people[0].id) : "");
  const [res, setRes] = useState<NoteResult | null>(null);
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition(), [marking, startMark] = useTransition();
  const contactId = who ? Number(who) : null;
  const draft = () => start(async () => {
    setMsg(null);
    const r = await draftLinkedInNoteAction(companyId, contactId);
    setRes(r);
    if (r.note) setNote(r.note);
  });
  const warnings = note ? noteWarnings(note) : [];
  return (
    <div className="stack" style={{ gap: 8, marginTop: 18, paddingTop: 14, borderTop: "1px solid var(--line)" }}>
      <div className="row-between">
        <b>LinkedIn connection note</b>
        {linkedinUrl && <a href={linkedinUrl} target="_blank" rel="noreferrer" className="muted">Open their LinkedIn page <ExternalLink size={11} aria-hidden /></a>}
      </div>
      <p className="muted" style={{ margin: 0 }}>Drafts a short note to send with a connection request, with your name, business name and the opt-out line added. You send it yourself on LinkedIn. Uses an AI credit; up to {cap} a day.</p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "end" }}>
        <label className="stack" style={{ gap: 3 }}><span className="field-label" style={{ margin: 0 }}>For</span>
          <select value={who} onChange={(e) => setWho(e.target.value)} aria-label="Who the note is for">
            {people.map((p) => <option key={p.id} value={p.id}>{p.name}{p.role ? `, ${p.role}` : ""}</option>)}
            <option value="">No one named (Hi there)</option>
          </select></label>
        <button type="button" className="secondary" disabled={pending} onClick={draft}>{pending ? "Drafting…" : res?.note ? "Draft again" : "Draft LinkedIn note"}</button>
      </div>
      {res?.error && <p role="alert" className="error" style={{ margin: 0 }}><RefusalText text={res.error} /></p>}
      {res?.note && (
        <>
          <textarea rows={6} value={note} onChange={(e) => setNote(e.target.value)} aria-label="LinkedIn connection note" />
          <p className="muted" style={{ margin: 0, color: note.length > NOTE_MAX ? "var(--bad)" : undefined }}>{note.length} / {NOTE_MAX} characters · drafted by {res.model}</p>
          {warnings.map((w) => <p key={w} role="status" className="muted" style={{ margin: 0, color: "var(--warn)" }}>{w}</p>)}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" className="secondary" onClick={async () => { await navigator.clipboard.writeText(note); setMsg("Note copied"); }}>Copy note</button>
            <button type="button" disabled={marking} onClick={() => startMark(async () => {
              const r = await markLinkedInNoteSentAction(companyId, contactId);
              setMsg(r.error ?? "Logged as sent");
            })}>I&apos;ve sent it</button>
          </div>
          {res.followUp && (
            <details>
              <summary>Follow-up to send once they accept</summary>
              <p style={{ whiteSpace: "pre-wrap", margin: "8px 0" }}>{res.followUp}</p>
              <button type="button" className="secondary" onClick={async () => { await navigator.clipboard.writeText(res.followUp!); setMsg("Follow-up copied"); }}>Copy follow-up</button>
            </details>
          )}
        </>
      )}
      {msg && <p className="muted" style={{ margin: 0 }}><RefusalText text={msg} /></p>}
    </div>
  );
}
