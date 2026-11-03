import type { CSSProperties } from "react";
import { gbp } from "@/lib/quote";
import type { PaceCard as Card } from "@/lib/pace";
import type { Goal } from "@/lib/paceMath";

// One of the three dashboard cards (BRAND_SHEET.md): a ring, a headline, and a bar per goal with a pace tick.
// All the animation is CSS (fill and count-up), so there is no client script and no flash.

const show = (g: Goal, n: number) => (g.money ? gbp(n) : String(n));
const vars = (v: Record<string, string | number>) => v as CSSProperties;

export default function PaceCard({ card }: { card: Card }) {
  const { summary, goals } = card;
  const done = summary.status === "done";
  return (
    <section className="card pace-card" aria-label={`${card.eyebrow}: ${card.headline}`}>
      <div className="row-between" style={{ alignItems: "flex-start", flexWrap: "nowrap" }}>
        <div>
          <div className="eyebrow">{card.eyebrow}</div>
          <div className="pace-head">{card.headline}</div>
          {card.badge.text && <span className={`badge tone-${card.badge.tone}`}>{card.badge.text}</span>}
        </div>
        <div className={`ring${done ? " full" : ""}`} style={vars({ "--p": summary.ring })} role="img" aria-label={`${summary.ring} per cent of the goals reached`}>
          <span aria-hidden><i className="countup" style={vars({ "--n": summary.ring })} />%</span>
        </div>
      </div>
      {goals.map((g) => (
        <div key={g.key} className="goal">
          <div className="row-between"><span>{g.label}</span><b>{show(g, g.value)} / {show(g, g.target)}</b></div>
          <div className={`prog${g.status === "done" ? " full" : ""}`} role="progressbar" aria-label={g.label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={g.fill}>
            <b style={{ width: `${g.fill}%` }} />
            {g.pace !== null && <s style={{ left: `${g.pace}%` }} title="Where you should be by now" />}
          </div>
          {g.status !== "done" && g.projected !== null && <div className="mini">On course for {show(g, g.projected)}</div>}
        </div>
      ))}
    </section>
  );
}
