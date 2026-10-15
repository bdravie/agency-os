"use client";

import { useState } from "react";
import { LOST_REASONS } from "@/lib/stages";

// Losing a deal needs one of the standard reasons (the database enforces it too) and, optionally, a short note.
// The reasons feed the Funnel page, so they stay a fixed list.
export default function LostDialog({ title, onConfirm, onCancel }: { title: string; onConfirm: (reason: string, note: string) => void; onCancel: () => void }) {
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [tried, setTried] = useState(false);
  return (
    <div className="palette-wrap" role="dialog" aria-modal="true" aria-label="Why was it lost?" onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <form className="card stack dialog" onSubmit={(e) => { e.preventDefault(); if (!reason) { setTried(true); return; } onConfirm(reason, note.trim()); }}>
        <h2 style={{ margin: 0 }}>Why was it lost?</h2>
        <p className="muted">{title}</p>
        <div className="pills" role="radiogroup" aria-label="Reason">
          {LOST_REASONS.map((r) => (
            <button key={r.code} type="button" role="radio" aria-checked={reason === r.code} className={`pill${reason === r.code ? " on" : ""}`} onClick={() => setReason(r.code)}>{r.label}</button>
          ))}
        </div>
        {tried && !reason && <p className="error" role="alert">Choose a reason first.</p>}
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="What happened? A short note helps you spot patterns later." aria-label="Note" maxLength={500} autoFocus />
        <div className="row"><button>Mark as lost</button><button type="button" className="secondary" onClick={onCancel}>Cancel</button></div>
      </form>
    </div>
  );
}
