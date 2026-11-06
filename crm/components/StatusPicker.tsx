"use client";

import { useEffect, useRef, useState } from "react";
import { STAGE_META } from "@/lib/stages";

/** A coloured status pill. Click for a "Select an option" list with search; Enter picks the first match, Esc closes. */
export default function StatusPicker({ stage, stages, label, onPick, meta: metaMap = STAGE_META }: { stage: string; stages: readonly string[]; label: string; onPick: (s: string) => void; meta?: Record<string, { label: string; colour: string }> }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const box = useRef<HTMLSpanElement>(null);
  const meta = metaMap[stage] ?? { label: stage, colour: "var(--st-new)" };
  const options = stages.filter((s) => metaMap[s]?.label.toLowerCase().includes(q.trim().toLowerCase()));

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, [open]);

  const pick = (s: string) => { setOpen(false); setQ(""); if (s !== stage) onPick(s); };
  return (
    <span className="status-wrap" ref={box} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
      <button type="button" className="status-pill" style={{ background: meta.colour }} aria-haspopup="listbox" aria-expanded={open} aria-label={`${label}: ${meta.label}. Change status`} onClick={() => setOpen((o) => !o)}>{meta.label}</button>
      {open && (
        <div className="status-menu" role="listbox" aria-label="Select an option">
          <p className="status-menu-title">Select an option</p>
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Type to search…" aria-label="Search statuses"
            onKeyDown={(e) => { if (e.key === "Escape") setOpen(false); if (e.key === "Enter" && options[0]) pick(options[0]); }} />
          <div className="status-options">
            {options.map((s) => (
              <button key={s} type="button" role="option" aria-selected={s === stage} className={`status-option${s === stage ? " current" : ""}`} style={{ background: metaMap[s].colour }} onClick={() => pick(s)}>
                {metaMap[s].label}
              </button>
            ))}
            {options.length === 0 && <p className="muted" style={{ margin: 0 }}>No match</p>}
          </div>
        </div>
      )}
    </span>
  );
}
