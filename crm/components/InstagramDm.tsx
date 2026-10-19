"use client";

import { useState, useTransition } from "react";
import { ExternalLink } from "lucide-react";
import { markOutreachSent } from "@/lib/actions";
import { draftInstagramDmAction, type DmResult } from "@/lib/dmActions";

// An AI-drafted Instagram DM for the company's account. Nothing is sent from here: copy it, send it yourself in Instagram, then mark it sent.
export default function InstagramDm({ companyId, instagramUrl, cap }: { companyId: number; instagramUrl: string; cap: number }) {
  const [res, setRes] = useState<DmResult | null>(null);
  const [first, setFirst] = useState(""), [follow, setFollow] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [pending, start] = useTransition(), [marking, startMark] = useTransition();
  const draft = () => start(async () => {
    setNote(null);
    const r = await draftInstagramDmAction(companyId);
    setRes(r);
    if (r.draft) { setFirst(r.draft.first); setFollow(r.draft.followUp); }
  });
  const copy = async (t: string, label: string) => { await navigator.clipboard.writeText(t); setNote(`${label} copied`); };
  const d = res?.draft;
  return (
    <div className="stack" style={{ gap: 8, marginTop: 18, paddingTop: 14, borderTop: "1px solid var(--line, #2a2f3a)" }}>
      <div className="row-between">
        <b>Instagram DM</b>
        <a href={instagramUrl} target="_blank" rel="noreferrer" className="muted">Open their Instagram <ExternalLink size={11} aria-hidden /></a>
      </div>
      <p className="muted" style={{ margin: 0 }}>Drafts a short first message and one follow-up from your saved research, for you to edit and send by hand. It can&apos;t see their Instagram, so add one real detail from it yourself. Uses an AI credit; up to {cap} a day.</p>
      <div><button type="button" className="secondary" disabled={pending} onClick={draft}>{pending ? "Drafting…" : d ? "Draft again" : "Draft Instagram DM"}</button></div>
      {res?.error && <p role="alert" className="error" style={{ margin: 0 }}>{res.error}</p>}
      {d && (
        <>
          {d.warnings.map((w) => <p key={w} role="status" className="muted" style={{ margin: 0, color: "var(--warn)" }}>{w}</p>)}
          <label className="stack" style={{ gap: 4 }}><span className="field-label" style={{ margin: 0 }}>First message</span>
            <textarea rows={9} value={first} onChange={(e) => setFirst(e.target.value)} aria-label="First Instagram message" /></label>
          <p className="muted" style={{ margin: 0 }}>{first.split(/\s+/).filter(Boolean).length} words · drafted by {res?.model}</p>
          {follow && <label className="stack" style={{ gap: 4 }}><span className="field-label" style={{ margin: 0 }}>Follow-up (send once, 3 to 4 days later, only if no reply)</span>
            <textarea rows={6} value={follow} onChange={(e) => setFollow(e.target.value)} aria-label="Instagram follow-up message" /></label>}
          {d.checkFirst.length > 0 && <div><b>Check on their Instagram before sending</b><ul style={{ margin: "4px 0 0" }}>{d.checkFirst.map((c) => <li key={c} className="muted">{c}</li>)}</ul></div>}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" className="secondary" onClick={() => copy(first, "First message")}>Copy first message</button>
            {follow && <button type="button" className="secondary" onClick={() => copy(follow, "Follow-up")}>Copy follow-up</button>}
            <button type="button" disabled={marking} onClick={() => startMark(async () => {
              try { await markOutreachSent(companyId, "social", ""); setNote("Logged as sent, and a follow-up task is set for 4 days"); }
              catch (err) { setNote(err instanceof Error ? err.message : String(err)); }
            })}>Mark first DM as sent</button>
          </div>
        </>
      )}
      {note && <p className="muted" style={{ margin: 0 }}>{note}</p>}
    </div>
  );
}
