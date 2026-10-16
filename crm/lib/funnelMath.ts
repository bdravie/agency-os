// Pure funnel maths and date ranges (no database), so they can be tested on their own.

export type By = "week" | "month" | "all";
export type Range = { start: Date | null; end: Date | null; label: string };

const fmt = (d: Date, o: Intl.DateTimeFormatOptions) => d.toLocaleDateString("en-GB", o);

/** Weeks run Monday to Sunday. `offset` 0 is this week/month, -1 the previous one, and so on. */
export function rangeFor(by: By, offset: number, now = new Date()): Range {
  if (by === "all") return { start: null, end: null, label: "All time" };
  if (by === "week") {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7) + offset * 7);
    const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7);
    const last = new Date(end.getFullYear(), end.getMonth(), end.getDate() - 1);
    return { start, end, label: `${fmt(start, { day: "numeric", month: "short" })} – ${fmt(last, { day: "numeric", month: "short", year: "numeric" })}` };
  }
  const start = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  return { start, end: new Date(start.getFullYear(), start.getMonth() + 1, 1), label: fmt(start, { month: "long", year: "numeric" }) };
}

export const rate = (part: number, whole: number): number | null => (whole > 0 ? part / whole : null);

export type FunnelRow = { reached: number; pctPrev: number | null; pctLead: number | null };

/** `reached[k]` is how many deals got to stage k. Conversion is each stage against the one before, and against the first. */
export function funnelRows(reached: number[]): FunnelRow[] {
  return reached.map((n, i) => ({ reached: n, pctPrev: i === 0 ? null : rate(n, reached[i - 1]), pctLead: i === 0 ? null : rate(n, reached[0]) }));
}

export type LostGroup = { code: string; label: string; n: number; pct: number };

/** Group lost deals by reason. Standard codes get their label; older free text or blanks are grouped, never dropped. */
export function groupLost(reasons: (string | null)[], known: { code: string; label: string }[]): LostGroup[] {
  const counts = new Map<string, number>();
  for (const r of reasons) {
    const key = r === null || r === "" ? "__none" : known.some((k) => k.code === r) ? r : "__other";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const label = (k: string) => (k === "__none" ? "Not recorded (older deals)" : k === "__other" ? "Other (older free text)" : known.find((x) => x.code === k)!.label);
  return [...counts.entries()].map(([code, n]) => ({ code, label: label(code), n, pct: n / reasons.length })).sort((a, b) => b.n - a.n || Number(a.code.startsWith("__")) - Number(b.code.startsWith("__")) || a.label.localeCompare(b.label));
}

export const pct = (v: number | null, digits = 0) => (v === null ? "–" : `${(v * 100).toFixed(digits)}%`);
export const days = (v: number | null) => (v === null ? "–" : v < 10 ? `${v.toFixed(1)} d` : `${Math.round(v)} d`);

/** Average of the real numbers in a list. Missing values (null, undefined, NaN) and negatives are ignored, never counted as zero. */
export function average(values: unknown[]): number | null {
  const ok = values.filter((v) => v !== null && v !== undefined && v !== "").map(Number).filter((n) => Number.isFinite(n) && n >= 0);
  return ok.length ? ok.reduce((a, b) => a + b, 0) / ok.length : null;
}
