"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { query } from "./db";
import { requireLogin } from "./auth";
import { logActivity } from "./activity";
import { FREQUENCIES, IMPACTS, SENSITIVITIES, containsContactDetails } from "./audit";
import { draftReport, type Report } from "./auditReport";
import { buildAuditDoc, loadAudit } from "./auditData";
import { auditPdf } from "./auditPdf";

const str = (f: FormData, k: string) => { const v = String(f.get(k) ?? "").trim(); return v === "" ? null : v; };
const num = (f: FormData, k: string) => Number(str(f, k) ?? 0) || 0;
const NO_PERSONAL = "Please don't put personal contact details (emails or phone numbers) in an audit. Use a role or team, not a person's name or address.";

// ---- Creating and configuring an audit ----

export async function startAudit(form: FormData) {
  await requireLogin();
  const companyId = num(form, "company_id"), dealId = num(form, "deal_id") || null;
  const [c] = await query<{ name: string }>(`SELECT name FROM companies WHERE id = $1`, [companyId]);
  if (!c) throw new Error("Company not found.");
  if (dealId) { const [e] = await query<{ id: number }>(`SELECT id FROM audits WHERE deal_id = $1 ORDER BY id LIMIT 1`, [dealId]); if (e) redirect(`/audits/${e.id}`); }
  const [a] = await query<{ id: number }>(`INSERT INTO audits (company_id, deal_id, title) VALUES ($1,$2,$3) RETURNING id`, [companyId, dealId, `AI Opportunity Audit: ${c.name}`]);
  await logActivity("audit_created", { company_id: companyId, deal_id: dealId, body: `Audit started for ${c.name}` });
  revalidatePath("/audits");
  redirect(`/audits/${a.id}`);
}

export async function saveAuditSettings(form: FormData): Promise<{ error?: string } | void> {
  await requireLogin();
  const id = num(form, "id");
  const context = str(form, "context"), title = str(form, "title");
  if (!title) return { error: "Give the audit a title." };
  if (containsContactDetails(context) || containsContactDetails(title)) return { error: NO_PERSONAL };
  const rate = num(form, "hourly_rate"), share = num(form, "automation_share") / 100;
  if (!(rate > 0 && rate <= 500)) return { error: "Hourly rate should be between £1 and £500." };
  if (!(share >= 0.1 && share <= 1)) return { error: "Automation share should be between 10% and 100%." };
  await query(`UPDATE audits SET title = $2, context = $3, hourly_rate_gbp = $4, automation_share = $5 WHERE id = $1`, [id, title, context?.slice(0, 1500) ?? null, rate, share]);
  revalidatePath(`/audits/${id}`);
}

// ---- The intake ----

export async function saveTask(form: FormData): Promise<{ error?: string } | void> {
  await requireLogin();
  const auditId = num(form, "audit_id"), id = num(form, "id") || null;
  const name = str(form, "name");
  if (!name) return { error: "Give the task a name." };
  const by = str(form, "performed_by"), notes = str(form, "notes");
  if ([name, by, notes].some(containsContactDetails)) return { error: NO_PERSONAL };
  const hours = num(form, "hours_per_week"), error = num(form, "error_rate_pct");
  if (!(hours >= 0 && hours <= 200)) return { error: "Hours per week should be between 0 and 200." };
  if (!(error >= 0 && error <= 100)) return { error: "Error rate should be a percentage from 0 to 100." };
  const frequency = str(form, "frequency") ?? "weekly", impact = str(form, "revenue_impact") ?? "medium", sens = str(form, "data_sensitivity") ?? "none";
  if (!FREQUENCIES.some((f) => f.code === frequency)) return { error: "Pick a frequency." };
  if (!IMPACTS.some((f) => f.code === impact)) return { error: "Pick a revenue impact." };
  if (!SENSITIVITIES.some((f) => f.code === sens)) return { error: "Pick a data sensitivity." };
  const ease = str(form, "ease") === null ? null : Math.round(num(form, "ease"));
  if (ease !== null && (ease < 1 || ease > 5)) return { error: "Ease is 1 (hard) to 5 (easy)." };
  const vals = [name.slice(0, 200), by?.slice(0, 100) ?? null, hours, frequency, error, impact, sens, ease, notes?.slice(0, 500) ?? null];
  if (id) await query(`UPDATE audit_tasks SET name=$2, performed_by=$3, hours_per_week=$4, frequency=$5, error_rate_pct=$6, revenue_impact=$7, data_sensitivity=$8, ease=$9, notes=$10 WHERE id=$1 AND audit_id=$11`, [id, ...vals, auditId]);
  else await query(`INSERT INTO audit_tasks (name, performed_by, hours_per_week, frequency, error_rate_pct, revenue_impact, data_sensitivity, ease, notes, audit_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`, [...vals, auditId]);
  revalidatePath(`/audits/${auditId}`);
}

export async function deleteTask(form: FormData) {
  await requireLogin();
  const id = num(form, "id");
  const [t] = await query<{ audit_id: number }>(`DELETE FROM audit_tasks WHERE id = $1 RETURNING audit_id`, [id]);
  if (t) revalidatePath(`/audits/${t.audit_id}`);
}

