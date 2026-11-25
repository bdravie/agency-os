"use client";

import { createContext, useContext, type ReactNode } from "react";
import { RefreshCw } from "lucide-react";
import { STEP_LABELS, type StepKey, type StepState } from "@/lib/buildPlanMath";
import type { StepResult } from "@/lib/buildPlanActions";

export type StepAction = (form: FormData) => Promise<StepResult>;
export type Shared = {
  id: number;
  busy: StepKey | null;
  /** Runs one action for one step: shows it as working, reports a failure, and returns the result (or null if it failed). */
  run: (step: StepKey, action: StepAction, extra?: Record<string, string>, done?: string) => Promise<StepResult | null>;
};
export const BuildPlanContext = createContext<Shared>({ id: 0, busy: null, run: async () => null });
export const useBuildPlan = () => useContext(BuildPlanContext);

export const toLines = (s: string) => s.split("\n").map((l) => l.replace(/^\s*[-*•]\s+/, "").trim()).filter(Boolean);
/** Rows for a box holding lines that wrap: enough to show all of it at roughly `perLine` characters across. */
export const rowsFor = (text: string, perLine: number, min = 2) => Math.max(min, text.split("\n").reduce((n, l) => n + Math.max(1, Math.ceil(l.length / perLine)), 0));
export const field = (label: string, input: ReactNode) => <label className="stack" style={{ gap: 4 }}><span className="field-label" style={{ marginBottom: 0 }}>{label}</span>{input}</label>;

export const STATE_TEXT: Record<StepState | "working", string> = { empty: "Not run yet", ready: "Done", stale: "Out of date", working: "Working…" };
const N: Record<StepKey, number> = { pains: 1, matches: 2, demo: 3, plan: 4 };

/** One step's card: its number and name, whether it is out of date, and the button that runs it (again). */
export function StepFrame({ step, state, intro, stale, runLabel, onRun, canRun = true, extra, children }: {
  step: StepKey; state: StepState; intro: ReactNode; stale?: string; runLabel: string; onRun: () => void; canRun?: boolean; extra?: ReactNode; children?: ReactNode;
}) {
  const { busy } = useBuildPlan();
  const working = busy === step;
  return (
    <div className="lp-section bp-step" id={`bp-${step}`} aria-busy={working}>
      <div className="lp-head">
        <div>
          <h3><span className="bp-num">{N[step]}</span> {STEP_LABELS[step]}{state === "stale" && <span className="badge tone-warn">Out of date</span>}</h3>
          <p className="muted">{intro}</p>
        </div>
        <div className="row">
          {extra}
          <button type="button" className="secondary" disabled={!!busy || !canRun} onClick={onRun}>
            <RefreshCw size={14} aria-hidden /> {working ? "Working…" : runLabel}
          </button>
        </div>
      </div>
      {state === "stale" && stale && <p className="bp-note" role="status">{stale}</p>}
      {children}
    </div>
  );
}
