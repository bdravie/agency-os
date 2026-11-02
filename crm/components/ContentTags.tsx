"use client";

import { useState, useTransition } from "react";
import { Minus, Plus } from "lucide-react";
import { logKeywordReply, saveTags, undoKeywordReply } from "@/lib/contentInsightsActions";
import { HOOK_TYPES, PILLARS } from "@/lib/contentMath";
import { useToast } from "./Toast";

type Tags = { pillar: string | null; hook_type: string | null; niche: string | null; length_s: number | null };

// Tags that group a video on What's working, and a hand count of keyword replies (nothing about the people is kept).
export default function ContentTags({ itemId, tags, keyword, replies, niches, onChanged }: { itemId: number; tags: Tags; keyword: string | null; replies: number; niches: string[]; onChanged: () => void }) {
  const toast = useToast();
  const [v, setV] = useState({ pillar: tags.pillar ?? "", hook_type: tags.hook_type ?? "", niche: tags.niche ?? "", length_s: tags.length_s === null ? "" : String(tags.length_s) });
  const [count, setCount] = useState(replies);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <section>
      <div className="field-label">Tags (for What's working)</div>
      <form className="stack" style={{ gap: 8 }} onSubmit={(e) => { e.preventDefault(); start(async () => { const r = await saveTags(itemId, v); if (!r.ok) { setError(r.error ?? "Could not save."); return; } setError(null); toast("Tags saved"); onChanged(); }); }}>
        <div className="perf-fields">
          <label><span className="field-label">Pillar</span><select value={v.pillar} onChange={(e) => setV({ ...v, pillar: e.target.value })}><option value="">Not set</option>{PILLARS.map((p) => <option key={p}>{p}</option>)}</select></label>
          <label><span className="field-label">Hook type</span><select value={v.hook_type} onChange={(e) => setV({ ...v, hook_type: e.target.value })}><option value="">Not set</option>{HOOK_TYPES.map((p) => <option key={p}>{p}</option>)}</select></label>
          <label><span className="field-label">Niche</span><select value={v.niche} onChange={(e) => setV({ ...v, niche: e.target.value })}><option value="">Not set</option>{niches.map((p) => <option key={p}>{p}</option>)}</select></label>
          <label><span className="field-label">Length (seconds)</span><input inputMode="numeric" value={v.length_s} onChange={(e) => setV({ ...v, length_s: e.target.value })} /></label>
        </div>
        {error && <p className="error" role="alert">{error}</p>}
        <div><button className="secondary" disabled={pending}>{pending ? "Saving…" : "Save tags"}</button></div>
      </form>
      {keyword && (
        <div className="row" style={{ marginTop: 12, gap: 10 }}>
          <span>Keyword <b>{keyword}</b> replies counted: <b>{count}</b></span>
          <button type="button" className="secondary" disabled={pending} onClick={() => start(async () => { const r = await logKeywordReply(itemId); if (r.ok) setCount(r.count); })} aria-label="Count one more keyword reply"><Plus size={14} aria-hidden /> Count one</button>
          <button type="button" className="link" disabled={pending || count === 0} onClick={() => start(async () => { const r = await undoKeywordReply(itemId); if (r.ok) setCount(r.count); })} aria-label="Undo the last count"><Minus size={13} aria-hidden /> Undo</button>
        </div>
      )}
    </section>
  );
}
