import Link from "next/link";
import { nicheLabel } from "@/lib/contentConfigMath";

// A row of niche chips. Each one is a link, so the choice lives in the address and survives a refresh.
export default function NicheFilter({ base, niches, current, counts, keep = {} }: { base: string; niches: string[]; current: string; counts: Record<string, number>; keep?: Record<string, string> }) {
  const href = (niche: string) => {
    const q = new URLSearchParams({ ...keep, ...(niche === "all" ? {} : { niche }) }).toString();
    return q ? `${base}?${q}` : base;
  };
  const chips: [string, string][] = [["all", "All niches"], ...niches.map((n): [string, string] => [n, nicheLabel(n)]), ["untagged", "Not tagged"]];
  return (
    <div className="pills" style={{ marginBottom: 16 }} role="group" aria-label="Show one niche">
      {chips.map(([k, label]) => (
        <Link key={k} href={href(k)} className={`pill${k === current ? " on" : ""}`} aria-current={k === current ? "true" : undefined}>
          {label}{counts[k] !== undefined ? ` (${counts[k]})` : ""}
        </Link>
      ))}
    </div>
  );
}
