// Pure maths for the Outcomes module: before-vs-now, the "flat" flag, the 60-day rule, and CSV parsing.
// Dates are ISO strings (YYYY-MM-DD) handled in UTC, so results never depend on the server's timezone.

export type Better = "lower" | "higher";
export type Reading = { period: string; value: number };
export type MetricIn = { id: number; name: string; unit: string; better: Better; baseline: number; readings: Reading[] };

/** A change smaller than this (either way) counts as flat. */
export const FLAT_PCT = 10;
/** No flag in the first 30 days after kickoff: it is too early to judge. */
export const EARLY_DAYS = 30;
/** With no reading at all, ask for data once the client is this old. */
export const FIRST_DATA_DAYS = 45;
/** A case study and testimonial request need this many days of data (kickoff to the end of the latest logged month). */
export const CASE_STUDY_DAYS = 60;

export const PRESETS: { name: string; unit: string; better: Better }[] = [
  { name: "Missed calls per week", unit: "calls", better: "lower" },
  { name: "Average response time", unit: "minutes", better: "lower" },
  { name: "Bookings per month", unit: "bookings", better: "higher" },
  { name: "Leads per month", unit: "leads", better: "higher" },
  { name: "Admin hours per week", unit: "hours", better: "lower" },
];

// ---------- dates ----------
const ms = (iso: string) => Date.parse(`${iso.slice(0, 10)}T00:00:00Z`);
export const isoDate = (d: Date) => d.toISOString().slice(0, 10);
export const daysBetween = (a: string, b: string) => Math.round((ms(b) - ms(a)) / 86_400_000);
export const monthStart = (iso: string) => `${iso.slice(0, 7)}-01`;
export const monthEnd = (period: string) => { const d = new Date(ms(monthStart(period))); d.setUTCMonth(d.getUTCMonth() + 1, 0); return isoDate(d); };
export const addMonths = (period: string, n: number) => { const d = new Date(ms(monthStart(period))); d.setUTCMonth(d.getUTCMonth() + n, 1); return isoDate(d); };
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const longDate = (iso: string) => `${Number(iso.slice(8, 10))} ${monthLabel(iso)}`;
export const monthLabel = (period: string, short = false) => {
  const m = Number(period.slice(5, 7)) - 1;
  return short ? `${MONTHS[m]} ${period.slice(2, 4)}` : `${new Date(Date.UTC(2000, m, 1)).toLocaleString("en-GB", { month: "long", timeZone: "UTC" })} ${period.slice(0, 4)}`;
};

/** Reads a month from "2026-10", "2026-10-15", "10/2026", "15/10/2026" (UK order) or "Oct 2026" / "October 2026". Returns the first of that month, or null. */
export function parsePeriod(text: string): string | null {
  const s = text.trim();
  let m = s.match(/^(\d{4})-(\d{1,2})(?:-\d{1,2})?$/);
  if (m) return ok(+m[1], +m[2]);
  m = s.match(/^(?:\d{1,2}\/)?(\d{1,2})\/(\d{4})$/);
  if (m) return ok(+m[2], +m[1]);
  m = s.match(/^([A-Za-z]{3,9})\.?\s+(\d{4})$/);
  if (m) { const i = MONTHS.findIndex((n) => m![1].toLowerCase().startsWith(n.toLowerCase())); return i >= 0 ? ok(+m[2], i + 1) : null; }
  return null;
  function ok(y: number, mo: number) { return y >= 2000 && y <= 2100 && mo >= 1 && mo <= 12 ? `${y}-${String(mo).padStart(2, "0")}-01` : null; }
}

// ---------- change ----------
/** Signed improvement as a fraction: positive is better, whichever direction "better" is. A zero baseline gives +/-1. */
export function improvement(baseline: number, value: number, better: Better): number {
  if (value === baseline) return 0;
  const good = better === "lower" ? value < baseline : value > baseline;
  if (baseline === 0) return good ? 1 : -1;
  return (better === "lower" ? baseline - value : value - baseline) / baseline;
}
export type Verdict = "better" | "flat" | "worse";
export const verdict = (imp: number): Verdict => (imp * 100 >= FLAT_PCT ? "better" : imp * 100 <= -FLAT_PCT ? "worse" : "flat");

