"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Workflow } from "lucide-react";
import "@/app/proposals/loom-pitch.css";
import "@/app/proposals/build-plan.css";
import { runDemoAction, runMatchesAction, runPainsAction, runPlanAction } from "@/lib/buildPlanActions";
import { applicationText, cleanPicked, stepStates, STEP_LABELS, STEPS, type BuildPlan, type Currency, type StepKey } from "@/lib/buildPlanMath";
import type { Rates } from "@/lib/proposalPlanMath";
import CopyButton from "@/components/CopyButton";
import { useToast } from "@/components/Toast";
import DemoStep, { type CaseOption } from "./DemoStep";
import MatchStep from "./MatchStep";
import PainsStep from "./PainsStep";
import PlanStep from "./PlanStep";
import { BuildPlanContext, STATE_TEXT, type Shared } from "./shared";

// The Build plan tab: paste a job post, get the pain point to lead with, a workflow that solves it, a walkthrough of that workflow
// and a plan with milestones, timeline and a fixed price. Four visible steps, each editable and re-runnable on its own.
// Run all does them in order, taking the top-ranked choice at steps 1 and 2. Nothing is sent anywhere.
export default function BuildPlanPanel({ id, title, plan, at, rates, usdToGbp, cases, tools, job, templatesOn, autoRun }: {
  id: number; title: string; plan: BuildPlan | null; at: string | null; rates: Rates; usdToGbp: number | null; cases: CaseOption[];
  tools: { strong_tools: string[]; familiar_tools: string[] }; job: string; templatesOn: boolean; autoRun: boolean;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState<StepKey | null>(null);
  const [failed, setFailed] = useState<{ step: StepKey; message: string } | null>(null);
  const [all, setAll] = useState(false);
  const [currency, setCurrency] = useState<Currency>("GBP");
  const bp = useMemo(() => plan ?? {}, [plan]);
  const states = stepStates(bp);
  const picked = useMemo(() => cleanPicked(bp.workflow), [bp.workflow]);

  const run = useCallback<Shared["run"]>(async (step, action, extra = {}, done) => {
    const form = new FormData();
    form.set("id", String(id));
    for (const [k, v] of Object.entries(extra)) form.set(k, v);
    setBusy(step); setFailed(null);
    try {
      const r = await action(form);
      if (r?.error) { setFailed({ step, message: r.error }); toast(r.error, "bad"); return null; }
      if (done) toast(done);
      return r ?? {};
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setFailed({ step, message }); toast(message, "bad");
      return null;
    } finally {
      setBusy(null);
    }
  }, [id, toast]);

  const runAll = useCallback(async () => {
    setAll(true);
    try {
      if (!(await run("pains", runPainsAction))) return;
      const found = await run("matches", runMatchesAction, { auto: "1" });
      if (!found) return;
      if (found.picked && !(await run("demo", runDemoAction))) return;
      if (await run("plan", runPlanAction)) toast(found.picked ? "Build plan ready" : "Build plan ready. No workflow was found, so there is no demo: paste one in step 2 if you have it.");
    } finally {
      setAll(false);
    }
  }, [run, toast]);

  // Arriving from New proposal > Build plan: that click asked for the whole run. The address is cleaned first so a reload never runs it twice.
  const started = useRef(false);
  useEffect(() => {
    if (!autoRun || started.current) return;
    started.current = true;
    window.history.replaceState(null, "", `/proposals/${id}?tab=build`);   // no round trip to the server, so it cannot race the first step
    if (!plan?.pains) runAll();
  }, [autoRun, id, plan, runAll]);

  const startAll = () => {
    if (bp.pains && !window.confirm("Run all four steps again? This replaces everything here, including your edits and the workflow you chose.")) return;
    runAll();
  };
  const text = useMemo(() => applicationText(bp, rates, { currency, usdToGbp }), [bp, rates, currency, usdToGbp]);
  const ready = STEPS.filter((s) => states[s] === "ready").length;

  return (
    <BuildPlanContext.Provider value={{ id, busy, run }}>
      <section className="card stack" style={{ gap: 16 }} aria-labelledby="bp-h">
        <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
          <div style={{ flex: "1 1 420px" }}>
            <h2 id="bp-h">Build plan</h2>
            <p className="muted">Everything for one application without building a demo first: the pain point to lead with, a workflow that solves it, and a plan of what you would build with milestones, timeline and a fixed price. Runs only when you click; nothing is sent.</p>
          </div>
          <button type="button" disabled={!!busy} onClick={startAll}><Workflow size={15} aria-hidden /> {all ? "Running… (about a minute)" : bp.pains ? "Run all again" : "Run all four steps"}</button>
        </div>

        <ol className="bp-rail" aria-label="Build plan steps">
          {STEPS.map((s, i) => {
            const state = busy === s ? "working" : states[s];
            return (
              <li key={s} data-state={state}>
                <a href={`#bp-${s}`}>
                  <span className="bp-dot" aria-hidden>{state === "ready" ? <Check size={15} /> : i + 1}</span>
                  <span className="bp-rail-name">{STEP_LABELS[s]}</span>
                  <span className="bp-rail-state">{STATE_TEXT[state]}</span>
                </a>
              </li>
            );
          })}
        </ol>
        {failed && <p className="error" role="alert">{STEP_LABELS[failed.step]}: {failed.message}</p>}

        <PainsStep key={`pains-${bp.pains?.at ?? ""}`} step={bp.pains} state={states.pains} />
        <MatchStep key={`matches-${bp.matches?.at ?? ""}-${bp.pains?.search.join("|") ?? ""}`} pains={bp.pains} step={bp.matches} picked={picked} state={states.matches} templatesOn={templatesOn} />
        <DemoStep key={`demo-${bp.demo?.at ?? ""}-${bp.demo?.case_study?.proof_id ?? ""}`} step={bp.demo} picked={picked} state={states.demo} cases={cases} />
        <PlanStep key={`plan-${bp.plan?.at ?? ""}`} step={bp.plan} state={states.plan} title={title} hasPains={!!bp.pains} hasWorkflow={!!picked} rates={rates} usdToGbp={usdToGbp} job={job} tools={tools} />

        <div className="lp-section bp-step" id="bp-application">
          <div className="lp-head">
            <div>
              <h3>For the application</h3>
              <p className="muted">Put together by code from the steps as saved ({ready} of 4 up to date). A step that is missing or out of date is left out. Save your edits first.</p>
            </div>
            {usdToGbp && (
              <div className="pills" role="radiogroup" aria-label="Currency for the price">
                {(["GBP", "USD"] as Currency[]).map((c) => <button key={c} type="button" role="radio" aria-checked={currency === c} className={`pill${currency === c ? " on" : ""}`} onClick={() => setCurrency(c)}>{c === "GBP" ? "Pounds" : "Dollars"}</button>)}
              </div>
            )}
          </div>
          {text ? (
            <>
              <textarea id="bp-application-text" rows={Math.min(26, text.split("\n").length + 1)} value={text} readOnly aria-label="Text for the application" />
              <div className="row">
                <CopyButton targetId="bp-application-text" label="Copy for the application" />
                <span className="muted">{text.length.toLocaleString("en-GB")} characters{at ? ` · last changed ${new Date(at).toLocaleString("en-GB")}` : ""}</span>
              </div>
            </>
          ) : <p className="muted">Nothing yet. Run the steps above.</p>}
        </div>
      </section>
    </BuildPlanContext.Provider>
  );
}
