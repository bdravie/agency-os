"use client";

import { useState } from "react";
import { ExternalLink, Play, Square } from "lucide-react";
import "@/app/proposals/demo-run.css";
import { runDemoAction, stopDemoAction, type DemoRunResult } from "@/lib/demoRunActions";
import { n8nImportLines, type DemoMatch } from "@/lib/demoRunMath";
import type { Serving } from "@/lib/demoRun";
import CopyButton from "@/components/CopyButton";

// The Run a demo tab on a proposal: the three demos you have already built that are closest to this job, scored by code
// (shared tools, tags and wording; no AI), each with a button that runs its demo version on this computer.
// The demo version is the free one: fake data, the demo's own offline mode, nothing sent. One demo page is up at a time.
export default function DemoRunPanel({ id, top, closer, problems, demos, serving: first }: {
  id: number; top: DemoMatch[]; closer: DemoMatch[]; problems: string[]; demos: number; serving: Serving | null;
}) {
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
            const lines = n8nImportLines(recipe);
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
                  <button type="button" className={i === 0 ? undefined : "secondary"} disabled={!!busy} onClick={() => run(recipe.folder)}>
                    <Play size={14} aria-hidden /> {working ? "Running…" : up ? "Run again" : r ? "Run again" : "Run demo"}
                  </button>
                </div>

                {r && (
                  <div className="dr-result">
                    {r.error ? <p className="error" role="alert">{r.error}</p> : <p className="dr-ok" role="status">Ran{typeof r.seconds === "number" ? ` in ${r.seconds} seconds` : ""}.{up ? " Its pages are up: the links are at the top." : ""}</p>}
                    {r.output && <pre className="dr-out" tabIndex={0} aria-label={`What ${m.name} printed`}>{r.output}</pre>}
                    {recipe.note && <p className="muted">{recipe.note}</p>}
                  </div>
                )}

                <details className="dr-more">
                  <summary className="muted">Files, and showing it inside n8n</summary>
                  <p className="muted">Folder: <code>demos/{recipe.folder}/</code>. The Loom script is <code>loom-script.md</code> and the full setup is in <code>README.md</code>.</p>
                  {lines.length > 0 && (
                    <>
                      <p className="muted">To show the workflow inside n8n: start n8n in Terminal with <code>npx n8n</code>, open <a href="http://localhost:5678" target="_blank" rel="noopener noreferrer">localhost:5678</a> and sign in with the local login you made the first time. To load this demo&apos;s workflow, stop n8n and run this from the project folder, then start it again:</p>
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
    </section>
  );
}
