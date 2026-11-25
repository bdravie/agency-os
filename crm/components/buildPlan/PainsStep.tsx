"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { runPainsAction, savePainsAction } from "@/lib/buildPlanActions";
import type { Cost, Pain, PainStep, StepState } from "@/lib/buildPlanMath";
import { StepFrame, useBuildPlan } from "./shared";

const COSTS: Record<Cost, string> = { money: "Costs money", time: "Costs time", both: "Money and time" };

// Step 1. Every pain point carries the words from the job post that show it. The first is the AI's pick of the most costly one;
// choosing another is one click and marks the later steps as out of date.
export default function PainsStep({ step, state }: { step?: PainStep; state: StepState }) {
  const { busy, run } = useBuildPlan();
  const [pains, setPains] = useState<Pain[]>(step?.pains ?? []);
  const chosen = step?.chosen ?? "";
  const edit = (i: number, change: Partial<Pain>) => setPains(pains.map((p, n) => (n === i ? { ...p, ...change } : p)));
  const send = (pick: string, done: string) => run("pains", savePainsAction, { value: JSON.stringify({ chosen: pick, search: step?.search ?? [], pains }) }, done);
  const rerun = () => {
    if (step && !window.confirm("Find the pain points again? This replaces them, including your edits.")) return;
    run("pains", runPainsAction, {}, "Pain points found");
  };
  return (
    <StepFrame step="pains" state={state} runLabel={step ? "Find again" : "Find pain points"} onRun={rerun}
      intro="Every pain point in the job post, ranked by what it costs the client. The application is built around one. Each is shown with the client's own words.">
      {step && (
        <>
          <div className="bp-pains" role="radiogroup" aria-label="The pain point to build the application around">
            {pains.map((p, i) => (
              <div key={p.id} className={`bp-pain${p.id === chosen ? " on" : ""}`}>
                <input type="radio" name="bp-angle" checked={p.id === chosen} disabled={!!busy} aria-label={`Use as the angle: ${p.pain}`} onChange={() => send(p.id, "Angle changed")} />
                <div className="bp-pain-body">
                  <span className="bp-rank">{p.id.startsWith("own") ? "Added by you" : `Ranked ${i + 1}`}{p.id === chosen ? " · the angle" : ""}</span>
                  <div className="bp-pain-top">
                    <input value={p.pain} maxLength={160} aria-label={`Pain point ${i + 1}`} onChange={(e) => edit(i, { pain: e.target.value })} />
                    <select value={p.cost} aria-label={`What pain point ${i + 1} costs them`} onChange={(e) => edit(i, { cost: e.target.value as Cost })}>
                      {(Object.keys(COSTS) as Cost[]).map((c) => <option key={c} value={c}>{COSTS[c]}</option>)}
                    </select>
                  </div>
                  {p.quote && <p className="bp-quote">&ldquo;{p.quote}&rdquo;</p>}
                  <input value={p.why} maxLength={220} placeholder="Why it costs them (optional)" aria-label={`Why pain point ${i + 1} costs them`} onChange={(e) => edit(i, { why: e.target.value })} />
                </div>
              </div>
            ))}
          </div>
          <div className="row">
            <button type="button" className="secondary" disabled={!!busy} onClick={() => send(chosen, "Pain points saved")}>Save edits</button>
            {pains.length < 8 && (
              <button type="button" className="secondary" onClick={() => setPains([...pains, { id: `own${pains.length + 1}`, pain: "", quote: "", cost: "both", why: "", search: [] }])}>
                <Plus size={14} aria-hidden /> Add one of my own
              </button>
            )}
          </div>
          {step.data_note && <p className="bp-note"><b>Personal data:</b> {step.data_note}</p>}
        </>
      )}
    </StepFrame>
  );
}
