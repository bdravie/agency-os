import { readFile } from "node:fs/promises";
import path from "node:path";
import { parse } from "yaml";
import { query } from "./db";
import { loadContentConfig } from "./content";
import { gbp } from "./quote";
import { elapsedFractions, goalProgress, summarise, type Goal, type GoalStatus, type Summary, type Targets, parseTargets } from "./paceMath";

// The CRM runs from crm/, shared files live in the repo root.
const ROOT = path.resolve(process.cwd(), "..");

/** config/targets.yaml, falling back to defaults for anything missing. The weekly post target defaults to the content setting. */
export async function loadTargets(): Promise<Targets> {
  const [raw, content] = await Promise.all([
    readFile(path.join(ROOT, "config/targets.yaml"), "utf8").then((t) => parse(t)).catch(() => ({})),
    loadContentConfig().catch(() => null),
  ]);
  return parseTargets(raw, content?.posts_per_week ?? 4);
}

export type PaceCard = {
  period: "today" | "week" | "month";
  eyebrow: string;
  headline: string;
  badge: { text: string; tone: "good" | "warn" | "neutral" };
  goals: Goal[];
  summary: Summary;
};

const pluralise = (n: number, one: string, many = one + "s") => `${n} ${n === 1 ? one : many}`;

function badgeFor(status: GoalStatus, projection: string | null): PaceCard["badge"] {
  if (status === "done") return { text: "Target reached", tone: "good" };
  if (status === "early") return { text: "Early days", tone: "neutral" };
  if (status === "on_track") return { text: projection ?? "On track", tone: "good" };
  if (status === "behind") return { text: projection ?? "Behind pace", tone: "warn" };
  return { text: "", tone: "neutral" };
}

/** Today, this week and this month: what is done against what was aimed for, and where each is heading. */
export async function loadPace(now = new Date()): Promise<{ today: PaceCard; week: PaceCard; month: PaceCard }> {
  const [targets, tasks, emails, week, month] = await Promise.all([
    loadTargets(),
    query<{ done: string; open: string }>(
      `SELECT count(*) FILTER (WHERE done_at IS NOT NULL AND (done_at AT TIME ZONE 'Europe/London')::date = (now() AT TIME ZONE 'Europe/London')::date) AS done,
              count(*) FILTER (WHERE done_at IS NULL AND due_at < now()::date + 1) AS open FROM tasks`),
    query<{ n: string }>(
      `SELECT count(*) AS n FROM activities WHERE type = 'email_logged' AND (occurred_at AT TIME ZONE 'Europe/London')::date = (now() AT TIME ZONE 'Europe/London')::date`),
    // Weeks start on Monday, in UK time.
    query<{ leads: string; calls: string; posts: string }>(
      `WITH w AS (SELECT date_trunc('week', now() AT TIME ZONE 'Europe/London') AT TIME ZONE 'Europe/London' AS start)
       SELECT (SELECT count(*) FROM companies c, w WHERE c.created_at >= w.start) AS leads,
              (SELECT count(*) FROM stage_history h, w WHERE h.to_stage = 'Call booked' AND h.source = 'app' AND h.changed_at >= w.start) AS calls,
              (SELECT count(*) FROM content_items i, w WHERE i.status = 'Posted' AND i.posted_at >= w.start) AS posts`),
    // One-off value of deals won this month. Same "won date" rule as the Revenue figures: the app's own stage change, else the last update.
    query<{ revenue: number; won: string; leads: string }>(
      `WITH m AS (SELECT date_trunc('month', now() AT TIME ZONE 'Europe/London') AT TIME ZONE 'Europe/London' AS start),
            won AS (SELECT d.setup_value_gbp::float AS oneoff,
                           COALESCE((SELECT min(h.changed_at) FROM stage_history h WHERE h.deal_id = d.id AND h.to_stage = 'Won' AND h.source = 'app'), d.updated_at) AS won_at
                      FROM deals d WHERE d.stage = 'Won')
       SELECT coalesce(sum(w.oneoff) FILTER (WHERE w.won_at >= m.start), 0)::float AS revenue,
              count(w.won_at) FILTER (WHERE w.won_at >= m.start) AS won,
              (SELECT count(*) FROM companies c WHERE c.created_at >= m.start) AS leads
         FROM m LEFT JOIN won w ON true GROUP BY m.start`),
  ]);
  const el = elapsedFractions(now);

  const done = Number(tasks[0].done), open = Number(tasks[0].open);
  const todayGoals = [
    goalProgress("tasks", "Tasks done", done, done + open, null),
    goalProgress("emails", "Outreach emails sent", Number(emails[0].n), targets.today.emails_sent, null),
  ];
  const todaySummary = summarise(todayGoals);

  const weekGoals = [
    goalProgress("leads", "New leads", Number(week[0].leads), targets.week.new_leads, el.week),
    goalProgress("calls", "Calls booked", Number(week[0].calls), targets.week.calls_booked, el.week),
    goalProgress("posts", "Posts published", Number(week[0].posts), targets.week.posts_published, el.week),
  ];
  const weekSummary = summarise(weekGoals);
  const leadsGoal = weekGoals[0];

  const monthGoals = [
    goalProgress("revenue", "One-off revenue booked", month[0].revenue, targets.month.revenue_gbp, el.month, true),
    goalProgress("won", "Deals won", Number(month[0].won), targets.month.deals_won, el.month),
    goalProgress("mleads", "New leads", Number(month[0].leads), targets.month.new_leads, el.month),
  ];
  const monthSummary = summarise(monthGoals);
  const rev = monthGoals[0];

  return {
    today: {
      period: "today", eyebrow: "Today",
      headline: done + open === 0 ? "All clear" : `${done} of ${done + open} tasks done`,
      badge: open > 0 ? { text: `${open} left`, tone: "warn" } : { text: "Nothing due", tone: "good" },
      goals: todayGoals, summary: todaySummary,
    },
    week: {
      period: "week", eyebrow: `This week · day ${el.dayOfWeek} of 7`,
      headline: weekSummary.status === "done" ? "Week complete" : weekSummary.status === "behind" ? "Behind pace" : weekSummary.status === "early" ? "Early days" : "On pace",
      badge: badgeFor(weekSummary.status, leadsGoal.projected !== null && weekSummary.status !== "done" ? `Heading for ${pluralise(leadsGoal.projected, "lead")}` : null),
      goals: weekGoals, summary: weekSummary,
    },
    month: {
      period: "month", eyebrow: `This month · day ${el.dayOfMonth} of ${el.daysInMonth}`,
      headline: gbp(rev.value),
      badge: badgeFor(monthSummary.status, rev.projected !== null && rev.status !== "done" ? `Heading for ${gbp(rev.projected)} of ${gbp(rev.target)}` : null),
      goals: monthGoals, summary: monthSummary,
    },
  };
}

export type StageSlice = { stage: string; n: number; value: number };

/** Open deals per stage, for the pipeline snapshot. */
export async function loadPipelineSnapshot(): Promise<StageSlice[]> {
  const rows = await query<{ stage: string; n: string; value: number }>(
    `SELECT stage::text AS stage, count(*) AS n, coalesce(sum(setup_value_gbp), 0)::float AS value FROM deals WHERE stage NOT IN ('Won', 'Lost') GROUP BY stage`);
  return rows.map((r) => ({ stage: r.stage, n: Number(r.n), value: r.value }));
}
