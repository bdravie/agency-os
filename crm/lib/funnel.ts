import { query } from "./db";
import { CHANNELS, FUNNEL_STAGES, LOST_REASONS, STAGE_META, type Stage } from "./stages";
import { average, funnelRows, groupLost, rate, rangeFor, type By, type LostGroup, type Range } from "./funnelMath";

export type Basis = "created" | "moved";

export type FunnelData = {
  basis: Basis; range: Range; deals: number; open: number; won: number; lost: number; closeRate: number | null; avgDaysToWin: number | null; wonSetup: number; wonMonthly: number;
  rows: { stage: Stage; label: string; reached: number; pctPrev: number | null; pctLead: number | null }[];
  durations: { stage: Stage; label: string; avgDays: number | null; n: number; current: number }[];
  lostReasons: LostGroup[]; lostNotes: { id: number; title: string; reason: string; note: string }[];
  channels: { code: string; label: string; deals: number; contacted: number; replied: number; calls: number; won: number; lost: number; replyRate: number | null; closeRate: number | null; wonSetup: number; wonMonthly: number }[];
};

// Position of each stage on the way to Won. Skipping a stage still counts as having passed it.
const IDX = `CASE to_stage::text WHEN 'New' THEN 0 WHEN 'Contacted' THEN 1 WHEN 'Replied' THEN 2 WHEN 'Call booked' THEN 3 WHEN 'Audit sold' THEN 4 WHEN 'Proposal sent' THEN 5 WHEN 'Won' THEN 6 END`;

