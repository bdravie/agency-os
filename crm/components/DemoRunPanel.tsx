"use client";

import { useState } from "react";
import { ExternalLink, Play, Send, Square } from "lucide-react";
import "@/app/proposals/demo-run.css";
import { runDemoAction, sendToN8nAction, stopDemoAction, type DemoRunResult, type N8nSendResult } from "@/lib/demoRunActions";
import { n8nImportLines, type DemoMatch } from "@/lib/demoRunMath";
import type { Serving } from "@/lib/demoRun";
import type { N8nStatus } from "@/lib/n8nPush";
import { useConfirm } from "@/components/ConfirmDialog";
import CopyButton from "@/components/CopyButton";

// The Run a demo tab on a proposal: the three demos you have already built that are closest to this job, scored by code
// (shared tools, tags and wording; no AI), each with a button that runs its demo version on this computer.
// The demo version is the free one: fake data, the demo's own offline mode, nothing sent. One demo page is up at a time.
// Send to my n8n adds a demo's workflow to the owner's own n8n through n8n's API, after a confirmation that names where it goes.
export default function DemoRunPanel({ id, top, closer, problems, demos, serving: first, n8n }: {
  id: number; top: DemoMatch[]; closer: DemoMatch[]; problems: string[]; demos: number; serving: Serving | null; n8n: N8nStatus;
}) {
  const [confirm, confirmDialog] = useConfirm();
  const [sent, setSent] = useState<Record<string, N8nSendResult>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, DemoRunResult>>({});
  const [serving, setServing] = useState<Serving | null>(first);

  const run = async (folder: string) => {
    const form = new FormData();
    form.set("id", String(id)); form.set("folder", folder);
    setBusy(folder);
    try {
      const r = await runDemoAction(form);
      setResults((all) => ({ ...all, [folder]: r }));
      if (r.serving !== undefined) setServing(r.serving);
    } catch (err) {
      setResults((all) => ({ ...all, [folder]: { error: err instanceof Error ? err.message : String(err) } }));
    } finally {
      setBusy(null);
    }
  };
  const send = async (folder: string, name: string, files: number) => {
    const ok = await confirm({
      title: files === 1 ? "Add this workflow to your n8n?" : `Add these ${files} workflows to your n8n?`,
      details: [["Demo", name], ["n8n", n8n.local ? `${n8n.label} (on this computer)` : n8n.label]],
      body: "It is added switched off, and nothing already in n8n is changed. A workflow there with the same name is left as it is.",
      confirmLabel: "Add to n8n",
    });
    if (!ok) return;
    const form = new FormData();
    form.set("id", String(id)); form.set("folder", folder);
    setBusy(`n8n:${folder}`);
    try {
      const r = await sendToN8nAction(form);
      setSent((all) => ({ ...all, [folder]: r }));
    } catch (err) {
      setSent((all) => ({ ...all, [folder]: { error: err instanceof Error ? err.message : String(err) } }));
    } finally {
      setBusy(null);
    }
  };
  const stop = async () => {
    setBusy("stop");
    try { const r = await stopDemoAction(); setServing(r.serving ?? null); } finally { setBusy(null); }
  };

  return (
    <section className="card stack dr" style={{ gap: 16 }} aria-labelledby="dr-h">
      <div>
        <h2 id="dr-h">Run a demo you have already built</h2>
        <p className="muted">Your demos from Proof and answers, scored against this job post by code: the tools it names, the tags it matches and the wording it shares. No AI is used. Pick one to run its demo version on this computer: fake data, the demo&apos;s own offline mode, no paid accounts, nothing sent. Each run starts the demo again from its sample data.</p>
      </div>

      {serving && (
        <div className="dr-live" role="status">
          <div>
            <b>{serving.title}</b> is up on this computer (port {serving.port}).
            <span className="dr-links">{serving.open.map((o) => <a key={o.url} href={o.url} target="_blank" rel="noopener noreferrer">{o.label} <ExternalLink size={13} aria-hidden /></a>)}</span>
          </div>
          <button type="button" className="secondary" disabled={!!busy} onClick={stop}><Square size={13} aria-hidden /> {busy === "stop" ? "Stopping…" : "Stop it"}</button>
        </div>
      )}

      {top.length === 0 ? (
        <p className="muted">{demos ? "None of your demos is set up to run from here yet. Add each one to config/demos.yaml." : "No demos yet. Add them under Proposals > Proof and answers as kind Demo, and list how each runs in config/demos.yaml."}</p>
      ) : (
        <ol className="dr-list">
          {top.map((m, i) => {
            const recipe = m.recipe!, r = results[recipe.folder], working = busy === recipe.folder, up = serving?.folder === recipe.folder;
            const lines = n8nImportLines(recipe), pushed = sent[recipe.folder], sending = busy === `n8n:${recipe.folder}`;
            return (
              <li key={m.key} className="dr-item" aria-busy={working}>
                <div className="dr-head">
                  <div className="dr-score" title="Out of 100. Full marks would be 4 shared tags, 3 shared tools and 8 shared distinctive words.">
                    <b>{m.score}</b><span>/ 100</span>
                  </div>
                  <div className="dr-body">
                    <h3><span className="dr-rank">{i + 1}.</span> {m.name}</h3>
                    {m.one_line && <p className="dr-line" title={m.one_line}>{m.one_line}</p>}
                    {m.shares.length > 0
                      ? <p className="dr-shares"><span className="field-label">Shares with this job</span>{m.shares.map((s) => <span key={s} className="badge tone-good">{s}</span>)}</p>
                      : <p className="muted">Nothing in the job post matches this one.</p>}
                    {recipe.shows && <p className="muted"><b>Running it shows:</b> {recipe.shows}</p>}
                  </div>
                  <div className="dr-actions">
                    <button type="button" className={i === 0 ? undefined : "secondary"} disabled={!!busy} onClick={() => run(recipe.folder)}>
                      <Play size={14} aria-hidden /> {working ? "Running…" : up ? "Run again" : r ? "Run again" : "Run demo"}
                    </button>
                    {lines.length > 0 && n8n.ready && (
                      <button type="button" className="secondary" disabled={!!busy} onClick={() => send(recipe.folder, m.name, lines.length)}>
                        <Send size={14} aria-hidden /> {sending ? "Sending…" : "Send to my n8n"}
                      </button>
                    )}
                  </div>
                </div>

                {pushed && (
                  <div className="dr-result">
                    {pushed.error && <p className="error" role="alert">{pushed.error}</p>}
                    {pushed.summary && <p className={pushed.results?.some((x) => x.status === "failed") ? undefined : "dr-ok"} role="status">{pushed.summary}</p>}
                    {pushed.results && pushed.results.length > 0 && (
                      <ul className="dr-sent">
                        {pushed.results.map((x) => (
                          <li key={x.name}>
                            <span className={`badge tone-${x.status === "added" ? "good" : x.status === "already" ? "neutral" : "bad"}`}>{x.status === "added" ? "Added" : x.status === "already" ? "Already there" : "Not added"}</span>
                            <span><b>{x.name}</b>{x.url && <> · <a href={x.url} target="_blank" rel="noopener noreferrer">Open in n8n <ExternalLink size={13} aria-hidden /></a></>}<br /><span className="muted">{x.note}</span></span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}

                {r && (
                  <div className="dr-result">
                    {r.error ? <p className="error" role="alert">{r.error}</p> : <p className="dr-ok" role="status">Ran{typeof r.seconds === "number" ? ` in ${r.seconds} seconds` : ""}.{up ? " Its pages are up: the links are at the top." : ""}</p>}
                    {r.output && <pre className="dr-out" tabIndex={0} aria-label={`What ${m.name} printed`}>{r.output}</pre>}
                    {recipe.note && <p className="muted">{recipe.note}</p>}
                  </div>
                )}

                <details className="dr-more">
                  <summary className="muted">{lines.length > 0 ? "Files, and adding it to n8n by hand" : "Files"}</summary>
                  <p className="muted">Folder: <code>demos/{recipe.folder}/</code>. The Loom script is <code>loom-script.md</code> and the full setup is in <code>README.md</code>.</p>
                  {lines.length > 0 && (
                    <>
                      {n8n.ready
                        ? <p className="muted"><b>Send to my n8n</b> adds this demo&apos;s {lines.length === 1 ? "workflow" : `${lines.length} workflows`} to n8n at {n8n.label} while n8n is running, switched off, ready to open. Connect its credentials there before you turn it on.</p>
                        : <p className="muted"><b>To add it to n8n with one click:</b> {n8n.problem} {n8n.label ? `It will go to n8n at ${n8n.label}; set N8N_API_URL to use another one.` : ""}</p>}
                      <p className="muted">By hand instead: stop n8n, run this in Terminal from the project folder, then start n8n again with <code>npx n8n</code>.</p>
                      <pre className="dr-out" id={`dr-n8n-${recipe.folder}`}>{lines.join("\n")}</pre>
                      <CopyButton targetId={`dr-n8n-${recipe.folder}`} label="Copy the import line" />
                    </>
                  )}
                </details>
              </li>
            );
          })}
        </ol>
      )}

      {closer.length > 0 && (
        <p className="muted">Closer on paper, but not set up to run from here: {closer.map((m) => `${m.name} (${m.score})`).join(", ")}. A demo runs from here once it has a folder in demos/ and an entry in config/demos.yaml.</p>
      )}
      {problems.length > 0 && <p className="dr-note" role="status">Left out of config/demos.yaml: {problems.join("; ")}.</p>}
      {confirmDialog}
    </section>
  );
}
