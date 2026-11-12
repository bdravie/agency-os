"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Bookmark, Trash2 } from "lucide-react";
import { useToast } from "./Toast";
import ToastForm from "./ToastForm";
import BreakdownPanel from "./BreakdownPanel";
import { addSwipeAction, deleteSwipeAction } from "@/lib/linkedinSwipeActions";
import { SWIPE_TYPES } from "@/lib/linkedinSwipeMath";
import type { Breakdown } from "@/lib/breakdownMath";

export type SwipeRow = {
  id: number; url: string; text: string; type: string | null; reactions: number | null; comments: number | null; reposts: number | null; postedAt: string | null;
  handle: string; name: string | null; why: string | null; breakdown: Breakdown | null;
};

const n = (v: number | null) => (v === null ? "–" : v.toLocaleString("en-GB"));
const EMPTY = { creator: "", why: "", url: "", text: "", type: "text", reactions: "", comments: "", reposts: "", postedOn: "" };

/** The LinkedIn swipe file: posts you saw do well, pasted by hand (LinkedIn is never read by the app), broken down so you can borrow the structure. */
export default function LinkedInSwipe({ rows, aiReady }: { rows: SwipeRow[]; aiReady: boolean }) {
  const toast = useToast();
  const router = useRouter();
  const [f, setF] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await addSwipeAction(f);
      if (r.error) { toast(r.error, "bad"); return; }
      toast("Saved to your swipe file"); setF(EMPTY); router.refresh();
    } catch (err) { toast(`Could not save: ${err instanceof Error ? err.message : String(err)}`, "bad"); }
    finally { setBusy(false); }
  };

  return (
    <div className="stack" style={{ gap: 16 }}>
      <section className="card">
        <div className="row" style={{ gap: 8, marginBottom: 6 }}><Bookmark size={18} aria-hidden /><h2 style={{ margin: 0 }}>Add a post to your swipe file</h2></div>
        <p className="muted" style={{ margin: "0 0 12px" }}>
          A LinkedIn post you saw do well, pasted by hand: the app never reads LinkedIn, to keep your account safe. Paste the post's own words only, not the comments.
          Emails, phone numbers and @mentions are removed. Break it down to borrow the structure and the angle, never the wording.
        </p>
        <form onSubmit={save} className="stack" style={{ gap: 10, maxWidth: 760 }}>
          <div className="li-swipe-fields">
            <label className="stack" style={{ gap: 4 }}><span className="field-label">Creator's profile link</span><input value={f.creator} onChange={set("creator")} placeholder="https://www.linkedin.com/in/…" required /></label>
            <label className="stack" style={{ gap: 4 }}><span className="field-label">Link to the post</span><input value={f.url} onChange={set("url")} placeholder="··· > Copy link to post" required /></label>
          </div>
          <label className="stack" style={{ gap: 4 }}><span className="field-label">The post's text</span><textarea rows={6} value={f.text} onChange={set("text")} maxLength={6000} required /></label>
          <div className="li-swipe-nums">
            <label className="stack" style={{ gap: 4 }}><span className="field-label">Type</span><select value={f.type} onChange={set("type")}>{SWIPE_TYPES.map((t) => <option key={t.code} value={t.code}>{t.label}</option>)}</select></label>
            <label className="stack" style={{ gap: 4 }}><span className="field-label">Reactions</span><input inputMode="numeric" value={f.reactions} onChange={set("reactions")} /></label>
            <label className="stack" style={{ gap: 4 }}><span className="field-label">Comments</span><input inputMode="numeric" value={f.comments} onChange={set("comments")} /></label>
            <label className="stack" style={{ gap: 4 }}><span className="field-label">Reposts</span><input inputMode="numeric" value={f.reposts} onChange={set("reposts")} /></label>
            <label className="stack" style={{ gap: 4 }}><span className="field-label">Posted on</span><input type="date" value={f.postedOn} onChange={set("postedOn")} /></label>
          </div>
          <label className="stack" style={{ gap: 4 }}><span className="field-label">Why you follow them (optional)</span><input value={f.why} onChange={set("why")} maxLength={200} placeholder="e.g. great at turning a job story into a lesson" /></label>
          <div><button type="submit" className="secondary" disabled={busy}>{busy ? "Saving…" : "Save to swipe file"}</button></div>
        </form>
      </section>

      {rows.length === 0 ? (
        <p className="muted">Nothing in your swipe file yet.</p>
      ) : rows.map((p) => (
        <article key={p.id} className="card stack" style={{ gap: 8 }}>
          <div className="row-between" style={{ gap: 12, flexWrap: "wrap" }}>
            <span><b>{p.name ?? p.handle}</b>{p.why && <span className="muted"> · {p.why}</span>}</span>
            <span className="muted" style={{ fontSize: 13 }}>
              {SWIPE_TYPES.find((t) => t.code === p.type)?.label ?? "Post"}{p.postedAt ? ` · ${new Date(p.postedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}` : ""}
            </span>
          </div>
          <p className="li-swipe-text">{p.text}</p>
          <p className="muted" style={{ margin: 0 }}>{n(p.reactions)} reactions · {n(p.comments)} comments · {n(p.reposts)} reposts</p>
          {aiReady ? <BreakdownPanel postId={p.id} initial={p.breakdown} linkedin /> : <p className="muted" style={{ margin: 0 }}>Set an AI key to break posts down.</p>}
          <div className="row-between" style={{ gap: 12 }}>
            <a href={p.url} target="_blank" rel="noopener noreferrer">Open on LinkedIn</a>
            <ToastForm action={deleteSwipeAction} success="Removed from your swipe file" confirm="Remove this post from your swipe file?" style={{ margin: 0 }}>
              <input type="hidden" name="id" value={p.id} />
              <button className="link" aria-label="Remove from swipe file"><Trash2 size={13} aria-hidden /> Remove</button>
            </ToastForm>
          </div>
        </article>
      ))}
    </div>
  );
}