export async function loadFunnel(by: By, offset: number, basis: Basis): Promise<FunnelData> {
  const range = rangeFor(by, offset);
  const p = [range.start?.toISOString() ?? null, range.end?.toISOString() ?? null];
  const inRange = (col: string) => `($1::timestamptz IS NULL OR ${col} >= $1) AND ($2::timestamptz IS NULL OR ${col} < $2)`;
  // Two ways to read a period: deals CREATED in it (a cohort, and how far they got), or deals that MOVED in it.
  const scope = basis === "created"
    ? `SELECT id FROM deals WHERE ${inRange("created_at")}`
    : `SELECT DISTINCT deal_id AS id FROM stage_history WHERE source = 'app' AND ${inRange("changed_at")}`;

  const [deals, entries, stays] = await Promise.all([
    query<any>(
      `WITH scope AS (${scope}),
            reach AS (SELECT deal_id, max(${IDX}) AS maxi FROM stage_history GROUP BY deal_id),
            ev AS (SELECT deal_id, min(changed_at) FILTER (WHERE to_stage = 'Won') AS won_at, min(changed_at) FILTER (WHERE to_stage = 'Lost') AS lost_at,
                          array_agg(DISTINCT ${IDX}) FILTER (WHERE ${inRange("changed_at")} AND ${IDX} IS NOT NULL) AS entered
                     FROM stage_history WHERE source = 'app' GROUP BY deal_id)
       SELECT d.id, d.title, d.stage::text AS stage, d.channel, d.lost_reason, d.lost_note, d.setup_value_gbp::float AS setup, d.monthly_value_gbp::float AS monthly,
              COALESCE(r.maxi, 0) AS maxi, ev.won_at, ev.lost_at, ev.entered, EXTRACT(EPOCH FROM (ev.won_at - d.created_at)) / 86400 AS days_to_win
         FROM deals d JOIN scope s ON s.id = d.id LEFT JOIN reach r ON r.deal_id = d.id LEFT JOIN ev ON ev.deal_id = d.id`, p),
    query<{ to_stage: string; n: string }>(
      `SELECT to_stage::text AS to_stage, count(DISTINCT deal_id) AS n FROM stage_history WHERE source = 'app' AND ${inRange("changed_at")} GROUP BY 1`, p),
    query<{ to_stage: string; avg_days: number; n: string }>(
      `WITH scope AS (${scope}),
            h AS (SELECT deal_id, to_stage, changed_at, source, lead(changed_at) OVER (PARTITION BY deal_id ORDER BY changed_at, id) AS left_at FROM stage_history)
       SELECT to_stage::text AS to_stage, avg(EXTRACT(EPOCH FROM (left_at - changed_at)) / 86400) AS avg_days, count(*) AS n
         FROM h WHERE source = 'app' AND left_at IS NOT NULL AND deal_id IN (SELECT id FROM scope)${basis === "moved" ? ` AND ${inRange("changed_at")}` : ""} GROUP BY 1`, p),
  ]);

  const entered = new Map(entries.map((e) => [e.to_stage, Number(e.n)]));
  const inPeriod = (d: Date | null) => !!d && (!range.start || d >= range.start) && (!range.end || d < range.end);
  const wonDeals = deals.filter((d) => d.stage === "Won" && (basis === "created" || inPeriod(d.won_at)));
  const lostDeals = deals.filter((d) => d.stage === "Lost" && (basis === "created" || inPeriod(d.lost_at)));

  const reached = FUNNEL_STAGES.map((_, k) => (basis === "created" ? deals.filter((d) => d.maxi >= k).length : entered.get(FUNNEL_STAGES[k]) ?? 0));
  const rows = funnelRows(reached).map((r, i) => ({ stage: FUNNEL_STAGES[i], label: STAGE_META[FUNNEL_STAGES[i]].label, ...r }));
  const won = basis === "created" ? wonDeals.length : entered.get("Won") ?? 0;
  const lost = basis === "created" ? lostDeals.length : entered.get("Lost") ?? 0;

  const stayMap = new Map(stays.map((s) => [s.to_stage, s]));
  const durations = FUNNEL_STAGES.filter((s) => s !== "Won").map((s) => ({
    stage: s, label: STAGE_META[s].label, avgDays: stayMap.get(s) ? Number(stayMap.get(s)!.avg_days) : null, n: Number(stayMap.get(s)?.n ?? 0), current: deals.filter((d) => d.stage === s).length,
  }));

  const channels = [...CHANNELS.map((c) => c.code as string), "__none"].map((code) => {
    const ch = (d: any) => (d.channel ?? "__none") === code;
    const mine = deals.filter(ch);
    const w = wonDeals.filter(ch), l = lostDeals.filter(ch); // the same rule as the headline tiles
    const reachedIn = (d: any, k: number) => (basis === "created" ? d.maxi >= k : (d.entered ?? []).includes(k));
    const contacted = mine.filter((d) => reachedIn(d, 1)).length, replied = mine.filter((d) => reachedIn(d, 2)).length;
    return {
      code, label: code === "__none" ? "Not set" : CHANNELS.find((c) => c.code === code)!.label, deals: mine.length, contacted, replied,
      calls: mine.filter((d) => reachedIn(d, 3)).length, won: w.length, lost: l.length, replyRate: rate(replied, contacted), closeRate: rate(w.length, w.length + l.length),
      wonSetup: w.reduce((s, d) => s + d.setup, 0), wonMonthly: w.reduce((s, d) => s + d.monthly, 0),
    };
  });

  return {
    basis, range, deals: deals.length, open: deals.filter((d) => d.stage !== "Won" && d.stage !== "Lost").length, won, lost, closeRate: rate(won, won + lost),
    avgDaysToWin: average(wonDeals.map((d) => d.days_to_win)), // pg returns numeric as text, and NULL when the win was never timed
    wonSetup: wonDeals.reduce((s, d) => s + d.setup, 0), wonMonthly: wonDeals.reduce((s, d) => s + d.monthly, 0),
    rows, durations, channels,
    lostReasons: groupLost(lostDeals.map((d) => d.lost_reason), [...LOST_REASONS]),
    lostNotes: lostDeals.filter((d) => d.lost_note).slice(0, 5).map((d) => ({ id: d.id, title: d.title, reason: d.lost_reason, note: d.lost_note })),
  };
}
