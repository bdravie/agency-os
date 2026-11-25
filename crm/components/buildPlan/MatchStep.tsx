"use client";

import { useMemo, useState } from "react";
import { Check, ExternalLink } from "lucide-react";
import { clearWorkflowAction, pasteWorkflowAction, pickWorkflowAction, runMatchesAction } from "@/lib/buildPlanActions";
import type { MatchStep as Matches, PainStep, Picked, StepState } from "@/lib/buildPlanMath";
import { looksLikeUrl } from "@/lib/n8nTemplatesMath";
import { MAX_FILE_CHARS, parseWorkflowText } from "@/lib/workflowParse";
import { useToast } from "@/components/Toast";
import { field, StepFrame, useBuildPlan } from "./shared";

const PLATFORM = { n8n: "n8n", make: "Make" } as const;

/** A workflow the owner brings: a link to an n8n template, or an exported file. The file is read here in the browser, so only its outline is sent. */
function PasteBox() {
  const { busy, run } = useBuildPlan();
  const toast = useToast();
  const [raw, setRaw] = useState("");
  const [own, setOwn] = useState(false);
  const [keep, setKeep] = useState(false);
  const [name, setName] = useState("");
  const [solves, setSolves] = useState("");
  const [tags, setTags] = useState("");
  const isLink = looksLikeUrl(raw);
  const read = useMemo(() => (raw.trim() && !isLink ? parseWorkflowText(raw) : null), [raw, isLink]);
  const w = read?.workflow;
  const load = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_FILE_CHARS) { toast("That file is too large to read here (over 1.5 MB).", "bad"); return; }
    setRaw(await file.text());
  };
  const use = async () => {
    const r = isLink
      ? await run("matches", pasteWorkflowAction, { url: raw.trim() }, "Workflow chosen")
      : await run("matches", pasteWorkflowAction, { outline: JSON.stringify(w), name: name || w?.name || "", solves, tags, ...(own ? { own: "on" } : {}), ...(own && keep ? { keep: "on" } : {}) }, "Workflow chosen");
    if (r) { setRaw(""); setKeep(false); }
  };
  return (
    <details className="lp-item">
      <summary><b>Use a different workflow</b> <span className="muted">Paste an n8n template link, or the JSON of an n8n workflow or a Make blueprint</span></summary>
      <div className="stack" style={{ gap: 10 }}>
        <div className="bp-file">
          <input type="file" accept=".json,application/json" aria-label="Choose a workflow file" onChange={(e) => { load(e.target.files?.[0]); e.target.value = ""; }} />
          <span className="muted">The file is read in your browser. Only its outline (step names, apps and how they connect) is saved, never its settings.</span>
        </div>
        <textarea rows={raw && !isLink ? 5 : 2} value={raw.length > 4000 ? `${raw.slice(0, 4000)}…` : raw} readOnly={raw.length > 4000} onChange={(e) => setRaw(e.target.value)}
          placeholder="https://n8n.io/workflows/1234-name, or paste the workflow's JSON" aria-label="Template link or workflow JSON" className="bp-mono" spellCheck={false} />
        {read?.error && <p className="error" role="alert">{read.error}</p>}
        {w && (
          <>
            <p style={{ margin: 0 }}><span className="badge tone-neutral">{PLATFORM[w.platform]}</span> <b>{w.name || "Unnamed workflow"}</b> · {w.steps.length} steps{w.dropped ? ` (${w.dropped} more left out)` : ""}{w.apps.length ? ` · ${w.apps.join(", ")}` : ""}</p>
            <label><input type="checkbox" checked={own} onChange={(e) => setOwn(e.target.checked)} /> I have run this workflow myself (it is then presented as a workflow you use)</label>
            {own && <label><input type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} /> Also save it to my workflow library</label>}
            {own && keep && (
              <div className="grid">
                {field("Name", <input value={name} placeholder={w.name} maxLength={120} onChange={(e) => setName(e.target.value)} />)}
                {field("Tags (commas)", <input value={tags} onChange={(e) => setTags(e.target.value)} />)}
                {field("The problem it solves, in a line", <input value={solves} maxLength={300} onChange={(e) => setSolves(e.target.value)} />)}
              </div>
            )}
          </>
        )}
        <div><button type="button" className="secondary" disabled={!!busy || !(isLink || w)} onClick={use}>Use this workflow</button></div>
      </div>
    </details>
  );
}

