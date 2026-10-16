"use client";

import { Check } from "lucide-react";
import { STAGES, STAGE_META } from "@/lib/stages";

// Pick where a deal is in the pipeline. Open stages read left to right; Won and Lost close it.
export default function DealStageBar({ stage, onPick, disabled }: { stage: string; onPick: (s: string) => void; disabled?: boolean }) {
  const idx = STAGES.indexOf(stage as (typeof STAGES)[number]);
  return (
    <div className="stagebar" role="group" aria-label="Deal stage">
      {STAGES.map((s, i) => {
        const m = STAGE_META[s];
        const done = idx >= 0 && idx <= STAGES.indexOf("Proposal sent") && i < idx;
        return (
          <button key={s} type="button" disabled={disabled} onClick={() => onPick(s)} title={m.hint}
            aria-pressed={s === stage} className={`stage-chip${s === stage ? " on" : ""}${done ? " done" : ""}${s === "Won" ? " won" : ""}${s === "Lost" ? " lost" : ""}`}>
            {done ? <Check size={12} aria-hidden /> : <i className="dot" style={{ background: m.colour }} aria-hidden />}
            {m.label}
          </button>
        );
      })}
    </div>
  );
}