export const fmtNum = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, ""));
export const fmtValue = (n: number, unit: string) => `${fmtNum(n)}${unit ? ` ${unit}` : ""}`;
/** "-45%" style text for how far a metric has moved (sign shows direction of the number, not good/bad). */
export function movedText(baseline: number, value: number): string {
  if (value === baseline) return "no change";
  if (baseline === 0) return `from 0 to ${fmtNum(value)}`;
  const p = Math.round(((value - baseline) / baseline) * 100);
  return `${p > 0 ? "+" : ""}${p}%`;
}

export type MetricResult = {
  id: number; name: string; unit: string; better: Better; baseline: number;
  latest: Reading | null; imp: number | null; verdict: Verdict | null; moved: string | null;
};
export type State = "early" | "no_data" | "stale" | "improving" | "mixed" | "flat" | "slipping";
export type Assessment = {
  state: State; flagged: boolean; headline: string;
  days: number; dataDays: number; counts: { better: number; flat: number; worse: number };
  metrics: MetricResult[]; latestPeriod: string | null; dueMonth: string | null;
  caseStudy: { ready: boolean; reason: string };
};

/** Latest reading at or before a month (default: the latest there is). */
export const latestReading = (rs: Reading[], upTo?: string) => rs.filter((r) => !upTo || r.period <= upTo).sort((a, b) => (a.period < b.period ? 1 : -1))[0] ?? null;

export function assess(i: { kickoff: string; today: string; metrics: MetricIn[]; upTo?: string }): Assessment {
  const days = daysBetween(i.kickoff, i.today);
  const metrics: MetricResult[] = i.metrics.map((m) => {
    const latest = latestReading(m.readings, i.upTo);
    const imp = latest ? improvement(m.baseline, latest.value, m.better) : null;
    return { id: m.id, name: m.name, unit: m.unit, better: m.better, baseline: m.baseline, latest, imp, verdict: imp === null ? null : verdict(imp), moved: latest ? movedText(m.baseline, latest.value) : null };
  });
  const counts = { better: 0, flat: 0, worse: 0 };
  for (const m of metrics) if (m.verdict) counts[m.verdict]++;
  const latestPeriod = metrics.reduce<string | null>((p, m) => (m.latest && (!p || m.latest.period > p) ? m.latest.period : p), null);
  const lastComplete = addMonths(monthStart(i.today), -1);
  const dueMonth = !latestPeriod || latestPeriod < lastComplete ? (lastComplete >= monthStart(i.kickoff) ? lastComplete : null) : null;
  const dataEnd = latestPeriod ? (monthEnd(latestPeriod) < i.today ? monthEnd(latestPeriod) : i.today) : null;
  const dataDays = dataEnd ? Math.max(0, daysBetween(i.kickoff, dataEnd)) : 0;

  const out = (state: State, headline: string, flagged = false): Assessment => ({
    state, flagged, headline, days, dataDays, counts, metrics, latestPeriod, dueMonth,
    caseStudy: caseStudyRule(state, dataDays, counts.better),
  });
  if (metrics.length === 0) return out("early", "No metrics yet. Add the baseline numbers.");
  if (!latestPeriod) return days < FIRST_DATA_DAYS ? out("early", "Waiting for the first month of results.") : out("no_data", `No results logged ${days} days after kickoff.`, true);
  // Two or more finished months with nothing logged: the data can't be trusted to show a problem or a win.
  if (latestPeriod < addMonths(lastComplete, -1)) return out("stale", `Nothing logged since ${monthLabel(latestPeriod)}.`, true);
  if (days < EARLY_DAYS) return out("early", `Day ${days}: too early to judge.`);
  const { better, worse } = counts;
  if (better > 0 && worse === 0) return out("improving", `${better} of ${metrics.length} metric${metrics.length === 1 ? "" : "s"} clearly better.`);
  if (better > 0 && worse > 0) return out("mixed", `${better} better, ${worse} worse.`);
  if (worse > 0) return out("slipping", `${worse} metric${worse === 1 ? "" : "s"} worse than at kickoff, none better.`, true);
  return out("flat", `Nothing has moved by ${FLAT_PCT}% or more since kickoff.`, true);
}

