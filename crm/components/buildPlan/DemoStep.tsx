"use client";

import Link from "next/link";
import { useState } from "react";
import { runDemoAction, saveDemoAction } from "@/lib/buildPlanActions";
import type { DemoStep as Demo, Picked, StepState } from "@/lib/buildPlanMath";
import MermaidView from "@/components/MermaidView";
import { useToast } from "@/components/Toast";
import { field, rowsFor, StepFrame, useBuildPlan } from "./shared";

export type CaseOption = { id: number; label: string };
const KIND = { trigger: "Start", action: "Action", branch: "Decision", logic: "Logic", ai: "AI step" } as const;

// Step 3. The chosen workflow drawn as a diagram (by code) with one plain line per step, and a case study from the owner's own
// table when one matches. The case study's words are never written by AI: it can be swapped or removed here, and edited in Proof and answers.
export default function DemoStep({ step, picked, state, cases }: { step?: Demo; picked: Picked | null; state: StepState; cases: CaseOption[] }) {
  const { busy, run } = useBuildPlan();
  const toast = useToast();
  const [heading, setHeading] = useState(step?.heading ?? "");
  const [summary, setSummary] = useState(step?.summary ?? "");
  const [lines, setLines] = useState(step?.walkthrough ?? []);
  const [code, setCode] = useState(step?.mermaid ?? "");
  const [caseId, setCaseId] = useState<number | null>(step?.case_study?.proof_id ?? null);
  const steps = new Map((picked?.workflow.steps ?? []).map((s) => [s.id, s]));
  const rerun = () => {
    if (step && state === "ready" && !window.confirm("Write the walkthrough again? This replaces it, including your edits.")) return;
    run("demo", runDemoAction, {}, "Demo workflow written");
  };
  const save = (pick: number | null = caseId) => run("demo", saveDemoAction, { value: JSON.stringify({ heading, summary, mermaid: code, walkthrough: lines, case_id: pick }) }, "Demo workflow saved");
  const openFull = async () => {
    const res = await fetch("/api/flowcharts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: `Workflow: ${picked?.name ?? "demo"}`.slice(0, 120), code, theme: "auto" }) });
    const body = await res.json().catch(() => ({}));
    if (res.ok && body.flowchart) window.open(`/flowcharts/${body.flowchart.id}`, "_blank", "noopener");
    else toast(body.error ?? "Could not open it in Flowcharts.", "bad");
  };
  const c = step?.case_study ?? null;
  return (
    <StepFrame step="demo" state={state} canRun={!!picked} runLabel={step ? "Write again" : "Write walkthrough"} onRun={rerun}
      stale="This was written for a different pain point or workflow. Write it again before you use it."
      intro={picked ? "The chosen workflow as a diagram with a plain walkthrough of each step, plus one of your case studies if it matches." : "Choose a workflow in step 2 first."}>
      {step && (
        <>
          {field("Heading the client sees", <input value={heading} maxLength={120} onChange={(e) => setHeading(e.target.value)} />)}
          {picked && !picked.own && (picked.source === "demo"
            ? <p className="muted">This is a demo you built, so it is headed as a demo, not as a workflow you use. You can run it or add it to your n8n from the Run a demo tab.</p>
            : <p className="muted">This is {picked.source === "n8n" ? "a public template" : "not marked as a workflow you have run"}, so it is headed as a pattern you would start from, not a workflow you use. Once you have run it yourself, save it to your workflow library and it is headed as yours.</p>)}
          <MermaidView code={code} />
          <details>
            <summary className="muted" style={{ cursor: "pointer" }}>Diagram code (Mermaid)</summary>
            <textarea rows={Math.min(14, code.split("\n").length + 1)} value={code} onChange={(e) => setCode(e.target.value)} aria-label="Demo diagram Mermaid code" spellCheck={false} className="bp-mono" style={{ marginTop: 8 }} />
          </details>
          <div><button type="button" className="secondary" onClick={openFull}>Open full screen in Flowcharts</button></div>
          {field("What it does, in a line", <textarea rows={Math.max(2, Math.ceil(summary.length / 110))} value={summary} maxLength={300} onChange={(e) => setSummary(e.target.value)} />)}
          <div>
            <span className="field-label">Walkthrough</span>
            <ol className="bp-walk">
              {lines.map((w, i) => {
                const s = steps.get(w.id);
                return (
                  <li key={w.id}>
                    <span className="bp-walk-n" aria-hidden>{i + 1}</span>
                    <label>
                      <textarea rows={rowsFor(w.text, 110, 1)} value={w.text} maxLength={300} aria-label={`Step ${i + 1}`} onChange={(e) => setLines(lines.map((x) => (x.id === w.id ? { ...x, text: e.target.value } : x)))} />
                      {s && <span className="bp-walk-name">{KIND[s.kind]}: {s.name}{s.app ? ` · ${s.app}` : ""}</span>}
                    </label>
                  </li>
                );
              })}
            </ol>
          </div>
          {picked && picked.workflow.dropped > 0 && <p className="muted">This workflow has {picked.workflow.dropped} more steps than are shown here.</p>}
          {step.notes.map((n, i) => <p key={i} className="bp-note">{n}</p>)}

          <div className="bp-case">
            <div className="row" style={{ justifyContent: "space-between" }}>
              <b>{c ? "Case study attached" : "No client story attached"}</b>
              <label className="row" style={{ gap: 6 }}>
                <span className="muted">Use</span>
                <select value={caseId ?? ""} disabled={!!busy} aria-label="Case study to attach" style={{ width: "auto", maxWidth: 320 }}
                  onChange={(e) => { const pick = e.target.value ? Number(e.target.value) : null; setCaseId(pick); save(pick); }}>
                  <option value="">No client story</option>
                  {cases.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                </select>
              </label>
            </div>
            {c ? (
              <>
                <dl>
                  <dt>Who for</dt><dd>{c.client_type}</dd>
                  <dt>The problem</dt><dd>{c.problem}</dd>
                  <dt>What I built</dt><dd>{c.built}</dd>
                  {c.results && <><dt>Results</dt><dd>{c.results}</dd></>}
                </dl>
                {step.case_reason && <p className="muted" style={{ margin: 0 }}>Why it was matched: {step.case_reason}</p>}
              </>
            ) : (
              <p className="muted" style={{ margin: 0 }}>{cases.length ? "None of your case studies was a close enough match for this pain point, so the demo workflow stands on its own." : "You have no case studies yet, so the demo workflow stands on its own."}</p>
            )}
            <p className="muted" style={{ margin: 0 }}>Case studies are your own words, placed as written, with a real client&apos;s name swapped for &ldquo;the client&rdquo;. They are the projects marked Real client or My own business under <Link href="/proposals/library#proof-h">Proof and answers</Link>, with the problem filled in.</p>
          </div>
          <div><button type="button" className="secondary" disabled={!!busy} onClick={() => save()}>Save edits</button></div>
        </>
      )}
    </StepFrame>
  );
}
