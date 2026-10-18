import type { ScoreParts } from "@/lib/sourcerActions";

const SEGMENTS: { key: keyof ScoreParts; label: string; colour: string }[] = [
  { key: "size", label: "Size and filing health", colour: "var(--sx-size)" },
  { key: "verified", label: "Verified company", colour: "var(--sx-verified)" },
  { key: "reach", label: "Reachable", colour: "var(--sx-reach)" },
  { key: "reputation", label: "Reputation", colour: "var(--sx-rep)" },
];

/** The suitability score drawn as its own parts, so you can see why a business ranks where it does. The number and tier come from the database; this only draws them. */
export default function ScoreBar({ parts, score, tier, why, n }: { parts: ScoreParts; score: number; tier: string; why: string[]; n: number }) {
  return (
    <div className="sx-score" role="img" aria-label={`Suitability ${score} out of 100, tier ${tier}. ${why.join(". ")}`} title={why.join("\n")}>
      <div className="sx-bar">
        {SEGMENTS.map((s) => parts[s.key] > 0 && <i key={s.key} title={`${s.label}: ${parts[s.key]}`} style={{ width: `${parts[s.key]}%`, background: s.colour, ["--n" as string]: Math.min(n, 12) }} />)}
      </div>
      <span className="sx-num">{tier === "Skip" ? "0" : score}</span>
      <span className={`sx-tier ${tier}`}>{tier === "Skip" ? "–" : tier}</span>
    </div>
  );
}