function caseStudyRule(state: State, dataDays: number, better: number): { ready: boolean; reason: string } {
  if (dataDays < CASE_STUDY_DAYS) return { ready: false, reason: `Needs ${CASE_STUDY_DAYS} days of data (${dataDays} so far).` };
  if (better === 0 || !["improving", "mixed"].includes(state)) return { ready: false, reason: "No metric has clearly improved yet, so there is no honest result to write up." };
  return { ready: true, reason: "" };
}

// ---------- numbers in drafted text ----------
const numbersIn = (s: string) => (s.match(/\d[\d,]*(?:\.\d+)?/g) ?? []).map((n) => n.replace(/,/g, "").replace(/\.0+$/, "").replace(/^0+(?=\d)/, ""));
/** Numbers in drafted text that never appeared in the facts supplied: a guard against invented figures. */
export function unverifiedNumbers(text: string, facts: string): string[] {
  const ok = new Set(numbersIn(facts));
  return [...new Set(numbersIn(text.replace(/^\s*\d+[.)]\s/gm, "")).filter((n) => !ok.has(n)))];   // numbered list markers are not figures
}

// ---------- CSV import ----------
export type CsvResult = { readings: { period: string; metricId: number; value: number }[]; problems: string[]; rows: number };
const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");
const MAX_ROWS = 5000;

/** Accepts long format (month, metric, value) or wide format (month, then one column per metric). Only metrics that already exist are imported. */
export function readingsFromCsv(grid: string[][], metrics: { id: number; name: string }[], today: string): CsvResult {
  const problems: string[] = [];
  const out = new Map<string, { period: string; metricId: number; value: number }>();
  const byKey = new Map(metrics.map((m) => [key(m.name), m.id]));
  const bad = (msg: string) => { if (problems.includes(msg)) return; if (problems.length < 20) problems.push(msg); else if (problems.length === 20) problems.push("…and more."); };
  if (grid.length < 2) return { readings: [], problems: ["The file needs a header row and at least one data row."], rows: 0 };
  if (grid.length - 1 > MAX_ROWS) return { readings: [], problems: [`Too many rows (limit ${MAX_ROWS}).`], rows: 0 };
  const head = grid[0].map((h) => key(h));
  const iMonth = head.findIndex((h) => ["month", "period", "date"].includes(h));
  const iMetric = head.findIndex((h) => h === "metric"), iValue = head.findIndex((h) => h === "value");
  if (iMonth < 0) return { readings: [], problems: ["The first column should be headed “month” (for example 2026-10 or Oct 2026)."], rows: 0 };
  const thisMonth = monthStart(today);
  const num = (raw: string) => { const t = raw.replace(/[£,%\s]/g, ""); return /^\d+(\.\d+)?$/.test(t) ? Number(t) : null; };
  const put = (line: number, monthRaw: string, metricId: number, raw: string) => {
    const period = parsePeriod(monthRaw);
    if (!period) return bad(`Row ${line}: couldn't read the month “${monthRaw}”.`);
    if (period > thisMonth) return bad(`Row ${line}: ${monthLabel(period)} is in the future, so it was skipped.`);
    const value = num(raw);
    if (value === null || value > 1e9) return bad(`Row ${line}: “${raw}” isn't a number I can use.`);
    out.set(`${metricId}|${period}`, { period, metricId, value });
  };
  if (iMetric >= 0 && iValue >= 0) {
    grid.slice(1).forEach((r, n) => {
      const name = (r[iMetric] ?? "").trim(); if (!name && !(r[iValue] ?? "").trim()) return;
      const id = byKey.get(key(name));
      if (id === undefined) return bad(`Row ${n + 2}: no metric called “${name}” on this client. Add it first.`);
      put(n + 2, r[iMonth] ?? "", id, (r[iValue] ?? "").trim());
    });
  } else {
    const cols = head.map((h, c) => (c === iMonth ? null : byKey.get(h) ?? (bad(`Column “${grid[0][c]}” doesn't match a metric on this client, so it was skipped.`), null)));
    if (!cols.some((c) => c !== null)) return { readings: [], problems: problems.length ? problems : ["No column matched a metric name."], rows: 0 };
    grid.slice(1).forEach((r, n) => cols.forEach((id, c) => { const raw = (r[c] ?? "").trim(); if (id !== null && raw !== "") put(n + 2, r[iMonth] ?? "", id, raw); }));
  }
  return { readings: [...out.values()], problems, rows: grid.length - 1 };
}
