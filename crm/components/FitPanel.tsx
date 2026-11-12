"use client";

import { useActionState } from "react";
import { Sparkles } from "lucide-react";
import { analyseFitAction } from "@/lib/actions";
import type { FitAnalysis } from "@/lib/proposalPlanMath";

const tone = (n: number) => (n >= 8 ? "good" : n >= 6 ? "warn" : "bad");
const arrow = { up: "▲", down: "▼", neutral: "●" } as const;
const effectTone = { up: "good", down: "bad", neutral: "neutral" } as const;
const effectWord = { up: "Raised the score", down: "Lowered the score", neutral: "No effect" } as const;

export default function FitPanel({ id, score, fit }: { id: number; score: number | null; fit: FitAnalysis | null }) {
  const [message, action, pending] = useActionState(analyseFitAction, null);
  return (
    <section className="card stack" style={{ gap: 12 }} aria-labelledby="fit-h">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div>
          <h2 id="fit-h">Why this score{score !== null && <> <span className={`badge tone-${tone(score)}`}>{score}/10</span></>}</h2>
          <p className="muted">{fit ? fit.summary : "This job was scored before reasons were saved. Click to see what moved the score, and the benefits and risks of applying."}</p>
        </div>
        <form action={action}>
          <input type="hidden" name="id" value={id} />
          <button className={fit ? "secondary" : undefined} disabled={pending}><Sparkles size={15} aria-hidden /> {pending ? "Working… (about 10 seconds)" : fit ? "Score again" : "Explain this score"}</button>
        </form>
      </div>
      {message && <p className="error" role="alert">{message}</p>}
      {fit && (
        <>
          {fit.data_note && <p className="response-box"><b>Data processing agreement first:</b> {fit.data_note}</p>}
          <div>
            <h3>What moved the score</h3>
            <ul className="fx-list">
              {fit.factors.map((f, i) => (
                <li key={i}>
                  <span className={`badge tone-${effectTone[f.effect]}`} title={effectWord[f.effect]}><span aria-hidden>{arrow[f.effect]}</span>&nbsp;{effectWord[f.effect]}</span>
                  <span><b>{f.factor}.</b> {f.note}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="grid">
            <div>
              <h3>Benefits of applying</h3>
              <ul className="fx-bullets">{fit.benefits.map((b, i) => <li key={i}>{b}</li>)}</ul>
            </div>
            <div>
              <h3>Risks</h3>
              <ul className="fx-bullets">{fit.risks.map((b, i) => <li key={i}>{b}</li>)}</ul>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
