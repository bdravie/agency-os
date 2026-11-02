"use client";

import { useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { addTrend, removeTrend } from "@/lib/contentBriefActions";
import { nicheLabel } from "@/lib/contentConfigMath";
import { useToast } from "./Toast";

export function AddTrend({ niches }: { niches: string[] }) {
  const toast = useToast();
  const [v, setV] = useState({ title: "", url: "", detail: "", niche: "" });
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <form className="stack" style={{ gap: 8 }} onSubmit={(e) => { e.preventDefault(); start(async () => { const r = await addTrend(v.title, v.url, v.detail, v.niche); if (!r.ok) { setError(r.error); return; } setError(null); setV({ title: "", url: "", detail: "", niche: "" }); toast("Trend added"); }); }}>
      <div className="row" style={{ flexWrap: "wrap" }}>
        <input value={v.title} onChange={(e) => { setV({ ...v, title: e.target.value }); setError(null); }} placeholder="What is trending? e.g. Missed call text back demos" aria-label="Trend" style={{ flex: "2 1 280px" }} />
        <input value={v.url} onChange={(e) => setV({ ...v, url: e.target.value })} placeholder="Link (optional)" aria-label="Link" style={{ flex: "1 1 200px" }} />
        <select value={v.niche} onChange={(e) => setV({ ...v, niche: e.target.value })} aria-label="Niche"><option value="">Any niche</option>{niches.map((n) => <option key={n} value={n}>{nicheLabel(n)}</option>)}</select>
      </div>
      <input value={v.detail} onChange={(e) => setV({ ...v, detail: e.target.value })} placeholder="A note on why it matters (optional). Don't paste people's names or messages." aria-label="Note" />
      {error && <p className="error" role="alert">{error}</p>}
      <div><button disabled={pending || v.title.trim().length < 3}><Plus size={15} aria-hidden /> Add trend</button></div>
    </form>
  );
}

export function RemoveTrend({ id }: { id: number }) {
  const toast = useToast();
  const [ask, setAsk] = useState(false);
  const [pending, start] = useTransition();
  return ask ? (
    <span className="row" style={{ gap: 6 }}>Remove?
      <button className="link" disabled={pending} onClick={() => start(async () => { const r = await removeTrend(id); toast(r.ok ? "Removed" : r.error, r.ok ? undefined : "bad"); })}>Yes</button>
      <button className="link" onClick={() => setAsk(false)}>No</button>
    </span>
  ) : <button className="link" onClick={() => setAsk(true)}>Remove</button>;
}
