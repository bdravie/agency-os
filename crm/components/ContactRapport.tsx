"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import { clearRapportAction, findRapportAction } from "@/lib/rapportActions";
import type { RapportResult } from "@/lib/rapport";
import { useToast } from "./Toast";

const KIND: Record<string, string> = { work: "Working on", talk: "Said or wrote", background: "Background", role: "Role" };

// Professional rapport points for one saved decision-maker. Click-only; every point shows the page it came from.
export default function ContactRapport({ contactId, name, initial }: { contactId: number; name: string; initial: RapportResult | null }) {
  const [data, setData] = useState<RapportResult | null>(initial);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<number | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter(), toast = useToast();

  const find = () => {
    if (data && !window.confirm("Search again? This uses another of today's searches and replaces the points below.")) return;
    setError(null);
    start(async () => {
      const r = await findRapportAction(contactId);
      if (r.error || !r.result) { setError(r.error ?? "The search failed."); return; }
      setData(r.result); router.refresh();
    });
  };
  const clear = () => {
    if (!window.confirm(`Remove everything saved about ${name}'s rapport points?`)) return;
    start(async () => { const r = await clearRapportAction(contactId); if (r.error) setError(r.error); else { setData(null); toast("Removed"); router.refresh(); } });
  };
  const copy = async (text: string, i: number) => { await navigator.clipboard.writeText(text); setCopied(i); setTimeout(() => setCopied(null), 1500); };

  return (
    <div className="stack" style={{ gap: 6, marginTop: 4 }}>
      <div className="row" style={{ gap: 8 }}>
        <button type="button" className="secondary" onClick={find} disabled={pending}><Sparkles size={14} aria-hidden /> {pending ? "Searching… (about 30 seconds)" : data ? "Search again" : "Find rapport points"}</button>
        {data && <button type="button" className="link" onClick={clear} disabled={pending}>Remove</button>}
        {!data && !pending && <span className="muted">Their own website and a few public pages. Uses search credits. No social media.</span>}
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      {data && (
        <div className="stack" style={{ gap: 8 }}>
          {data.points.length === 0 && <p className="muted" style={{ margin: 0 }}>Nothing professional could be confirmed. Better to write a plain message than guess.</p>}
          {data.points.map((p, i) => (
            <div key={i} className="response-box" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <div className="row-between"><span className="badge tone-neutral">{KIND[p.kind] ?? p.kind}</span><a href={p.source_url} target="_blank" rel="noreferrer">{p.source_title || new URL(p.source_url).hostname}</a></div>
              <div>{p.text}</div>
              <div className="muted">&ldquo;{p.quote}&rdquo;</div>
              <div className="row-between"><i>{p.opener}</i><button type="button" className="secondary" onClick={() => copy(p.opener, i)}>{copied === i ? "Copied ✓" : "Copy opening line"}</button></div>
            </div>
          ))}
          <details><summary className="muted">What was looked at</summary><ul className="muted">{data.limits.map((l, i) => <li key={i}>{l}</li>)}</ul></details>
          <p className="muted" style={{ margin: 0 }}>Published professional material only, found by the AI and checked against the page. Say where you saw it in your message, for example &ldquo;I read your piece on…&rdquo;, so they know how you found it. Remove it if they ask.</p>
        </div>
      )}
    </div>
  );
}
