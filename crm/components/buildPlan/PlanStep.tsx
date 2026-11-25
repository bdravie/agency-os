"use client";

import { useMemo, useState } from "react";
import { Plus, X } from "lucide-react";
import { runPlanAction, savePlanAction } from "@/lib/buildPlanActions";
import { money, planMermaid, quoteFor, stepsWithoutStack, toolsToCheck, type FlowStep, type PlanMilestone, type StepState, type TailoredStep } from "@/lib/buildPlanMath";
import type { Ease, Rates } from "@/lib/proposalPlanMath";
import MermaidView from "@/components/MermaidView";
import { useToast } from "@/components/Toast";
import { field, rowsFor, StepFrame, toLines, useBuildPlan } from "./shared";

const EASE: Record<Ease, string> = { easy: "Easy", medium: "Medium", hard: "Hard" };
const num = (v: string, fallback: number) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : fallback; };

// Step 4. The plan in the client's wording: the flow, a diagram, what they end up with, what is needed and the milestones.
// The AI estimates hours only. The timeline and the fixed price are worked out here from config/rates.yaml as you type.
export default function PlanStep({ step, state, title, hasPains, hasWorkflow, rates, usdToGbp, job, tools }: {
  step?: TailoredStep; state: StepState; title: string; hasPains: boolean; hasWorkflow: boolean; rates: Rates; usdToGbp: number | null; job: string;
  tools: { strong_tools: string[]; familiar_tools: string[] };
}) {
  const { busy, run } = useBuildPlan();
  const toast = useToast();
  const [flow, setFlow] = useState<FlowStep[]>(step?.flow ?? []);
  const [miles, setMiles] = useState<PlanMilestone[]>(step?.milestones ?? []);
  const [outcomes, setOutcomes] = useState((step?.outcomes ?? []).join("\n"));
  const [access, setAccess] = useState((step?.access ?? []).join("\n"));
  const [assumptions, setAssumptions] = useState((step?.assumptions ?? []).join("\n"));
  const [code, setCode] = useState(step?.mermaid ?? "");
  const quote = useMemo(() => (miles.length ? quoteFor(miles, rates) : null), [miles, rates]);
  const unknown = useMemo(() => toolsToCheck(flow, job, tools), [flow, job, tools]);
  const noStack = useMemo(() => stepsWithoutStack(flow), [flow]);
  const setStep = (i: number, change: Partial<FlowStep>) => setFlow(flow.map((f, n) => (n === i ? { ...f, ...change } : f)));
  const setMile = (i: number, change: Partial<PlanMilestone>) => setMiles(miles.map((m, n) => (n === i ? { ...m, ...change } : m)));
  const rerun = () => {
    if (step && state === "ready" && !window.confirm("Write the plan again? This replaces it, including your edits.")) return;
    run("plan", runPlanAction, {}, "Build plan written");
  };
  const save = () => run("plan", savePlanAction, { value: JSON.stringify({ flow, branches: step?.branches ?? [], milestones: miles, outcomes: toLines(outcomes), access: toLines(access), assumptions: toLines(assumptions), mermaid: code }) }, "Build plan saved");
  const openFull = async () => {
    const res = await fetch("/api/flowcharts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: `Plan: ${title}`.slice(0, 120), code, theme: "auto" }) });
    const body = await res.json().catch(() => ({}));
    if (res.ok && body.flowchart) window.open(`/flowcharts/${body.flowchart.id}`, "_blank", "noopener");
    else toast(body.error ?? "Could not open it in Flowcharts.", "bad");
  };
  const p = quote?.pricing;
  return (
    <StepFrame step="plan" state={state} canRun={hasPains} runLabel={step ? "Write again" : "Write build plan"} onRun={rerun}
      stale="This was written for a different pain point or workflow. Write it again before you send it."
      intro={`What you would build for this client, in their wording and their tools${hasWorkflow ? ", adapted from the chosen workflow" : " (no workflow chosen, so it is planned from the job post alone)"}. You show the plan; nothing is built up front.`}>
      {step && (
        <>
          <div>
            <span className="field-label">The flow, from first trigger to final outcome</span>
            <ol className="bp-flow">
              {flow.map((f, i) => (
                <li key={i}>
                  <span className="bp-walk-n" aria-hidden>{i + 1}</span>
                  <input value={f.label} maxLength={40} aria-label={`Step ${i + 1} short label`} placeholder="Short label" onChange={(e) => setStep(i, { label: e.target.value })} />
                  <textarea rows={rowsFor(f.detail, 70)} value={f.detail} maxLength={260} aria-label={`Step ${i + 1} detail`} placeholder="What happens" onChange={(e) => setStep(i, { detail: e.target.value })} />
                  <input value={f.tool ?? ""} maxLength={200} aria-label={`Step ${i + 1} tech stack, separated by commas`} placeholder="Tech stack, commas" onChange={(e) => setStep(i, { tool: e.target.value || null })} />
                  <button type="button" className="secondary bp-x" aria-label={`Remove step ${i + 1}`} disabled={flow.length <= 2} onClick={() => setFlow(flow.filter((_, n) => n !== i))}><X size={14} aria-hidden /></button>
                </li>
              ))}
            </ol>
            {flow.length < 9 && <button type="button" className="link" style={{ marginTop: 6 }} onClick={() => setFlow([...flow, { label: "", detail: "", tool: null }])}><Plus size={13} aria-hidden /> Add a step</button>}
          </div>
          {noStack.length > 0 && <p className="bp-note">No tech stack on step{noStack.length === 1 ? "" : "s"} {noStack.join(", ")}. The client page states it under every step, so list everything {noStack.length === 1 ? "it needs" : "they need"} in the last box, separated by commas.</p>}
          {unknown.length > 0 && <p className="bp-note">Not in the job post or on your tool lists: {unknown.join(", ")}. Check before you send it, or add {unknown.length === 1 ? "it" : "them"} to your profile.</p>}

          <MermaidView code={code} />
          <details>
            <summary className="muted" style={{ cursor: "pointer" }}>Diagram code (Mermaid)</summary>
            <textarea rows={Math.min(14, code.split("\n").length + 1)} value={code} onChange={(e) => setCode(e.target.value)} aria-label="Plan diagram Mermaid code" spellCheck={false} className="bp-mono" style={{ marginTop: 8 }} />
          </details>
          <div className="row">
            <button type="button" className="secondary" onClick={() => setCode(planMermaid(flow.filter((f) => f.label), step.branches.filter((b) => b.from <= flow.length && b.to <= flow.length)))}>Redraw from the steps</button>
            <button type="button" className="secondary" onClick={openFull}>Open full screen in Flowcharts</button>
          </div>

          <div className="bp-lists">
            {field("What the team ends up with (one per line)", <textarea rows={rowsFor(outcomes, 38, 3)} value={outcomes} onChange={(e) => setOutcomes(e.target.value)} />)}
            {field("Tools and access needed (one per line)", <textarea rows={rowsFor(access, 38, 3)} value={access} onChange={(e) => setAccess(e.target.value)} />)}
            {field("This assumes (one per line)", <textarea rows={rowsFor(assumptions, 38, 3)} value={assumptions} onChange={(e) => setAssumptions(e.target.value)} />)}
          </div>

          <div>
            <span className="field-label">Milestones, timeline and fixed price</span>
            <div className="bp-mile-head" aria-hidden><span>Milestone</span><span>What they get (one per line)</span><span>How hard</span><span>Hours from</span><span>Hours to</span><span style={{ textAlign: "right" }}>When and price</span><span /></div>
            <div className="bp-miles">
              {miles.map((m, i) => {
                const line = quote?.lines[i];
                return (
                  <div key={i} className="bp-mile">
                    <input value={m.name} maxLength={80} aria-label={`Milestone ${i + 1} name`} onChange={(e) => setMile(i, { name: e.target.value })} />
                    <textarea rows={rowsFor(m.delivers.join("\n"), 40)} value={m.delivers.join("\n")} aria-label={`Milestone ${i + 1}: what they get`} onChange={(e) => setMile(i, { delivers: e.target.value.split("\n") })} />
                    <select value={m.ease} aria-label={`Milestone ${i + 1}: how hard`} onChange={(e) => setMile(i, { ease: e.target.value as Ease })}>{(Object.keys(EASE) as Ease[]).map((k) => <option key={k} value={k}>{EASE[k]}</option>)}</select>
                    <input type="number" min={0.5} max={80} step={0.5} value={m.hours_low} aria-label={`Milestone ${i + 1}: hours from`} onChange={(e) => { const low = num(e.target.value, m.hours_low); setMile(i, { hours_low: low, hours_high: Math.max(low, m.hours_high) }); }} />
                    <input type="number" min={0.5} max={80} step={0.5} value={m.hours_high} aria-label={`Milestone ${i + 1}: hours to`} onChange={(e) => setMile(i, { hours_high: Math.max(m.hours_low, num(e.target.value, m.hours_high)) })} />
                    <div className="bp-mile-sum">{line && <><b>{money(line.price, "GBP", null)}</b><span className="muted">{line.days === 1 ? `Day ${line.from_day}` : `Days ${line.from_day} to ${line.to_day}`}</span></>}</div>
                    <button type="button" className="secondary bp-x" aria-label={`Remove milestone ${i + 1}`} disabled={miles.length <= 1} onClick={() => setMiles(miles.filter((_, n) => n !== i))}><X size={14} aria-hidden /></button>
                  </div>
                );
              })}
            </div>
            {miles.length < 6 && <button type="button" className="link" style={{ marginTop: 6 }} onClick={() => setMiles([...miles, { name: "", delivers: [], ease: "medium", hours_low: 2, hours_high: 4 }])}><Plus size={13} aria-hidden /> Add a milestone</button>}
          </div>

          {quote && p && (
            <>
              <div className="kv">
                <div><span className="field-label">Fixed price</span><div className="bp-price">{money(quote.total, "GBP", null)}</div>{usdToGbp && <span className="muted">about {money(quote.total, "USD", usdToGbp)}</span>}</div>
                <div><span className="field-label">Timeline</span><div className="kv-value">{quote.days} working day{quote.days === 1 ? "" : "s"}</div><span className="muted">from the day you have access</span></div>
                <div><span className="field-label">Your hours</span><div className="kv-value">{p.hours_low === p.hours_high ? p.hours : `${p.hours_low} to ${p.hours_high}`}</div><span className="muted">priced at the middle ({p.hours}h)</span></div>
                <div><span className="field-label">You keep</span><div className="kv-value">{money(Math.round(p.take_home), "GBP", null)}</div><span className="muted">after Upwork&apos;s {rates.upwork_fee_pct}% (£{p.effective_hourly}/hour)</span></div>
              </div>
              <p className="muted" style={{ margin: 0 }}>
                Worked out in code from config/rates.yaml: £{rates.hourly_rate_gbp}/hour, {rates.hours_per_day} hours a day, {rates.contingency_pct}% buffer{p.floor_applied ? `, lifted to your £${rates.min_project_gbp} minimum` : ""}, rounded up to £{rates.round_to_gbp}. The buffer is shared across the milestones so they add up to the fixed price. If scope is unclear it could land between {money(p.low, "GBP", null)} and {money(p.high, "GBP", null)}.
              </p>
            </>
          )}
          {step.data_note && <p className="bp-note"><b>Personal data:</b> {step.data_note}</p>}
          <div><button type="button" className="secondary" disabled={!!busy} onClick={save}>Save edits</button></div>
        </>
      )}
    </StepFrame>
  );
}
