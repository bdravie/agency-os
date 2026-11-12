"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { BellRing, FileText, PenLine } from "lucide-react";
import ActionForm from "./ActionForm";
import { useToast } from "./Toast";
import { draftLinkedInPostAction, newLinkedInPostAction } from "@/lib/linkedinActions";
import { STAGES, type Stage } from "@/lib/linkedinMath";
import { plannedLabel } from "@/lib/linkedinScheduleMath";

export type LinkedInRow = { id: number; title: string; opening: string; words: number; stage: Stage; day: string | null; time: string | null; reminder: boolean; images: number; hasImage: boolean };

const TONE: Record<Stage, string> = { Drafted: "neutral", "Image ready": "warn", Scheduled: "blue", Posted: "good" };
const NEXT: Record<Stage, string> = { Drafted: "Build its image", "Image ready": "Plan a day", Scheduled: "Post it by hand", Posted: "Enter its numbers" };

export default function LinkedInPanel({ posts, sources, aiReady }: { posts: LinkedInRow[]; sources: { id: number; idea: string }[]; aiReady: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [stage, setStage] = useState<Stage | "all">("all");
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const shown = posts.filter((p) => stage === "all" || p.stage === stage);
  const count = (s: Stage) => posts.filter((p) => p.stage === s).length;

  const startBlank = async () => {
    setBusy(true);
    try {
      const r = await newLinkedInPostAction((() => { const fd = new FormData(); fd.set("title", title); return fd; })());
      if (r.error || !r.id) { toast(r.error ?? "The post could not be started.", "bad"); return; }
      router.push(`/content/linkedin/${r.id}`);
    } catch (err) { toast(`Could not start the post: ${err instanceof Error ? err.message : String(err)}`, "bad"); }
    finally { setBusy(false); }
  };

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="split">
        <section className="card">
          <div className="row" style={{ gap: 8, marginBottom: 6 }}><FileText size={18} aria-hidden /><h2 style={{ margin: 0 }}>Draft a LinkedIn post</h2></div>
          <p className="muted" style={{ margin: "0 0 12px" }}>
            Writes one text post with two opening lines to compare, from a video you have planned or from a topic. It is checked before it is saved: no figures or results that were not given, no links, no names.
            Nothing is posted: you copy it into LinkedIn yourself.
          </p>
          {!aiReady && <p className="muted" role="status" style={{ margin: "0 0 10px" }}>No AI key is set, so Draft post saves a built-in example to try the screen with.</p>}
          <ActionForm action={draftLinkedInPostAction} label="Draft post" busyLabel="Writing and checking… (about 20 seconds)" style={{ maxWidth: 640 }}>
            <label className="field-label" htmlFor="li-from">Start from a video (optional)</label>
            <select id="li-from" name="from_id" defaultValue="">
              <option value="">No video: use the topic below</option>
              {sources.map((s) => <option key={s.id} value={s.id}>#{s.id}: {s.idea.slice(0, 70)}</option>)}
            </select>
            <label className="field-label" htmlFor="li-topic">Topic or angle</label>
            <input id="li-topic" name="topic" maxLength={200} placeholder="e.g. why quotes go cold when they are sent by text" />
            <label className="field-label" htmlFor="li-notes">Your notes (optional)</label>
            <textarea id="li-notes" name="notes" rows={3} maxLength={4000} placeholder="Anything true you want in it: what you saw, what you built, what happened. Business details only, never a customer's." />
          </ActionForm>
        </section>

        <section className="card">
          <div className="row" style={{ gap: 8, marginBottom: 6 }}><PenLine size={18} aria-hidden /><h2 style={{ margin: 0 }}>Write it myself</h2></div>
          <p className="muted" style={{ margin: "0 0 12px" }}>Start an empty post and write it in your own words. You can still build its image from the text.</p>
          <div className="stack stack-tight" style={{ gap: 8 }}>
            <label className="field-label" htmlFor="li-title">Working title</label>
            <input id="li-title" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && title.trim() && !busy) startBlank(); }} placeholder="Only you see this" />
            <button type="button" className="secondary" disabled={!title.trim() || busy} onClick={startBlank}>{busy ? "Starting…" : "Start post"}</button>
          </div>
        </section>
      </div>

      <div className="pills" role="group" aria-label="Stage">
        <button type="button" className={`pill${stage === "all" ? " on" : ""}`} aria-pressed={stage === "all"} onClick={() => setStage("all")}>All ({posts.length})</button>
        {STAGES.map((s) => <button key={s} type="button" className={`pill${stage === s ? " on" : ""}`} aria-pressed={stage === s} onClick={() => setStage(s)}>{s} ({count(s)})</button>)}
      </div>

      <div className="card table-wrap">
        {shown.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>{posts.length === 0 ? "No LinkedIn posts yet. Draft one above, or repurpose a filmed video." : "No posts at this stage."}</p>
        ) : (
          <table>
            <thead><tr><th>Post</th><th>Stage</th><th>Words</th><th>Image</th><th>Planned for</th><th>Next</th></tr></thead>
            <tbody>
              {shown.map((p) => (
                <tr key={p.id}>
                  <td style={{ maxWidth: 460 }}>
                    <Link href={`/content/linkedin/${p.id}`} style={{ fontWeight: 600 }}>{p.title}</Link>
                    {p.opening && <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>{p.opening.length > 110 ? `${p.opening.slice(0, 110)}…` : p.opening}</div>}
                  </td>
                  <td><span className={`badge tone-${TONE[p.stage]}`}>{p.stage}</span></td>
                  <td className="muted">{p.words || "–"}</td>
                  <td className="muted">{p.hasImage ? "Chosen" : p.images ? `${p.images} to choose from` : "–"}</td>
                  <td className="muted">{p.day && p.stage !== "Posted" ? <>{plannedLabel(p.day, p.time)}{p.reminder && <BellRing size={13} aria-label="Reminder set" style={{ marginLeft: 6, verticalAlign: -2 }} />}</> : "–"}</td>
                  <td><Link href={p.stage === "Posted" ? `/content?open=${p.id}` : p.stage === "Image ready" || p.stage === "Scheduled" ? `/content/linkedin/${p.id}#plan` : `/content/linkedin/${p.id}`}>{NEXT[p.stage]}</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
