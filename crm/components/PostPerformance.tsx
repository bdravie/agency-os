"use client";

import { useState, useTransition } from "react";
import { ExternalLink, Plus } from "lucide-react";
import { addPost, removePost, saveMetrics } from "@/lib/contentPostActions";
import { BUCKETS, BUCKET_LABEL, PLATFORM_LABEL, VIEWS_LABEL, fmtMultiple, fmtPercent, type Platform } from "@/lib/contentMath";
import type { PostView } from "@/lib/contentPerformance";
import { useToast } from "./Toast";

const FIELDS = [
  ["views", "Views"], ["likes", "Likes"], ["comments", "Comments"], ["shares", "Shares"], ["saves", "Saves"], ["follows", "Follows"], ["avg_watch_s", "Avg watch (s)"],
] as const;
const cell = (v: number | null) => (v === null || v === undefined ? "–" : Number(v).toLocaleString("en-GB"));

function MetricsForm({ post, bucket, onSaved, onCancel }: { post: PostView; bucket: number; onSaved: () => void; onCancel: () => void }) {
  const toast = useToast();
  const existing = post.metrics.find((m) => m.bucket === bucket);
  const [vals, setVals] = useState<Record<string, string>>(Object.fromEntries(FIELDS.map(([k]) => [k, existing && (existing as any)[k] !== null ? String((existing as any)[k]) : ""])));
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const p = post.platform as Platform;
  return (
    <form className="stack" style={{ gap: 8, marginTop: 8 }} onSubmit={(e) => { e.preventDefault(); start(async () => { const r = await saveMetrics(post.id, bucket, vals); if (!r.ok) { setError(r.error); return; } toast(r.message); onSaved(); }); }}>
      <div className="perf-fields">
        {FIELDS.map(([k, label], i) => (
          <label key={k}><span className="field-label">{k === "views" ? VIEWS_LABEL[p] : label}</span>
            <input inputMode="decimal" value={vals[k]} onChange={(e) => { setVals({ ...vals, [k]: e.target.value }); setError(null); }} autoFocus={i === 0} aria-label={`${label} at ${BUCKET_LABEL[bucket as 24]}`} />
          </label>
        ))}
      </div>
      <p className="muted" style={{ margin: 0 }}>Copy these from {PLATFORM_LABEL[p]}'s own insights. Leave blank anything it does not show.</p>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="row"><button disabled={pending}>{pending ? "Saving…" : `Save ${BUCKET_LABEL[bucket as 24]} numbers`}</button><button type="button" className="secondary" onClick={onCancel}>Cancel</button></div>
    </form>
  );
}

function Score({ post }: { post: PostView }) {
  const s = post.performance;
  const name = PLATFORM_LABEL[post.platform as Platform];
  if (s.status === "no_metrics") return <p className="muted" style={{ margin: "6px 0 0" }}>Enter the 72-hour numbers to see how it did.</p>;
  if (s.status === "not_enough_data") return <p className="muted" style={{ margin: "6px 0 0" }}>Not enough data yet: the score compares with your other {name} posts and needs 72-hour numbers for 3 of them (you have {s.have}).</p>;
  return (
    <p style={{ margin: "6px 0 0" }}>
      <b>{fmtMultiple(s.multiple)}</b> your usual <span className="muted">(median {s.baseline.toLocaleString("en-GB")} at 72 hours)</span>
      <span className="muted"> · saves {fmtPercent(s.saveRate)} · shares {fmtPercent(s.shareRate)} · comments {fmtPercent(s.commentRate)}</span>
    </p>
  );
}

