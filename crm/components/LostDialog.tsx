"use client";

import { useState } from "react";

const REASONS = ["Too expensive", "No response", "Chose someone else", "Bad timing", "Not a fit"];

// Asks why a deal was lost. Shared by the board and the deal page.
export default function LostDialog({ title, onConfirm, onCancel }: { title: string; onConfirm: (reason: string) => void; onCancel: () => void }) {
  const [reason, setReason] = useState("");
  return (
    <div className="palette-wrap" role="dialog" aria-modal="true" aria-label="Why was it lost?" onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <form className="card stack dialog" onSubmit={(e) => { e.preventDefault(); onConfirm(reason.trim()); }}>
        <h2 style={{ margin: 0 }}>Why was it lost?</h2>
        <p className="muted">{title}</p>
        <div className="pills">
          {REASONS.map((r) => <button key={r} type="button" className={`pill${reason === r ? " on" : ""}`} onClick={() => setReason(r)}>{r}</button>)}
        </div>
        <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Or type a reason (optional)" aria-label="Reason" autoFocus />
        <div className="row"><button>Mark as lost</button><button type="button" className="secondary" onClick={onCancel}>Cancel</button></div>
      </form>
    </div>
  );
}
