import Link from "next/link";
import type { NichePaceRow } from "@/lib/nicheTargetsMath";
import { GoalRow } from "./PaceCard";

// "This week by niche" on the Dashboard (docs/NICHE_FOCUS_PLAN.md, N4): one row per active or seeding niche, each weekly target from
// config/targets.yaml against this week so far, with the same pace tick as the cards above. No client script.

export default function NichePace({ rows }: { rows: NichePaceRow[] }) {
  if (rows.length === 0) return null;
  return (
    <section className="card niche-pace-card" aria-label="This week by niche">
      <div className="row-between">
        <div className="eyebrow">This week by niche</div>
        <Link href="/niches" className="muted">Niches →</Link>
      </div>
      <div className="niche-pace">
        {rows.map((r) => (
          <div key={r.key} className="niche-pace-row">
            <div className="row-between" style={{ flexWrap: "nowrap" }}>
              <b>{r.label}</b>
              <span className={`badge tone-${r.status === "active" ? "good" : "warn"}`}>{r.status === "active" ? "Active" : "Seeding"}</span>
            </div>
            {r.goals.length === 0 && <p className="muted" style={{ margin: "8px 0 0" }}>No weekly targets yet. Add them under by_niche in config/targets.yaml.</p>}
            {r.goals.map((g) => <GoalRow key={g.key} g={g} ariaLabel={`${r.label}: ${g.label}`} />)}
            {r.ignored.length > 0 && <p className="mini muted" style={{ margin: "8px 0 0" }}>Not counted: {r.ignored.join(", ")}.</p>}
          </div>
        ))}
      </div>
    </section>
  );
}
