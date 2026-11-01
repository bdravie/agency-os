"use client";

import { useActionState } from "react";
import { Sparkles } from "lucide-react";
import { suggestImprovementsAction } from "@/lib/actions";
import { effortSummary, type Improvements } from "@/lib/proposalImproveMath";

const gbp = (n: number) => `£${n.toLocaleString("en-GB")}`;
const kindLabel = { learn: "Learn", build: "Build", change: "Change", ask: "Ask the client", portfolio: "Write down" } as const;
const longTone = { yes: "good", maybe: "warn", no: "neutral" } as const;
const longWord = { yes: "Pays off again", maybe: "Might pay off again", no: "This job only" } as const;
const verdict = {
  worth_it: { tone: "good", word: "Worth doing, then apply" },
  partial: { tone: "warn", word: "Do only the best ones" },
  apply_as_is: { tone: "blue", word: "Apply as it is" },
  skip: { tone: "bad", word: "Not worth the effort" },
} as const;

export default function ImprovePanel({ id, score, improvements: imp, at, hourly, jobPrice }: { id: number; score: number | null; improvements: Improvements | null; at: string | null; hourly: number; jobPrice: number | null }) {
  const [message, action, pending] = useActionState(suggestImprovementsAction, null);
  const best = imp ? imp.actions.filter((a) => imp.verdict.best_actions.includes(a.title)) : [];
  const chosen = imp ? (best.length ? best : imp.verdict.overall === "worth_it" ? imp.actions : []) : [];
  const sum = imp && score !== null && chosen.length ? effortSummary(chosen, score, hourly, jobPrice) : null;
  return (
    <section className="card stack" style={{ gap: 12, marginBottom: 16 }} aria-labelledby="imp-h">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div>
          <h2 id="imp-h">Make this job a better fit</h2>
          <p className="muted">What you could learn, build, change or ask to lift the score, and whether it is worth it for future work. Reads your About me, portfolio, offers and recent jobs. Runs only when you click.</p>
        </div>
        <form action={action}>
          <input type="hidden" name="id" value={id} />
          <button className={imp ? "secondary" : undefined} disabled={pending}><Sparkles size={15} aria-hidden /> {pending ? "Thinking… (about 20 seconds)" : imp ? "Suggest again" : "Suggest improvements"}</button>
        </form>
      </div>
      {message && <p className="error" role="alert">{message}</p>}
      {imp && (
        <>
          <div className="response-box" style={{ marginTop: 0 }}>
            <p><span className={`badge tone-${verdict[imp.verdict.overall].tone}`}>{verdict[imp.verdict.overall].word}</span></p>
            <p style={{ marginTop: 6 }}>{imp.verdict.reasoning}</p>
            <p style={{ marginTop: 6 }}><b>Long term:</b> {imp.verdict.long_term}</p>
            {sum && score !== null && (
              <p className="muted" style={{ marginTop: 6 }}>
                Doing {chosen.length === 1 ? "that one" : `those ${chosen.length}`}: about {sum.hours}h of your time (≈ {gbp(sum.cost)} at {gbp(hourly)}/hour)
                {sum.shareOfPay !== null ? `, ${sum.shareOfPay}% of the ${gbp(jobPrice!)} suggested price` : ""}
                {sum.gain > 0 ? `, and the score could go from ${score} to about ${sum.projected}/10` : ""}. A guess, not a promise.
              </p>
            )}
          </div>
          <ul className="fx-list">
            {imp.actions.map((a, i) => (
              <li key={i} style={{ alignItems: "flex-start" }}>
                <span className="badge tone-neutral" style={{ minWidth: 118, justifyContent: "center" }}>{kindLabel[a.kind]}</span>
                <span style={{ flex: 1 }}>
                  <b>{a.title}</b>{imp.verdict.best_actions.includes(a.title) && <> <span className="badge tone-good">Recommended</span></>}
                  <br />{a.how}
                  <br /><span className="muted">{a.effort_hours}h{a.score_gain > 0 ? ` · +${a.score_gain} on the score` : " · no change to the score"} · <span className={`badge tone-${longTone[a.long_term]}`}>{longWord[a.long_term]}</span>{a.long_term_note ? ` ${a.long_term_note}` : ""}</span>
                </span>
              </li>
            ))}
          </ul>
          <p className="muted">Never claim a skill you have not got: learn it, show a small demo of it, or say honestly what you would do{at ? ` · written ${new Date(at).toLocaleString("en-GB")}` : ""}.</p>
        </>
      )}
    </section>
  );
}
