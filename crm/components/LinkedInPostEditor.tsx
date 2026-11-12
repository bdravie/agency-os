"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, RefreshCw, Save, Shuffle, Trash2 } from "lucide-react";
import { useToast } from "./Toast";
import { deleteLinkedInPostAction, redraftLinkedInPostAction, saveLinkedInPostAction } from "@/lib/linkedinActions";
import { FOLD_CHARS, POST_MAX_CHARS, openingLine, postProblem, postWarnings, swapOpening, wordCount } from "@/lib/linkedinMath";

export type EditablePost = { id: number; title: string; text: string; opening: string | null; openingAlt: string | null; posted: boolean };

/** The words of one LinkedIn post: edit, swap between the two opening lines, rewrite with AI (on a click, after confirming), copy. Nothing is posted from here. */
export default function LinkedInPostEditor({ post, aiReady }: { post: EditablePost; aiReady: boolean }) {
  const toast = useToast();
  const router = useRouter();
  const [title, setTitle] = useState(post.title);
  const [text, setText] = useState(post.text);
  const [steer, setSteer] = useState("");
  const [busy, setBusy] = useState<"save" | "ai" | "delete" | null>(null);
  const dirty = title !== post.title || text !== post.text;
  const problem = postProblem(title, text);
  const warnings = postWarnings(text);
  const first = openingLine(text);
  const hooks = [post.opening, post.openingAlt].map((h) => (h ?? "").trim()).filter(Boolean);
  const other = hooks.length === 2 && hooks.includes(first) ? hooks.find((h) => h !== first) ?? null : null;

  const run = async (kind: "save" | "ai" | "delete", work: () => Promise<{ error?: string }>, done: string, after?: () => void) => {
    setBusy(kind);
    try {
      const r = await work();
      if (r?.error) { toast(r.error, "bad"); return; }
      toast(done);
      if (after) after(); else router.refresh();
    } catch (err) { toast(`Something went wrong: ${err instanceof Error ? err.message : String(err)}`, "bad"); }
    finally { setBusy(null); }
  };
  const save = () => run("save", () => saveLinkedInPostAction({ id: post.id, title, text }), "Post saved");
  const rewrite = () => {
    if (!window.confirm(text.trim() ? "Rewrite this post with AI? The current words are replaced (the AI is shown them, so their facts are kept)." : "Write this post with AI from its title?")) return;
    // The page is given a new key when the saved text changes, so the editor reloads with the new words.
    run("ai", () => redraftLinkedInPostAction({ id: post.id, steer }), "Post rewritten", () => { setSteer(""); router.refresh(); });
  };
  const remove = () => {
    if (!window.confirm("Delete this post and its images? This cannot be undone.")) return;
    const fd = new FormData(); fd.set("id", String(post.id));
    run("delete", () => deleteLinkedInPostAction(fd), "Post deleted", () => router.push("/content?tab=linkedin"));
  };
  const swap = () => {
    if (!other) return;
    const next = swapOpening(text, first, other);
    if (next) setText(next);
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(text.trim()); toast("Post copied: paste it into LinkedIn"); }
    catch { toast("The browser would not copy it. Select the text and copy it by hand.", "bad"); }
  };

  return (
    <section className="card stack" style={{ gap: 12 }}>
      <div className="row-between">
        <h2 style={{ margin: 0 }}>The post</h2>
        <span className="muted" style={{ fontSize: 13 }}>{wordCount(text)} words · {text.length.toLocaleString("en-GB")} of {POST_MAX_CHARS.toLocaleString("en-GB")} characters</span>
      </div>

      <label className="stack" style={{ gap: 4 }}>
        <span className="field-label">Working title (only you see this)</span>
        <input value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} disabled={busy !== null} />
      </label>

      <label className="stack" style={{ gap: 4 }}>
        <span className="field-label">Post text, as it will be pasted into LinkedIn</span>
        <textarea className="li-post-text" value={text} rows={18} onChange={(e) => setText(e.target.value)} disabled={busy !== null} placeholder={"Opening line: one concrete detail that makes someone tap \"see more\".\n\nThen the problem, what changed, and one question to end on."} />
      </label>

      {first && (
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>
          Opening line: {first.length} characters (about {FOLD_CHARS} show before “see more”).
          {other && <> <button type="button" className="link" onClick={swap} disabled={busy !== null}><Shuffle size={12} aria-hidden /> Try the other opening</button></>}
        </p>
      )}
      {other && <p className="muted" style={{ margin: 0, fontSize: 13 }}>Other opening: “{other}”. When you record the post as posted, say which one you used, so the two can be compared.</p>}

      {problem && text.trim() !== "" && <p className="error" role="alert">{problem}</p>}
      {warnings.length > 0 && (
        <ul className="muted" style={{ margin: 0, paddingLeft: 18, fontSize: 13 }} aria-label="Worth a second look">
          {warnings.map((w) => <li key={w}>{w}</li>)}
        </ul>
      )}

      <div className="row-between" style={{ paddingTop: 10, borderTop: "1px solid var(--line-soft)" }}>
        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          <button type="button" onClick={save} disabled={!dirty || !!problem || busy !== null}><Save size={15} aria-hidden /> {busy === "save" ? "Saving…" : dirty ? "Save post" : "Saved"}</button>
          <button type="button" className="secondary" onClick={copy} disabled={!text.trim()}><Copy size={15} aria-hidden /> Copy text</button>
        </div>
        {!post.posted && <button type="button" className="link" onClick={remove} disabled={busy !== null} aria-label="Delete this post"><Trash2 size={13} aria-hidden /> Delete</button>}
      </div>

      {!post.posted && (
        <details>
          <summary>Rewrite with AI</summary>
          <div className="stack stack-tight" style={{ gap: 8, marginTop: 10 }}>
            <p className="muted" style={{ margin: 0, fontSize: 13 }}>
              {aiReady ? "Runs only when you click. It replaces the saved post and both opening lines, and is checked before saving: no figures or results that are not in your text or notes, no links, no names." : "No AI key is set, so this saves the built-in example."}
              {dirty && " Save your changes first, or they will not be seen."}
            </p>
            <input value={steer} maxLength={500} onChange={(e) => setSteer(e.target.value)} placeholder="What should change? (optional), e.g. shorter, or lead with the missed call" aria-label="What should change" disabled={busy !== null} />
            <button type="button" className="secondary" onClick={rewrite} disabled={busy !== null || dirty}><RefreshCw size={15} className={busy === "ai" ? "spin-quick" : ""} aria-hidden /> {busy === "ai" ? "Rewriting and checking… (about 20 seconds)" : "Rewrite with AI"}</button>
          </div>
        </details>
      )}
    </section>
  );
}
