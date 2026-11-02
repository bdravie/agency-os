"use client";

import { useState, useTransition } from "react";
import { Sparkles } from "lucide-react";
import { explainWeek, type Explained } from "@/lib/contentInsightsActions";

export default function ExplainWeek({ disabled }: { disabled: boolean }) {
  const [result, setResult] = useState<Explained | null>(null);
  const [pending, start] = useTransition();
  return (
    <section className="card stack" style={{ gap: 12 }} aria-labelledby="explain-h">
      <div className="row-between">
        <div>
          <h2 id="explain-h">Explain this week</h2>
          <p className="muted">Three observations and three things to try, written from the tables below. It can only use numbers that are in them. Runs only when you click.</p>
        </div>
        <button disabled={disabled || pending} onClick={() => start(async () => setResult(await explainWeek()))}><Sparkles size={15} aria-hidden /> {pending ? "Reading… (about 5 seconds)" : result?.ok ? "Explain again" : "Explain this week"}</button>
      </div>
      {result && !result.ok && <p className="error" role="alert">{result.error}</p>}
      {result?.ok && (
        <div className="grid">
          <div><h3>What the numbers show</h3><ul className="fx-bullets">{result.observations.map((o, i) => <li key={i}>{o}</li>)}</ul></div>
          <div><h3>Worth trying next week</h3><ul className="fx-bullets">{result.to_try.map((o, i) => <li key={i}>{o}</li>)}</ul></div>
        </div>
      )}
    </section>
  );
}
