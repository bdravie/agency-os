"use client";

import { useState, useTransition } from "react";
import { Plus, RefreshCw } from "lucide-react";
import { addCreator, checkCreatorAction, removeCreator, updateCreator } from "@/lib/creatorActions";
import { useToast } from "./Toast";

export type CreatorRow = {
  id: number; platform: string; handle: string; profile_url: string | null; niche: string | null; why_i_follow: string | null; active: boolean;
  display_name: string | null; followers: string | null; link_in_bio: string | null; last_checked_at: string | null; posts: number; outliers: number; estimate: number;
};
const NAME: Record<string, string> = { tiktok: "TikTok", instagram: "Instagram", youtube: "YouTube", linkedin: "LinkedIn" };
const usd = (n: number) => `$${n.toFixed(2)}`;
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "never");

export default function CreatorsPanel({ creators, spend, budget, tokenSet, maxActive }: { creators: CreatorRow[]; spend: { today: number; month: number }; budget: { daily: number; monthly: number }; tokenSet: boolean; maxActive: number }) {
  const toast = useToast();
  const [platform, setPlatform] = useState("instagram");
  const [handle, setHandle] = useState("");
  const [niche, setNiche] = useState("");
  const [why, setWhy] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState<number | "all" | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<number | null>(null);
  const [pending, start] = useTransition();

  const checkable = creators.filter((c) => c.active && c.platform !== "linkedin");
  const allEstimate = checkable.reduce((s, c) => s + c.estimate, 0);

  async function check(c: CreatorRow): Promise<boolean> {
    setBusy(c.id);
    const r = await checkCreatorAction(c.id);
    setBusy(null);
    const note = r.ok ? `${r.found} posts read, ${r.added} new, ${r.outliers} outlier${r.outliers === 1 ? "" : "s"}. Cost ${usd(r.costUsd)}.${r.warning ? " " + r.warning : ""}` : r.error;
    setNotes((n) => ({ ...n, [c.id]: note }));
    return r.ok;
  }
  async function checkAll() {
    setBusy("all");
    let i = 0;
    for (const c of checkable) {
      setProgress(`Checking ${c.handle} (${++i} of ${checkable.length})…`);
      if (!(await check(c))) { toast("Stopped at the first problem. See the note on that creator.", "bad"); break; }
    }
    setProgress(null); setBusy(null); toast("Finished");
  }

  return (
    <div className="stack">
      <section className="card stack" style={{ gap: 8 }} aria-labelledby="budget-h">
        <h2 id="budget-h">Research budget</h2>
        <p>Today <b>{usd(spend.today)}</b> of {usd(budget.daily)} · This month <b>{usd(spend.month)}</b> of {usd(budget.monthly)}. Each check shows its likely cost on the button and stops at these limits.</p>
        {!tokenSet && <p className="response-box" style={{ background: "var(--warn-soft)" }}><b>Not set up yet:</b> add <code>APIFY_TOKEN</code> to the env file in the top-level folder and restart the CRM. You can add creators now.</p>}
        <div className="row">
          <button disabled={!tokenSet || busy !== null || checkable.length === 0} onClick={checkAll}><RefreshCw size={15} aria-hidden /> {progress ?? `Check all ${checkable.length} (about ${usd(allEstimate)})`}</button>
        </div>
      </section>

      <section className="card" aria-labelledby="add-h">
        <h2 id="add-h">Follow a creator</h2>
        <p className="muted">Public business or creator accounts whose content you want to learn from. Only their public profile and post numbers are read. Never their comments, followers or messages.</p>
        <form className="row" style={{ flexWrap: "wrap", marginTop: 8 }} onSubmit={(e) => { e.preventDefault(); start(async () => { const r = await addCreator(platform, handle, niche, why); if (!r.ok) { setError(r.error); return; } setError(null); setHandle(""); setNiche(""); setWhy(""); toast("Creator added"); }); }}>
          <select value={platform} onChange={(e) => setPlatform(e.target.value)} aria-label="Platform">{Object.entries(NAME).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          <input value={handle} onChange={(e) => { setHandle(e.target.value); setError(null); }} placeholder="@handle or profile link" aria-label="Handle or profile link" style={{ flex: "1 1 200px" }} />
          <input value={niche} onChange={(e) => setNiche(e.target.value)} placeholder="Niche (optional)" aria-label="Niche" style={{ width: 150 }} />
          <input value={why} onChange={(e) => setWhy(e.target.value)} placeholder="Why you follow them (optional)" aria-label="Why you follow them" style={{ flex: "2 1 240px" }} />
          <button disabled={pending || !handle.trim()}><Plus size={15} aria-hidden /> Add</button>
        </form>
        {platform === "linkedin" && <p className="muted" style={{ marginTop: 6 }}>LinkedIn creators are saved for reference only. They are never checked automatically, to protect your account.</p>}
        {error && <p className="error" role="alert">{error}</p>}
        <p className="muted" style={{ marginTop: 6 }}>{creators.filter((c) => c.active).length} of {maxActive} active creators.</p>
      </section>

      <section className="card table-wrap" aria-label="Creators">
        {creators.length === 0 ? <p className="muted" style={{ padding: 16 }}>No creators yet. Add the first one above.</p> : (
          <table>
            <thead><tr><th>Creator</th><th>Why</th><th className="num">Followers</th><th className="num">Posts</th><th className="num">Outliers</th><th>Checked</th><th></th></tr></thead>
            <tbody>
              {creators.map((c) => (
                <tr key={c.id} style={c.active ? undefined : { opacity: 0.55 }}>
                  <td>
                    <a href={c.profile_url ?? "#"} target="_blank" rel="noreferrer"><b>{c.display_name ?? c.handle}</b></a>
                    <div className="muted">{NAME[c.platform]} · @{c.handle}{c.niche ? ` · ${c.niche}` : ""}{!c.active ? " · paused" : ""}</div>
                    {c.link_in_bio && <div className="muted">Link in bio: <a href={c.link_in_bio} target="_blank" rel="noreferrer">{c.link_in_bio.replace(/^https?:\/\//, "").slice(0, 40)}</a></div>}
                    {notes[c.id] && <div role="status" style={{ marginTop: 4 }}>{notes[c.id]}</div>}
                  </td>
                  <td className="muted" style={{ maxWidth: 260 }}>{c.why_i_follow ?? "–"}</td>
                  <td className="num">{c.followers === null ? "–" : Number(c.followers).toLocaleString("en-GB")}</td>
                  <td className="num">{c.posts}</td>
                  <td className="num">{c.outliers}</td>
                  <td className="muted">{when(c.last_checked_at)}</td>
                  <td>
                    <div className="row" style={{ gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                      {c.platform !== "linkedin" && <button className="secondary" disabled={!tokenSet || !c.active || busy !== null} onClick={() => check(c)}>{busy === c.id ? "Checking… (about 30 seconds)" : `Check now (about ${usd(c.estimate)})`}</button>}
                      <button className="link" disabled={pending} onClick={() => start(async () => { await updateCreator(c.id, { active: !c.active }); })}>{c.active ? "Pause" : "Resume"}</button>
                      {confirm === c.id ? (
                        <span className="row" style={{ gap: 6 }}>Delete them and their {c.posts} saved posts?
                          <button className="link" disabled={pending} onClick={() => start(async () => { await removeCreator(c.id); setConfirm(null); })}>Yes</button>
                          <button className="link" onClick={() => setConfirm(null)}>No</button>
                        </span>
                      ) : <button className="link" onClick={() => setConfirm(c.id)}>Remove</button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
