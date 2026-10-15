"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Search, Sparkles } from "lucide-react";
import { researchAction, suggestAction } from "@/lib/suggestActions";
import { useToast } from "./Toast";

// Two separate steps: free research, then (on click) Claude drafts the offer ideas. Nothing runs by itself.
export default function OfferSuggestionButtons({ companyId, model, usage, search, hasSuggestion }: {
  companyId: number; model: string; usage: { used: number; cap: number }; search: { enabled: boolean; left: number }; hasSuggestion: boolean;
}) {
  const toast = useToast(), router = useRouter();
  const [web, setWeb] = useState(false);
  const [busy, setBusy] = useState<"research" | "suggest" | null>(null);
  const [notes, setNotes] = useState<string[]>([]);
  const [, start] = useTransition();
  const run = (kind: "research" | "suggest") => { setBusy(kind); setNotes([]); start(async () => {
    try {
      const r = await (kind === "research" ? researchAction(companyId, web) : suggestAction(companyId, web));
      if (r.error) { setNotes([r.error]); toast(r.error, "bad"); return; }
      toast(kind === "research" ? "Research done" : "Offer ideas drafted"); setNotes(r.warnings ?? []); router.refresh();
    } finally { setBusy(null); }
  }); };
  return (
    <div className="stack" style={{ gap: 10 }}>
      <div className="row">
        <button type="button" className="secondary" disabled={busy !== null} onClick={() => run("research")}><Search size={15} aria-hidden /> {busy === "research" ? "Reading their website… (up to a minute)" : "Research the website (free)"}</button>
        {search.enabled && (
          <label className="row muted" style={{ gap: 6 }}><input type="checkbox" checked={web} onChange={(e) => setWeb(e.target.checked)} disabled={search.left < 2} /> Also search the web (uses 2 of your {search.left} searches left today)</label>
        )}
      </div>
      <div className="paid">
        <div className="field-label">Uses Claude credits · only when you click</div>
        <div className="row">
          <button type="button" disabled={busy !== null || usage.used >= usage.cap} onClick={() => { if (hasSuggestion && !window.confirm("Draft new ideas? The earlier ones are kept underneath.")) return; run("suggest"); }}>
            <Sparkles size={15} aria-hidden /> {busy === "suggest" ? "Researching and drafting… (about a minute)" : hasSuggestion ? "Suggest offers again" : "Suggest offers with AI"}
          </button>
          <span className="muted">One call to <code>{model}</code> · {usage.used} of {usage.cap} used today. It researches first if there is nothing under a week old.</span>
        </div>
      </div>
      {notes.length > 0 && <ul style={{ margin: 0 }}>{notes.map((n, i) => <li key={i} role="status" style={{ border: 0, padding: "2px 0", color: "var(--warn)" }}>{n}</li>)}</ul>}
    </div>
  );
}