// The Performance section of the content drawer: where it was posted, numbers at 24h / 72h / 7 days, and the score.
export default function PostPerformance({ itemId, status, posts, platforms, hook, onChanged }: { itemId: number; status: string; posts: PostView[]; platforms: string[]; hook: string | null; onChanged: () => void }) {
  const toast = useToast();
  const [editing, setEditing] = useState<{ post: number; bucket: number } | null>(null);
  const [confirm, setConfirm] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const missing = platforms.filter((p) => !posts.some((x) => x.platform === p));
  const [plat, setPlat] = useState(missing[0] ?? "");
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (status !== "Posted" && posts.length === 0) return null;
  return (
    <section>
      <div className="row-between"><div className="field-label">Performance</div>
        {missing.length > 0 && !adding && <button type="button" className="link" onClick={() => { setAdding(true); setPlat(missing[0]); }}><Plus size={13} aria-hidden /> Add a platform</button>}
      </div>
      {posts.length === 0 && !adding && <p className="muted">No links saved yet. Add where you posted it to track how it did.</p>}
      {adding && (
        <form className="stack" style={{ gap: 8, marginBottom: 12 }} onSubmit={(e) => { e.preventDefault(); start(async () => { const r = await addPost(itemId, plat, url, hook ?? ""); if (!r.ok) { setError(r.error); return; } toast(r.message); setAdding(false); setUrl(""); setError(null); onChanged(); }); }}>
          <div className="row">
            <select value={plat} onChange={(e) => setPlat(e.target.value)} aria-label="Platform">{missing.map((p) => <option key={p} value={p}>{PLATFORM_LABEL[p as Platform] ?? p}</option>)}</select>
            <input type="url" value={url} onChange={(e) => { setUrl(e.target.value); setError(null); }} placeholder="https://" aria-label="Post link" style={{ flex: 1 }} autoFocus />
            <button disabled={pending || !url.trim()}>{pending ? "Saving…" : "Save link"}</button>
            <button type="button" className="secondary" onClick={() => { setAdding(false); setError(null); }}>Cancel</button>
          </div>
          {error && <p className="error" role="alert">{error}</p>}
        </form>
      )}
      {posts.map((p) => (
        <div key={p.id} className="perf-post">
          <div className="row-between">
            <b>{PLATFORM_LABEL[p.platform as Platform] ?? p.platform}</b>
            <span className="row" style={{ gap: 10 }}>
              <a href={p.url} target="_blank" rel="noreferrer" className="row" style={{ gap: 4 }}>Open post <ExternalLink size={13} aria-hidden /></a>
              {confirm === p.id ? (
                <span className="row" style={{ gap: 6 }}>Remove this link and its numbers?
                  <button type="button" className="link" disabled={pending} onClick={() => start(async () => { const r = await removePost(p.id); toast(r.ok ? r.message : r.error); setConfirm(null); onChanged(); })}>Yes</button>
                  <button type="button" className="link" onClick={() => setConfirm(null)}>No</button>
                </span>
              ) : <button type="button" className="link" onClick={() => setConfirm(p.id)}>Remove</button>}
            </span>
          </div>
          {p.hook_used && <p className="muted" style={{ margin: "4px 0 0" }}>Hook: {p.hook_used}</p>}
          <div className="table-wrap">
            <table className="perf-table">
              <thead><tr><th></th>{FIELDS.map(([k, l]) => <th key={k} className="num">{k === "views" ? VIEWS_LABEL[p.platform as Platform] : l}</th>)}<th></th></tr></thead>
              <tbody>
                {BUCKETS.map((b) => {
                  const m = p.metrics.find((x) => x.bucket === b);
                  return (
                    <tr key={b}>
                      <td>{BUCKET_LABEL[b]}</td>
                      {FIELDS.map(([k]) => <td key={k} className="num">{cell(m ? (m as any)[k] : null)}</td>)}
                      <td><button type="button" className="link" onClick={() => setEditing({ post: p.id, bucket: b })}>{m ? "Edit" : "Enter numbers"}</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {editing?.post === p.id && <MetricsForm post={p} bucket={editing.bucket} onCancel={() => setEditing(null)} onSaved={() => { setEditing(null); onChanged(); }} />}
          <Score post={p} />
        </div>
      ))}
    </section>
  );
}
