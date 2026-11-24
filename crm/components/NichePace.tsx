import Link from "next/link";
import type { NichePaceRow } from "@/lib/nicheTargetsMath";
import { GoalRow } from "./PaceCard";

// "This week by niche" on the Dashboard (docs/NICHE_FOCUS_PLAN.md, N4): one column per active or seeding niche, each weekly target from
// config/targets.yaml against this week so far, one plain line each (where it should be by now is the line's tooltip). No client script.

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
          <section key={r.key} className="niche-pace-row" aria-label={r.label}>
            <div className="niche-pace-name">{r.label}{r.status !== "active" && <span className="muted"> · Seeding</span>}</div>
            {r.goals.length === 0 && <p className="mini">No weekly targets yet. Add them under by_niche in config/targets.yaml.</p>}
            {r.goals.map((g) => <GoalRow key={g.key} g={g} />)}
            {r.ignored.length > 0 && <p className="mini">Not counted: {r.ignored.join(", ")}.</p>}
          </section>
        ))}
      </div>
    </section>
  );
}
