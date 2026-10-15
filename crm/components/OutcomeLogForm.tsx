"use client";

import { useActionState, useState } from "react";
import { saveReadings, importReadings } from "@/lib/outcomeActions";
import { fmtNum } from "@/lib/outcomeMath";
import ToastForm from "./ToastForm";

type M = { id: number; name: string; unit: string; readings: Record<string, number> };

// Log one month by hand (the boxes fill in with anything already saved for that month), or import a CSV.
export default function OutcomeLogForm({ outcomeId, metrics, defaultMonth, minMonth, maxMonth }: { outcomeId: number; metrics: M[]; defaultMonth: string; minMonth: string; maxMonth: string }) {
  const [month, setMonth] = useState(defaultMonth);
  const [imp, impAction, impPending] = useActionState(importReadings, null);
  const period = `${month}-01`;
  return (
    <div className="stack" style={{ gap: 18 }}>
      <ToastForm action={saveReadings} success="Results saved" className="stack" style={{ gap: 10 }}>
        <input type="hidden" name="outcome_id" value={outcomeId} />
        <label className="stack" style={{ gap: 4, alignSelf: "flex-start" }}><span className="field-label">Month</span>
          <input type="month" name="month" value={month} min={minMonth} max={maxMonth} onChange={(e) => e.target.value && setMonth(e.target.value)} required />
        </label>
        <div className="stack" style={{ gap: 8 }} key={month}>
          {metrics.map((m) => (
            <label key={m.id} className="row" style={{ gap: 12 }}>
              <span style={{ flex: 1, minWidth: 220 }}>{m.name} {m.unit && <span className="muted">({m.unit})</span>}</span>
              <input name={`v_${m.id}`} type="number" min="0" step="any" inputMode="decimal" defaultValue={m.readings[period] !== undefined ? fmtNum(m.readings[period]) : ""} style={{ width: 130 }} aria-label={`${m.name}, ${month}`} />
            </label>
          ))}
        </div>
        <p className="muted" style={{ margin: 0 }}>Use the month&apos;s total or typical figure, in the same way as the baseline (for example &ldquo;per week&rdquo; metrics as an average week). Blank boxes are left alone; saving a month again replaces its numbers.</p>
        <button className="secondary" style={{ alignSelf: "flex-start" }}>Save this month</button>
      </ToastForm>

      <details>
        <summary>Import from a CSV file</summary>
        <form action={impAction} className="stack" style={{ gap: 10, marginTop: 12 }}>
          <input type="hidden" name="outcome_id" value={outcomeId} />
          <input type="file" name="file" accept=".csv,text/csv" aria-label="CSV file" required />
          <div className="muted" style={{ lineHeight: 1.6 }}>
            Either one row per number: <code>month,metric,value</code><br />
            or one column per metric: <code>month,{metrics.slice(0, 2).map((m) => m.name).join(",")}</code><br />
            Months can be <code>2026-10</code>, <code>Oct 2026</code> or <code>10/2026</code>. Metric names must match the ones above; numbers already saved for a month are replaced.
          </div>
          <button className="secondary" style={{ alignSelf: "flex-start" }} disabled={impPending}>{impPending ? "Importing…" : "Import"}</button>
          {imp?.ok && <p role="status" style={{ margin: 0, color: "var(--good)" }}>{imp.ok}</p>}
          {imp?.error && <p className="error" role="alert">{imp.error}</p>}
          {imp?.problems && imp.problems.length > 0 && <ul className="muted" style={{ margin: 0, paddingLeft: 18 }}>{imp.problems.map((p, i) => <li key={i} style={{ listStyle: "disc", border: 0, padding: 0 }}>{p}</li>)}</ul>}
        </form>
      </details>
    </div>
  );
}
