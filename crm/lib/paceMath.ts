// Dashboard maths: targets, how far through the week or month we are, and how each goal is doing.
// Pure functions (no database, no clock unless passed in) so they are easy to test.

export type Targets = {
  today: { emails_sent: number };
  week: { new_leads: number; calls_booked: number; posts_published: number };
  month: { revenue_gbp: number; deals_won: number; new_leads: number };
};

const positive = (v: unknown, fallback: number): number => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

/** config/targets.yaml, with a default for anything missing or nonsense. `postsPerWeek` is the content setting in niches.yaml. */
export function parseTargets(raw: any, postsPerWeek = 4): Targets {
  return {
    today: { emails_sent: positive(raw?.today?.emails_sent, 5) },
    week: {
      new_leads: positive(raw?.week?.new_leads, 15),
      calls_booked: positive(raw?.week?.calls_booked, 3),
      posts_published: positive(raw?.week?.posts_published, postsPerWeek),
    },
    month: {
      revenue_gbp: positive(raw?.month?.revenue_gbp, 6000),
      deals_won: positive(raw?.month?.deals_won, 3),
      new_leads: positive(raw?.month?.new_leads, 60),
    },
  };
}

export type LondonParts = { year: number; month: number; day: number; hour: number; minute: number; weekday: number };

/** The date and time in UK time. `weekday` is 1 (Monday) to 7 (Sunday). */
export function londonParts(d: Date): LondonParts {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", weekday: "short", hourCycle: "h23",
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const weekday = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(get("weekday")) + 1;
  return { year: Number(get("year")), month: Number(get("month")), day: Number(get("day")), hour: Number(get("hour")), minute: Number(get("minute")), weekday };
}

export type Elapsed = { week: number; month: number; dayOfWeek: number; dayOfMonth: number; daysInMonth: number };

/** How far through this week (Monday start) and this month we are, as a fraction from 0 to 1. */
export function elapsedFractions(now: Date): Elapsed {
  const p = londonParts(now);
  const dayFraction = (p.hour * 60 + p.minute) / 1440;
  const daysInMonth = new Date(Date.UTC(p.year, p.month, 0)).getUTCDate();
  return {
    week: (p.weekday - 1 + dayFraction) / 7,
    month: (p.day - 1 + dayFraction) / daysInMonth,
    dayOfWeek: p.weekday, dayOfMonth: p.day, daysInMonth,
  };
}

export type GoalStatus = "done" | "on_track" | "behind" | "early" | "none";
export type Goal = {
  key: string; label: string; value: number; target: number;
  pct: number;              // real percentage, can pass 100
  fill: number;             // 0-100, for the bar
  pace: number | null;      // 0-100: where you should be by now, for the tick (null for today)
  projected: number | null; // where this is heading by the end of the period at the current rate
  status: GoalStatus;
  money?: boolean;
};

/** Below this share of the period there is too little evidence to project. */
export const MIN_ELAPSED = 0.2;
/** A goal counts as on track when its projection reaches this share of the target. */
export const ON_TRACK_SHARE = 0.9;

/** `elapsed` is the fraction of the period gone (null for "today", which has no pace tick). */
export function goalProgress(key: string, label: string, value: number, target: number, elapsed: number | null, money = false): Goal {
  const v = Math.max(0, value);
  // Nothing to do (for example no tasks due today) counts as complete, not as 0%.
  const pct = target > 0 ? Math.round((v / target) * 100) : 100;
  const pace = elapsed === null ? null : Math.round(Math.min(1, Math.max(0, elapsed)) * 100);
  const projected = elapsed !== null && elapsed >= MIN_ELAPSED ? Math.round(v / elapsed) : null;
  let status: GoalStatus;
  if (v >= target) status = "done";
  else if (elapsed === null) status = "none";
  else if (elapsed < MIN_ELAPSED) status = "early";
  else status = projected !== null && projected >= target * ON_TRACK_SHARE ? "on_track" : "behind";
  return { key, label, value: v, target, pct, fill: Math.min(100, pct), pace, projected, status, money };
}

export type Summary = { ring: number; status: GoalStatus };

/** One ring and one status for a card: the average of its goals' fill, and the worst status among them. */
export function summarise(goals: Goal[]): Summary {
  if (goals.length === 0) return { ring: 0, status: "none" };
  const ring = Math.round(goals.reduce((a, g) => a + g.fill, 0) / goals.length);
  const has = (s: GoalStatus) => goals.some((g) => g.status === s);
  let status: GoalStatus = "on_track";
  if (goals.every((g) => g.status === "done")) status = "done";
  else if (has("behind")) status = "behind";
  else if (has("early")) status = "early";
  else if (goals.every((g) => g.status === "none")) status = "none";
  return { ring, status };
}
