"use client";

import { useActionState } from "react";
import { Sparkles } from "lucide-react";
import { generatePlanAction } from "@/lib/actions";
import { priceMilestones, type Plan, type Rates } from "@/lib/proposalPlanMath";

const gbp = (n: number) => `£${n.toLocaleString("en-GB", { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 })}`;
const easeTone = { easy: "good", medium: "warn", hard: "bad" } as const;
const hours = (lo: number, hi: number) => (lo === hi ? `${lo}h` : `${lo}–${hi}h`);

export default function PlanPanel({ id, plan, planAt, rates }: { id: number; plan: Plan | null; planAt: string | null; rates: Rates }) {
  const [message, action, pending] = useActionState(generatePlanAction, null);
  const pricing = plan ? priceMilestones(plan.milestones, rates) : null;
  return (
    <section className="card stack" style={{ gap: 12, marginTop: 16 }} aria-labelledby="plan-h">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div>
          <h2 id="plan-h">Plan and price</h2>
          <p className="muted">Milestones, how easy each is and how long it should take, priced from your rates ({gbp(rates.hourly_rate_gbp)}/hour, set in config/rates.yaml). The AI estimates the hours; the code does the sums. Runs only when you click.</p>
        </div>
        <form action={action}>
          <input type="hidden" name="id" value={id} />
          <button disabled={pending}><Sparkles size={15} aria-hidden /> {pending ? "Working… (about 20 seconds)" : plan ? "Plan it again" : "Plan and price this job"}</button>
        </form>
      </div>
      {message && <p className="error" role="alert">{message}</p>}
      {plan && pricing && (
        <>
          {plan.data_note && <p className="response-box"><b>Data processing agreement first:</b> {plan.data_note}</p>}
          <div className="table-wrap">
            <table>
              <thead><tr><th>#</th><th>Milestone and requirements</th><th>Ease</th><th className="num">Time</th><th className="num">Price</th></tr></thead>
              <tbody>
                {plan.milestones.map((m, i) => (
                  <tr key={i}>
                    <td>{i + 1}</td>
                    <td>
                      <b>{m.name}</b>
                      <ul className="fx-bullets">{m.requirements.map((r, j) => <li key={j}>{r}</li>)}</ul>
                      {m.why && <span className="muted">{m.why}</span>}
                    </td>
                    <td><span className={`badge tone-${easeTone[m.ease]}`}>{m.ease}</span></td>
                    <td className="num">{hours(m.hours_low, m.hours_high)}<br /><span className="muted">{pricing.lines[i].days} day{pricing.lines[i].days === 1 ? "" : "s"}</span></td>
                    <td className="num">{gbp(pricing.lines[i].price)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid">
            <div className="stack" style={{ gap: 6 }}>
              <h3>What to charge</h3>
              <table>
                <tbody>
                  <tr><td>Milestones ({hours(pricing.hours_low, pricing.hours_high)}, about {pricing.days} working days)</td><td className="num">{gbp(pricing.subtotal)}</td></tr>
                  <tr><td>Buffer for unclear scope ({rates.contingency_pct}%)</td><td className="num">{gbp(pricing.contingency)}</td></tr>
                  <tr><td><b>Suggested price</b>{pricing.floor_applied && <span className="muted"> (your minimum project price)</span>}</td><td className="num"><b>{gbp(pricing.total)}</b></td></tr>
                  <tr><td className="muted">Range if it goes quicker or slower</td><td className="num muted">{gbp(pricing.low)} – {gbp(pricing.high)}</td></tr>
                  <tr><td className="muted">Upwork fee ({rates.upwork_fee_pct}%)</td><td className="num muted">−{gbp(pricing.fee)}</td></tr>
                  <tr><td className="muted">You receive (about {gbp(pricing.effective_hourly)}/hour)</td><td className="num muted">{gbp(pricing.take_home)}</td></tr>
                </tbody>
              </table>
            </div>
            <div className="stack" style={{ gap: 12 }}>
              {plan.assumptions.length > 0 && <div><h3>Assumed because the post did not say</h3><ul className="fx-bullets">{plan.assumptions.map((a, i) => <li key={i}>{a}</li>)}</ul></div>}
              {plan.questions.length > 0 && <div><h3>Ask the client before you quote</h3><ul className="fx-bullets">{plan.questions.map((q, i) => <li key={i}>{q}</li>)}</ul></div>}
            </div>
          </div>
          <p className="muted">A starting point, not a promise: check the hours against how you actually work{planAt ? ` · written ${new Date(planAt).toLocaleString("en-GB")}` : ""}.</p>
        </>
      )}
    </section>
  );
}
