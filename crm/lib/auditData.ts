import { query } from "./db";
import { rankTasks, label, FREQUENCIES, summarise, WORKING_WEEKS, type AuditTask, type Params } from "./audit";
import { signatureOf, type Report } from "./auditReport";
import type { AuditDoc } from "./auditPdf";

export async function loadAudit(id: number) {
  const [audit] = await query<any>(
    `SELECT a.*, a.hourly_rate_gbp::float AS rate, a.automation_share::float AS share, c.name AS company_name, c.niche, d.title AS deal_title
       FROM audits a JOIN companies c ON c.id = a.company_id LEFT JOIN deals d ON d.id = a.deal_id WHERE a.id = $1`, [id]);
  if (!audit) return null;
  const rows = await query<any>(
    `SELECT id, name, performed_by, hours_per_week::float AS hours_per_week, frequency, error_rate_pct::float AS error_rate_pct, revenue_impact, data_sensitivity, ease, notes
       FROM audit_tasks WHERE audit_id = $1 ORDER BY id`, [id]);
  const params: Params = { automationShare: audit.share, hourlyRate: audit.rate };
  const tasks = rows as (AuditTask & { id: number })[];
  const ranked = rankTasks(tasks, params);
  return { audit, tasks, params, ranked, summary: summarise(ranked), report: (audit.report ?? null) as Report | null };
}

const money = (n: number) => `£${n.toLocaleString("en-GB")}`;

/** Everything the PDF needs. Numbers come from the scoring code; wording comes from the (possibly edited) report. */
export async function buildAuditDoc(id: number): Promise<{ doc: AuditDoc; stale: boolean } | null> {
  const d = await loadAudit(id);
  if (!d || !d.report) return null;
  const { audit, ranked, params, report } = d;
  const top = ranked.filter((t) => t.top);
  const s = summarise(ranked);

  const [buildOffer] = await query<{ price_min_gbp: number | null; price_max_gbp: number | null }>(`SELECT price_min_gbp::float, price_max_gbp::float FROM offers WHERE name = 'Build' AND active`);
  const [auditFee] = audit.deal_id ? await query<{ price: number }>(`SELECT l.price_gbp::float AS price FROM deal_offers l JOIN offers o ON o.id = l.offer_id WHERE l.deal_id = $1 AND o.name = 'AI Opportunity Audit' ORDER BY l.id LIMIT 1`, [audit.deal_id]) : [];

  const risks = [...report.risks];
  const personal = ranked.some((t) => t.data_sensitivity !== "none");
  if (personal && !risks.some((r) => /data protection|gdpr|processing agreement/i.test(`${r.risk} ${r.mitigation}`))) {
    risks.push({ risk: "Some tasks involve personal data.", mitigation: "A data processing agreement is put in place before any build touches it." });
  }

  return {
    stale: !!report.signature && report.signature !== signatureOf(ranked),
    doc: {
      brand: process.env.BUSINESS_NAME ?? "Your Agency", sender: process.env.SENDER_NAME ?? null, client: audit.company_name,
      date: new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }),
      summary: report.summary,
      top: top.map((t, k) => ({
        rank: k + 1, task: t.name, by: t.performed_by ?? null, hoursWeek: t.hours_per_week, hoursSavedWeek: t.hoursSavedWeek, annualGbp: t.annualGbp,
        frequency: label(FREQUENCIES, t.frequency).toLowerCase(), errorRate: t.error_rate_pct,
        why: report.opportunities[k]?.task === t.name ? report.opportunities[k].why : "(Not drafted yet: draft the report again.)",
        approach: report.opportunities[k]?.task === t.name ? report.opportunities[k].approach : "",
        flags: t.flags.filter((f) => !f.startsWith("High error")),
      })),
      totals: { hoursWeek: s.topHoursWeek, annualGbp: s.topAnnualGbp, taskHoursWeek: s.taskHoursWeek },
      assumptions: `Assumes ${Math.round(params.automationShare * 100)}% of task time can be automated, valued at ${money(params.hourlyRate)} an hour over ${WORKING_WEEKS} working weeks.`,
      held: s.held.map((t) => ({ task: t.name, reason: "special-category data: needs a data protection impact assessment and a processing agreement first." })),
      build: {
        name: report.build.name, description: report.build.description, scope: report.build.scope, timelineWeeks: report.build.timeline_weeks,
        investment: report.show_price !== false && buildOffer?.price_min_gbp != null ? `Indicative investment ${money(buildOffer.price_min_gbp)} to ${money(buildOffer.price_max_gbp!)}, depending on scope.` : null,
        credit: auditFee ? `Your audit fee of ${money(auditFee.price)} is credited against the build.` : null,
      },
      training: report.training, risks, nextSteps: report.next_steps,
    },
  };
}