// Step 2. Looks through the owner's own workflows first (the demos they have built and their saved library), then n8n's public
// templates for the places left, shows the top 3 with a reason each, and the owner picks one.
const SOURCE = { demo: "Your demo", library: "Your library", n8n: "n8n template" } as const;
export default function MatchStep({ pains, step, picked, state, templatesOn }: { pains?: PainStep; step?: Matches; picked: Picked | null; state: StepState; templatesOn: boolean }) {
  const { busy, run } = useBuildPlan();
  const [search, setSearch] = useState((pains?.search ?? []).join(", "));
  const [wide, setWide] = useState(false);
  const find = () => run("matches", runMatchesAction, { search, ...(wide ? { wide: "1" } : {}) }, "Search finished");
  return (
    <StepFrame step="matches" state={state} canRun={!!pains} runLabel={step ? "Search again" : "Find workflows"} onRun={find}
      stale="These were found for a different pain point. Search again, or keep the workflow you chose if it still fits."
      intro={templatesOn ? "Looks through your own workflows first: the demos you have built and your saved library. n8n's public template library is only searched for the places left. You pick one." : "Looks through your own workflows: the demos you have built and your saved library (n8n's public library is switched off). You pick one, or paste one."}>
      {pains && (
        <div className="bp-search">
          {field("Search words (up to 3 phrases, commas between)", <input value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing && !busy) find(); }} />)}
          {templatesOn && <label className="row" style={{ gap: 6 }}><input type="checkbox" checked={wide} onChange={(e) => setWide(e.target.checked)} /> Search n8n&apos;s library as well, even when my own fit</label>}
        </div>
      )}
      {step?.notes.map((n, i) => <p key={i} className="bp-note">{n}</p>)}
      {step && step.matches.length > 0 && (
        <>
          <div className="bp-matches">
            {step.matches.map((m) => {
              const on = picked?.ref === m.ref;
              return (
                <div key={m.ref} className={`bp-match${on ? " on" : ""}`}>
                  <span className="row" style={{ gap: 6 }}><span className={`badge tone-${m.source === "n8n" ? "neutral" : "good"}`}>{SOURCE[m.source] ?? "n8n template"}</span>{m.source !== "n8n" && typeof m.score === "number" && <span className="muted" title="The same score as on the Run a demo tab: shared tags, tools and wording, worked out in code.">Match {m.score} / 100</span>}</span>
                  <h4>{m.name}</h4>
                  <p>{m.reason}</p>
                  {m.apps.length > 0 && <div className="bp-apps">{m.apps.slice(0, 6).map((a) => <span key={a} className="badge tone-neutral">{a}</span>)}</div>}
                  <div className="row bp-match-foot">
                    {on ? <span className="badge tone-good"><Check size={13} aria-hidden /> Chosen</span>
                      : <button type="button" className="secondary" disabled={!!busy} onClick={() => run("matches", pickWorkflowAction, { ref: m.ref }, "Workflow chosen")}>Use this one</button>}
                    {m.url && <a href={m.url} target="_blank" rel="noreferrer" className="row" style={{ gap: 4 }}>Open on n8n <ExternalLink size={13} aria-hidden /></a>}
                  </div>
                </div>
              );
            })}
          </div>
          <p className="muted">Top {step.matches.length} of {step.considered} found{step.search.length ? ` for: ${step.search.join(", ")}` : ""}.{templatesOn ? " Free n8n templates only; nothing about who made a template is kept." : ""}</p>
        </>
      )}
      {picked && (
        <div className="bp-chosen">
          <p><b>Chosen:</b> {picked.name} · {PLATFORM[picked.workflow.platform]} · {picked.workflow.steps.length} steps{picked.workflow.apps.length ? ` · ${picked.workflow.apps.join(", ")}` : ""}
            {picked.own ? <> <span className="badge tone-good">Yours</span></> : picked.source === "demo" ? <> <span className="badge tone-good">Your demo</span></> : <> <span className="badge tone-neutral">{picked.source === "n8n" ? "Public template" : "Not marked as yours"}</span></>}</p>
          <button type="button" className="link" disabled={!!busy} onClick={() => run("matches", clearWorkflowAction, {}, "Workflow cleared")}>Plan without a workflow</button>
        </div>
      )}
      {pains && <PasteBox />}
    </StepFrame>
  );
}
