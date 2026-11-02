"use client";

import { useEffect, useState, useTransition } from "react";
import { X } from "lucide-react";
import { markPosted } from "@/lib/contentPostActions";
import { moveContent } from "@/lib/actions";
import { PLATFORM_LABEL, type Platform } from "@/lib/contentMath";
import { useToast } from "./Toast";

const localNow = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };

// Opens when a card is moved to Posted. Paste the link for each platform you posted on and the hook you used. You post by hand: this only records it.
export default function PostedDialog({ itemId, idea, hook: initialHook, hookAlt, platforms, onClose, onDone }: { itemId: number; idea: string; hook: string | null; hookAlt: string | null; platforms: string[]; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [hook, setHook] = useState(initialHook ?? "");
  const [ab, setAb] = useState<Record<string, "A" | "B">>({});
  const test = !!(initialHook && hookAlt);
  const [at, setAt] = useState(localNow());
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const entries = platforms.filter((p) => (urls[p] ?? "").trim()).map((p) => ({ platform: p, url: urls[p], hook: test ? (ab[p] === "B" ? hookAlt! : initialHook!) : undefined }));

  function save() {
    start(async () => {
      const r = await markPosted(itemId, entries, hook, at ? new Date(at).toISOString() : null);
      if (!r.ok) { setError(r.error); return; }
      toast(r.message);
      onDone();
    });
  }
  function skip() {
    start(async () => {
      try { await moveContent(itemId, "Posted"); toast("Moved to Posted. Add the links from the item when you have them."); onDone(); }
      catch (e) { setError(e instanceof Error ? e.message : "Could not move it."); }
    });
  }

  return (
    <div className="palette-wrap" role="dialog" aria-modal="true" aria-label="Mark as posted" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <form className="card stack dialog" style={{ width: "min(560px, calc(100vw - 32px))" }} onSubmit={(e) => { e.preventDefault(); if (!entries.length) { setError("Paste at least one link, or skip the links for now."); return; } save(); }}>
        <div className="row-between"><h2 style={{ margin: 0 }}>Mark as posted</h2><button type="button" className="icon-btn" aria-label="Close" onClick={onClose}><X size={18} /></button></div>
        <p className="muted" style={{ margin: 0 }}>{idea}</p>
        {platforms.map((p, i) => (
          <div key={p}>
            <label className="field-label" htmlFor={`pd-${p}`}>{PLATFORM_LABEL[p as Platform] ?? p} link (leave blank if you did not post there)</label>
            <input id={`pd-${p}`} type="url" inputMode="url" value={urls[p] ?? ""} onChange={(e) => { setUrls({ ...urls, [p]: e.target.value }); setError(null); }} placeholder="https://" autoFocus={i === 0} style={{ width: "100%" }} />
            {test && (urls[p] ?? "").trim() && (
              <div className="pills" style={{ marginTop: 6 }} role="radiogroup" aria-label={`Which hook went on ${PLATFORM_LABEL[p as Platform] ?? p}`}>
                {(["A", "B"] as const).map((k) => (
                  <button key={k} type="button" role="radio" aria-checked={(ab[p] ?? "A") === k} className={`pill${(ab[p] ?? "A") === k ? " on" : ""}`} onClick={() => setAb({ ...ab, [p]: k })}>Hook {k}: {k === "A" ? initialHook : hookAlt}</button>
                ))}
              </div>
            )}
          </div>
        ))}
        {test ? <p className="muted" style={{ margin: 0 }}>This idea has two hooks. Choose which one went on each platform, so What's working can compare them.</p> : (
          <div>
            <label className="field-label" htmlFor="pd-hook">Hook you used (the first line)</label>
            <input id="pd-hook" value={hook} onChange={(e) => setHook(e.target.value)} style={{ width: "100%" }} />
          </div>
        )}
        <div>
          <label className="field-label" htmlFor="pd-at">Posted at</label>
          <input id="pd-at" type="datetime-local" value={at} max={localNow()} onChange={(e) => setAt(e.target.value)} />
        </div>
        {error && <p className="error" role="alert">{error}</p>}
        <div className="row" style={{ flexWrap: "wrap" }}>
          <button disabled={pending}>{pending ? "Saving…" : "Mark as posted"}</button>
          <button type="button" className="secondary" disabled={pending} onClick={skip}>Skip the links for now</button>
          <button type="button" className="secondary" onClick={onClose}>Cancel</button>
        </div>
      </form>
    </div>
  );
}
