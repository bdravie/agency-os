"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Lightbulb, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { addOutlierIdea, breakDownOutlier } from "@/lib/outlierActions";
import { writeFromSwipeAction } from "@/lib/linkedinSwipeActions";
import type { Breakdown } from "@/lib/breakdownMath";
import { useToast } from "./Toast";

// Break down one outlier: what it does, why it may have worked, and three ideas for your own audience. Click-only.
// For a LinkedIn swipe entry (`linkedin`) there is no transcript, and each idea is written straight into a LinkedIn post instead of joining the video Ideas.
export default function BreakdownPanel({ postId, initial, linkedin = false }: { postId: number; initial: Breakdown | null; linkedin?: boolean }) {
  const toast = useToast();
  const router = useRouter();
  const [b, setB] = useState<Breakdown | null>(initial);
  const [open, setOpen] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function run() {
    start(async () => {
      const r = await breakDownOutlier(postId, transcript);
      if (!r.ok) { setError(r.error); return; }
      setError(null); setB(r.breakdown); setOpen(false); toast("Broken down");
    });
  }
  function add(index: number) {
    if (linkedin) {
      start(async () => {
        const r = await writeFromSwipeAction(postId, index);
        if (!r.id) { toast(r.error ?? "The post could not be written.", "bad"); return; }
        router.push(`/content/linkedin/${r.id}`);
      });
      return;
    }
    start(async () => {
      const r = await addOutlierIdea(postId, index);
      if (!r.ok) { toast(r.error, "bad"); return; }
      setB((cur) => cur && { ...cur, ideas: cur.ideas.map((x, i) => (i === index ? { ...x, content_id: r.contentId } : x)) });
      toast("Added to Ideas");
    });
  }

  return (
    <div className="stack" style={{ gap: 10 }}>
      {!b && !open && <div><button className="secondary" disabled={pending} onClick={() => (linkedin ? run() : setOpen(true))}><Lightbulb size={14} aria-hidden /> {pending ? "Breaking down… (about 20 seconds)" : "Break down"}</button></div>}
      {open && !linkedin && (
        <div className="stack" style={{ gap: 8 }}>
          <label className="field-label" htmlFor={`tr-${postId}`}>Transcript (optional)</label>
          <textarea id={`tr-${postId}`} rows={5} value={transcript} onChange={(e) => setTranscript(e.target.value)} placeholder="Paste what they say in the video if you have it. Without it, the breakdown works from the caption alone and is more of a guess. Emails and phone numbers are removed. Nothing you paste is kept." />
          <div className="row">
            <button disabled={pending} onClick={run}>{pending ? "Breaking down… (about 20 seconds)" : "Break down"}</button>
            <button className="secondary" disabled={pending} onClick={() => setOpen(false)}>Cancel</button>
          </div>
        </div>
      )}
      {error && <p className="error" role="alert">{error}</p>}
      {b && (
        <div className="stack" style={{ gap: 10 }}>
          <div className="response-box" style={{ background: "var(--surface-2)", marginTop: 0 }}>
            <p style={{ margin: 0 }}><b>Hook:</b> {b.hook}{b.hook_type ? <span className="muted"> · {b.hook_type}</span> : null}</p>
            <p style={{ margin: "6px 0 0" }}><b>Format:</b> {b.format} <span className="muted">· {b.length_note}</span></p>
            <p style={{ margin: "6px 0 0" }}><b>Structure:</b></p>
            <ol className="fx-bullets" style={{ listStyle: "decimal" }}>{b.beats.map((x, i) => <li key={i}>{x}</li>)}</ol>
            <p style={{ margin: "6px 0 0" }}><b>Why it may have worked</b> <span className="muted">(guesses, not facts)</span></p>
            <ul className="fx-bullets">{b.why_it_worked.map((x, i) => <li key={i}>{x}</li>)}</ul>
            {b.cta && <p style={{ margin: "6px 0 0" }}><b>Call to action:</b> {b.cta}</p>}
            <p className="muted" style={{ margin: "6px 0 0" }}>{linkedin ? "Based on the post's text." : b.based_on === "caption" ? "Based on the caption only." : "Based on the caption and your transcript."}</p>
          </div>
          <h3 style={{ margin: 0 }}>Your versions</h3>
          <ul className="stack" style={{ gap: 8 }}>
            {b.ideas.map((i, k) => (
              <li key={k} className="card" style={{ padding: "10px 12px" }}>
                <div className="row-between" style={{ gap: 12, alignItems: "flex-start" }}>
                  <div>
                    <b>{i.hook}</b>
                    <div>{i.idea}</div>
                    <div className="muted">{i.pillar} · {i.hook_type} · {i.niche}</div>
                  </div>
                  {i.content_id ? <Link href={linkedin ? `/content/linkedin/${i.content_id}` : `/content/${i.content_id}`} className="btn secondary">{linkedin ? "Written · open" : "Added · open"}</Link>
                    : <button className="secondary" disabled={pending} onClick={() => add(k)}><Plus size={14} aria-hidden /> {linkedin ? (pending ? "Writing… (about 20 seconds)" : "Write my version") : "Add to Ideas"}</button>}
                </div>
              </li>
            ))}
          </ul>
          {!open && <div><button className="link" disabled={pending} onClick={() => (linkedin ? run() : setOpen(true))}>Break down again</button></div>}
        </div>
      )}
    </div>
  );
}
