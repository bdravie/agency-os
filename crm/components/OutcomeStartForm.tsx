"use client";

import { useActionState, useState } from "react";
import { createOutcome } from "@/lib/outcomeActions";
import { PRESETS } from "@/lib/outcomeMath";

// Kickoff: record the baseline before the build goes live. Tick the metrics that matter and enter today's numbers.
export default function OutcomeStartForm({ companyId, dealId, company, kickoff, today }: { companyId: number; dealId: number | null; company: string; kickoff: string; today: string }) {
  const [error, action, pending] = useActionState(createOutcome, null);
  const [on, setOn] = useState<boolean[]>(PRESETS.map((_, i) => i < 3));
  return (
    <form action={action} className="card stack" style={{ gap: 16, maxWidth: 860 }}>
      <input type="hidden" name="company_id" value={companyId} />
      {dealId && <input type="hidden" name="deal_id" value={dealId} />}
      <div className="row">
        <label className="stack" style={{ gap: 4, flex: 1, minWidth: 240 }}><span className="field-label">Title</span><input name="title" defaultValue={`Results: ${company}`} maxLength={200} /></label>
        <label className="stack" style={{ gap: 4 }}><span className="field-label">Kickoff date</span><input name="kickoff_on" type="date" defaultValue={kickoff} max={today} required /></label>
      </div>
      <label className="stack" style={{ gap: 4 }}><span className="field-label">What you are setting up (plain words, no personal details)</span>
        <textarea name="built" rows={2} maxLength={800} placeholder="e.g. A missed-call text-back and online booking link, so enquiries are answered within minutes." />
      </label>

      <div className="stack" style={{ gap: 8 }}>
        <div className="field-label">Baseline: what the numbers are today, before the build</div>
        {PRESETS.map((p, i) => (
          <div key={p.name} className="row" style={{ gap: 12 }}>
            <label className="row" style={{ gap: 8, flex: 1, minWidth: 240 }}>
              <input type="checkbox" name={`use_${i}`} checked={on[i]} onChange={(e) => setOn((a) => a.map((v, j) => (j === i ? e.target.checked : v)))} />
              <span>{p.name} <span className="muted">· {p.better} is better</span></span>
            </label>
            <input name={`base_${i}`} type="number" min="0" step="any" inputMode="decimal" disabled={!on[i]} required={on[i]} placeholder={p.unit} aria-label={`Baseline for ${p.name}`} style={{ width: 130 }} />
          </div>
        ))}
        <details>
          <summary>Add your own metrics</summary>
          <div className="stack" style={{ gap: 8, marginTop: 10 }}>
            {[0, 1, 2].map((n) => (
              <div key={n} className="row">
                <input name={`c_name_${n}`} placeholder="Name, e.g. Quotes sent per week" maxLength={80} style={{ flex: 1, minWidth: 220 }} aria-label="Metric name" />
                <input name={`c_unit_${n}`} placeholder="Unit" maxLength={20} style={{ width: 100 }} aria-label="Unit" />
                <select name={`c_better_${n}`} aria-label="Which direction is better" defaultValue="higher"><option value="higher">Higher is better</option><option value="lower">Lower is better</option></select>
                <input name={`c_base_${n}`} type="number" min="0" step="any" placeholder="Baseline" style={{ width: 110 }} aria-label="Baseline" />
              </div>
            ))}
          </div>
        </details>
      </div>
      <p className="muted" style={{ margin: 0 }}>Business numbers only, never anything about individual customers. Use a typical week or month before the build: the baseline is what every later month is compared with.</p>
      {error && <p className="error" role="alert">{error}</p>}
      <button style={{ alignSelf: "flex-start" }} disabled={pending}>{pending ? "Saving…" : "Start tracking results"}</button>
    </form>
  );
}