// ---- The report ----

/** Drafts the report wording with Claude. Uses API credits, so it only runs when you click, and stops at a daily cap. */
export async function draftReportAction(auditId: number): Promise<{ error?: string; warnings?: string[]; model?: string }> {
  await requireLogin();
  const cap = Number(process.env.AUDIT_DAILY_CAP ?? 10) || 10;
  const [{ n }] = await query<{ n: string }>(`SELECT count(*) AS n FROM activities WHERE type = 'audit_report_drafted' AND occurred_at::date = current_date`);
  if (Number(n) >= cap) return { error: `Daily cap of ${cap} AI reports reached. Edit the existing draft, or try again tomorrow.` };
  const d = await loadAudit(auditId);
  if (!d) return { error: "Audit not found." };
  try {
    const { report, model, warnings } = await draftReport({ client: d.audit.company_name, niche: d.audit.niche, context: d.audit.context, params: d.params, ranked: d.ranked });
    await query(`UPDATE audits SET report = $2::jsonb, report_model = $3, report_generated_at = now(), status = CASE WHEN status = 'delivered' THEN status ELSE 'report_drafted' END WHERE id = $1`, [auditId, JSON.stringify(report), model]);
    await logActivity("audit_report_drafted", { company_id: d.audit.company_id, deal_id: d.audit.deal_id, body: `Report drafted (${model})` });
    revalidatePath(`/audits/${auditId}`);
    return { warnings, model };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

const lines = (s: string | null, max: number) => (s ?? "").split("\n").map((l) => l.replace(/^[-*•\s]+/, "").trim()).filter(Boolean).slice(0, max);

export async function saveReportEdits(form: FormData): Promise<{ error?: string } | void> {
  await requireLogin();
  const id = num(form, "id");
  const [row] = await query<{ report: Report | null }>(`SELECT report FROM audits WHERE id = $1`, [id]);
  if (!row?.report) return { error: "Draft the report first." };
  const r = row.report;
  const next: Report = {
    ...r, summary: String(form.get("summary") ?? "").trim().slice(0, 600),
    opportunities: r.opportunities.map((o, i) => ({ ...o, why: String(form.get(`why_${i}`) ?? "").trim().slice(0, 400), approach: String(form.get(`approach_${i}`) ?? "").trim().slice(0, 350) })),
    build: { name: String(form.get("build_name") ?? "").trim().slice(0, 100), description: String(form.get("build_description") ?? "").trim().slice(0, 400), scope: lines(str(form, "build_scope"), 6), timeline_weeks: Math.min(12, Math.max(1, Math.round(num(form, "build_weeks")) || 4)) },
    training: lines(str(form, "training"), 5),
    risks: lines(str(form, "risks"), 6).map((l) => { const [risk, ...rest] = l.split("|"); return { risk: risk.trim(), mitigation: rest.join("|").trim() }; }),
    next_steps: lines(str(form, "next_steps"), 4), show_price: form.get("show_price") === "on",
  };
  if (containsContactDetails(JSON.stringify(next))) return { error: NO_PERSONAL };
  await query(`UPDATE audits SET report = $2::jsonb WHERE id = $1`, [id, JSON.stringify(next)]);
  revalidatePath(`/audits/${id}`);
}

/** Builds the two-page PDF and keeps a copy against the client record (and the deal). */
export async function savePdfAction(auditId: number): Promise<{ error?: string; documentId?: number; note?: string }> {
  await requireLogin();
  const built = await buildAuditDoc(auditId);
  if (!built) return { error: "Draft the report first." };
  const { bytes, fontSize, overflow } = await auditPdf(built.doc);
  const [a] = await query<{ company_id: number; deal_id: number | null; company_name: string }>(`SELECT a.company_id, a.deal_id, c.name AS company_name FROM audits a JOIN companies c ON c.id = a.company_id WHERE a.id = $1`, [auditId]);
  const slug = a.company_name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
  const filename = `ai-opportunity-audit-${slug}-${new Date().toISOString().slice(0, 10)}.pdf`;
  const [doc] = await query<{ id: number }>(
    `INSERT INTO company_documents (company_id, deal_id, audit_id, kind, filename, size_bytes, data) VALUES ($1,$2,$3,'audit_report',$4,$5,$6) RETURNING id`,
    [a.company_id, a.deal_id, auditId, filename, bytes.length, Buffer.from(bytes)]);
  await query(`UPDATE audits SET status = 'delivered' WHERE id = $1 AND status <> 'delivered'`, [auditId]);
  await logActivity("audit_pdf_saved", { company_id: a.company_id, deal_id: a.deal_id, body: `${filename} saved to the client record` });
  revalidatePath(`/audits/${auditId}`);
  revalidatePath(`/companies/${a.company_id}`);
  return { documentId: doc.id, note: overflow ? "The text was long, so the PDF uses a small font. Shorten it for easier reading." : built.stale ? "The tasks changed since this draft was written: redraft or check the text." : fontSize < 9 ? "Text is compact to fit two pages." : undefined };
}
