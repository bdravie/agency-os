import { query } from "./db";
import { assess, type Assessment, type MetricIn, type Better } from "./outcomeMath";

export type Outcome = {
  id: number; company_id: number; deal_id: number | null; title: string; kickoff_on: string; status: "active" | "paused" | "ended";
  built: string | null; testimonial_status: "not_asked" | "requested" | "received" | "declined";
  case_study: CaseStudy | null; case_study_model: string | null; case_study_at: string | null; company_name: string;
};
export type CaseStudy = { headline: string; challenge: string; solution: string; results: string[]; email_subject: string; email_body: string };

export const todayIso = () => new Date().toISOString().slice(0, 10);

const COLS = `o.id, o.company_id, o.deal_id, o.title, to_char(o.kickoff_on, 'YYYY-MM-DD') AS kickoff_on, o.status, o.built, o.testimonial_status,
  o.case_study, o.case_study_model, o.case_study_at, c.name AS company_name`;

async function metricsFor(ids: number[]): Promise<Map<number, MetricIn[]>> {
  const out = new Map<number, MetricIn[]>();
  if (ids.length === 0) return out;
  const ms = await query<any>(`SELECT id, outcome_id, name, unit, better, baseline::float8 AS baseline FROM outcome_metrics WHERE outcome_id = ANY($1) ORDER BY position, id`, [ids]);
  const rs = await query<any>(`SELECT metric_id, to_char(period, 'YYYY-MM-DD') AS period, value::float8 AS value FROM outcome_readings WHERE metric_id = ANY($1) ORDER BY period`, [ms.map((m: any) => m.id)]);
  for (const m of ms) {   // bigint columns arrive as strings, so convert before comparing or using as keys
    const key = Number(m.outcome_id), list = out.get(key) ?? [];
    list.push({ id: Number(m.id), name: m.name, unit: m.unit, better: m.better as Better, baseline: m.baseline, readings: rs.filter((r: any) => Number(r.metric_id) === Number(m.id)).map((r: any) => ({ period: r.period, value: r.value })) });
    out.set(key, list);
  }
  return out;
}

const fix = (o: Outcome): Outcome => ({ ...o, id: Number(o.id), company_id: Number(o.company_id), deal_id: o.deal_id === null ? null : Number(o.deal_id) });

export type Loaded = { outcome: Outcome; metrics: MetricIn[]; assessment: Assessment };

export async function loadOutcome(id: number): Promise<Loaded | null> {
  const [row] = await query<Outcome>(`SELECT ${COLS} FROM outcomes o JOIN companies c ON c.id = o.company_id WHERE o.id = $1`, [id]);
  if (!row) return null;
  const outcome = fix(row);
  const metrics = (await metricsFor([id])).get(id) ?? [];
  return { outcome, metrics, assessment: assess({ kickoff: outcome.kickoff_on, today: todayIso(), metrics }) };
}

export async function loadOutcomes(): Promise<Loaded[]> {
  const rows = (await query<Outcome>(`SELECT ${COLS} FROM outcomes o JOIN companies c ON c.id = o.company_id ORDER BY (o.status = 'active') DESC, c.name, o.id`)).map(fix);
  const all = await metricsFor(rows.map((r) => r.id));
  return rows.map((outcome) => {
    const metrics = all.get(outcome.id) ?? [];
    return { outcome, metrics, assessment: assess({ kickoff: outcome.kickoff_on, today: todayIso(), metrics }) };
  });
}

/** Active outcomes that need a nudge: flat, slipping, or no data. Used by the Today page. */
export const needsAttention = (l: Loaded) => l.outcome.status === "active" && l.assessment.flagged;
