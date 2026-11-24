import type { CSSProperties } from "react";
import { gbp } from "@/lib/quote";
import type { PaceCard as Card } from "@/lib/pace";
import type { Goal } from "@/lib/paceMath";

// One of the three dashboard cards (BRAND_SHEET.md): a ring, a headline, and one plain line per goal. Each number is said once
// (kept calm at the owner's request, 24 Nov 2026), so there are no bars, and a goal the headline already states has no line.
// All the animation is CSS (fill and count-up), so there is no client script and no flash.

const show = (g: Goal, n: number) => (g.money ? gbp(n) : String(n));
const vars = (v: Record<string, string | number>) => v as CSSProperties;

/** Where a goal should be by now and where it is heading, for the line's tooltip. */
function paceHint(g: Goal): string | undefined {
  if (g.status === "done" || g.pace === null) return undefined;
  const byNow = `Should be about ${show(g, Math.round((g.target * g.pace) / 100))} by now`;
  return g.projected === null ? byNow : `${byNow}, on course for ${show(g, g.projected)}`;
}

/** One goal: its label and value against target, Lagoon once reached. Also used by the per-niche columns (NichePace). */
export function GoalRow({ g }: { g: Goal }) {
  return (
    <div className={`goal${g.status === "done" ? " done" : ""}`} title={paceHint(g)}>
      <span>{g.label}</span>
      <span className="goal-n"><b>{show(g, g.value)}</b> / {show(g, g.target)}</span>
    </div>
  );
}

export default function PaceCard({ card }: { card: Card }) {
  const { summary, goals, headlineGoal, note } = card;
  const done = summary.status === "done";
  const rows = goals.filter((g) => g.key !== headlineGoal);
  return (
    <section className="card pace-card" aria-label={`${card.eyebrow}: ${card.headline}`}>
      <div className="pace-top">
        <div>
          <div className="eyebrow">{card.eyebrow}</div>
          <div className="pace-head">{card.headline}</div>
          {note && <div className={`pace-note${note.tone === "good" ? " good" : ""}`}>{note.text}</div>}
        </div>
        <div className={`ring${done ? " full" : ""}`} style={vars({ "--p": summary.ring })} role="img" aria-label={`${summary.ring} per cent of the goals reached`}>
          <span aria-hidden><i className="countup" style={vars({ "--n": summary.ring })} />%</span>
        </div>
      </div>
      {rows.map((g) => <GoalRow key={g.key} g={g} />)}
    </section>
  );
}
