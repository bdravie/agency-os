"use client";

import { useEffect, useState, useTransition } from "react";
import { X } from "lucide-react";
import { createIdeaAction } from "@/lib/actions";
import { useToast } from "./Toast";

const FORMATS = ["Show the build", "Build in public", "Teach / steal this", "Niche pain"];

export default function NewIdeaDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (id: number) => void }) {
  const toast = useToast();
  const [idea, setIdea] = useState("");
  const [format, setFormat] = useState(FORMATS[0]);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="palette-wrap" role="dialog" aria-modal="true" aria-label="New idea" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <form className="card stack dialog" style={{ width: "min(520px, calc(100vw - 32px))" }} onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await createIdeaAction(idea, format);
          if (r.error || !r.id) { setError(r.error ?? "Could not save the idea."); return; }
          toast("Idea added");
          onCreated(r.id);
        });
      }}>
        <div className="row-between"><h2 style={{ margin: 0 }}>New idea</h2><button type="button" className="icon-btn" aria-label="Close" onClick={onClose}><X size={18} /></button></div>
        <div>
          <label className="field-label" htmlFor="ni-idea">What's the video about?</label>
          <textarea id="ni-idea" rows={3} value={idea} onChange={(e) => setIdea(e.target.value)} placeholder="One sentence, e.g. Show how a weekly client report builds itself in 40 seconds" autoFocus style={{ width: "100%" }} />
        </div>
        <div>
          <div className="field-label">Type</div>
          <div className="pills">{FORMATS.map((f) => <button key={f} type="button" className={`pill${format === f ? " on" : ""}`} onClick={() => setFormat(f)}>{f}</button>)}</div>
        </div>
        {error && <p className="error" role="alert">{error}</p>}
        <div className="row"><button disabled={pending}>{pending ? "Saving…" : "Add idea"}</button><button type="button" className="secondary" onClick={onClose}>Cancel</button></div>
      </form>
    </div>
  );
}
