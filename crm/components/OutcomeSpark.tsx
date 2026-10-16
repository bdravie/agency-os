// A tiny trend line: the kickoff baseline (dashed) and each month's reading. Decorative; the numbers beside it say the same thing.
export default function OutcomeSpark({ baseline, points, tone }: { baseline: number; points: number[]; tone: "good" | "bad" | "flat" }) {
  const W = 110, H = 30, P = 3;
  const vals = [baseline, ...points], lo = Math.min(...vals), hi = Math.max(...vals), span = hi - lo || 1;
  const x = (i: number) => P + (i * (W - 2 * P)) / Math.max(1, vals.length - 1);
  const y = (v: number) => H - P - ((v - lo) / span) * (H - 2 * P);
  const colour = tone === "good" ? "var(--good)" : tone === "bad" ? "var(--bad)" : "var(--muted)";
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden>
      <line x1={P} x2={W - P} y1={y(baseline)} y2={y(baseline)} stroke="var(--line)" strokeDasharray="3 3" />
      {points.length > 0 && <polyline fill="none" stroke={colour} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" points={points.map((v, i) => `${x(i + 1)},${y(v)}`).join(" ")} />}
      {points.map((v, i) => <circle key={i} cx={x(i + 1)} cy={y(v)} r={i === points.length - 1 ? 3 : 2} fill={colour} />)}
    </svg>
  );
}
