"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { query, tx } from "./db";
import { requireLogin } from "./auth";
import { logActivity } from "./activity";
import { containsContactDetails } from "./audit";
import { parseCsv } from "./csv";
import { loadOutcome, todayIso, type CaseStudy } from "./outcomeData";
import { PRESETS, longDate, monthLabel, monthStart, readingsFromCsv, type Better } from "./outcomeMath";
import { draftCaseStudy, draftMonthly, factsText } from "./outcomeReport";
import { reportPdf } from "./outcomePdf";

const str = (f: FormData, k: string) => { const v = String(f.get(k) ?? "").trim(); return v === "" ? null : v; };
const num = (f: FormData, k: string) => Number(str(f, k) ?? 0) || 0;
const NO_PERSONAL = "Please keep this to business details: no email addresses or phone numbers.";
const MAX_METRICS = 8;
const isIso = (s: string | null): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
const parseNum = (s: string | null) => { const t = (s ?? "").replace(/[£,%\s]/g, ""); return /^\d+(\.\d+)?$/.test(t) && Number(t) <= 1e9 ? Number(t) : null; };
const paths = (id: number, companyId?: number) => { revalidatePath("/outcomes"); revalidatePath(`/outcomes/${id}`); if (companyId) revalidatePath(`/companies/${companyId}`); };

// ---------- starting and configuring ----------

/** Creates the outcome record and its baseline metrics in one go (the kickoff step). */
export async function createOutcome(_prev: string | null, form: FormData): Promise<string | null> {
  await requireLogin();
  const companyId = num(form, "company_id"), dealId = num(form, "deal_id") || null;
  const [co] = await query<{ name: string }>(`SELECT name FROM companies WHERE id = $1`, [companyId]);
  if (!co) return "Choose a client first.";
  const kickoff = str(form, "kickoff_on");
  if (!isIso(kickoff)) return "Enter the kickoff date.";
  if (kickoff > todayIso()) return "The kickoff date can't be in the future: baselines are what the numbers were at kickoff.";
  const title = str(form, "title") ?? `Results: ${co.name}`, built = str(form, "built");
  if (containsContactDetails(title) || containsContactDetails(built)) return NO_PERSONAL;

  const metrics: { name: string; unit: string; better: Better; baseline: number }[] = [];
  PRESETS.forEach((p, i) => {
    if (form.get(`use_${i}`) !== "on") return;
    metrics.push({ name: p.name, unit: p.unit, better: p.better, baseline: parseNum(str(form, `base_${i}`)) ?? NaN });
  });
  for (let n = 0; n < 3; n++) {
    const name = str(form, `c_name_${n}`);
    if (!name) continue;
    metrics.push({ name: name.slice(0, 80), unit: (str(form, `c_unit_${n}`) ?? "").slice(0, 20), better: str(form, `c_better_${n}`) === "higher" ? "higher" : "lower", baseline: parseNum(str(form, `c_base_${n}`)) ?? NaN });
  }
  if (metrics.length === 0) return "Choose at least one metric to track.";
  if (metrics.length > MAX_METRICS) return `Track at most ${MAX_METRICS} metrics so the report stays on one page.`;
  const bad = metrics.find((m) => Number.isNaN(m.baseline));
  if (bad) return `Enter a baseline number for “${bad.name}” (0 or more).`;
  if (metrics.some((m) => containsContactDetails(m.name))) return NO_PERSONAL;
  if (new Set(metrics.map((m) => m.name.toLowerCase())).size !== metrics.length) return "Two metrics have the same name.";

  const id = await tx(async (c) => {
    const { rows: [o] } = await c.query(`INSERT INTO outcomes (company_id, deal_id, title, kickoff_on, built) VALUES ($1,$2,$3,$4,$5) RETURNING id`, [companyId, dealId, title.slice(0, 200), kickoff, built?.slice(0, 800) ?? null]);
    for (const [i, m] of metrics.entries()) await c.query(`INSERT INTO outcome_metrics (outcome_id, name, unit, better, baseline, position) VALUES ($1,$2,$3,$4,$5,$6)`, [o.id, m.name, m.unit, m.better, m.baseline, i]);
    return o.id as number;
  });
  await logActivity("outcome_started", { company_id: companyId, deal_id: dealId, body: `Results tracking started for ${co.name}: ${metrics.length} metric${metrics.length === 1 ? "" : "s"}, kickoff ${longDate(kickoff)}` });
  paths(id, companyId);
  redirect(`/outcomes/${id}`);
}

export async function saveOutcomeSettings(form: FormData): Promise<{ error?: string } | void> {
  await requireLogin();
  const id = num(form, "id"), title = str(form, "title"), kickoff = str(form, "kickoff_on"), built = str(form, "built");
  if (!title) return { error: "Give it a title." };
  if (!isIso(kickoff)) return { error: "Enter the kickoff date." };
  if (containsContactDetails(title) || containsContactDetails(built)) return { error: NO_PERSONAL };
  const status = ["active", "paused", "ended"].includes(str(form, "status") ?? "") ? str(form, "status") : "active";
  const t = ["not_asked", "requested", "received", "declined"].includes(str(form, "testimonial_status") ?? "") ? str(form, "testimonial_status") : "not_asked";
  const [o] = await query<{ company_id: number }>(`UPDATE outcomes SET title=$2, kickoff_on=$3, built=$4, status=$5, testimonial_status=$6 WHERE id=$1 RETURNING company_id`, [id, title.slice(0, 200), kickoff, built?.slice(0, 800) ?? null, status, t]);
  if (o) paths(id, o.company_id);
}

export async function deleteOutcome(form: FormData) {
  await requireLogin();
  const [o] = await query<{ company_id: number }>(`DELETE FROM outcomes WHERE id = $1 RETURNING company_id`, [num(form, "id")]);
  if (o) { revalidatePath("/outcomes"); revalidatePath(`/companies/${o.company_id}`); }
  redirect("/outcomes");
}

export async function addMetric(form: FormData): Promise<{ error?: string } | void> {
  await requireLogin();
  const outcomeId = num(form, "outcome_id"), name = str(form, "name"), baseline = parseNum(str(form, "baseline"));
  if (!name) return { error: "Name the metric." };
  if (baseline === null) return { error: "Enter the baseline number (0 or more)." };
  if (containsContactDetails(name)) return { error: NO_PERSONAL };
  const [{ n }] = await query<{ n: string }>(`SELECT count(*) AS n FROM outcome_metrics WHERE outcome_id = $1`, [outcomeId]);
  if (Number(n) >= MAX_METRICS) return { error: `At most ${MAX_METRICS} metrics, so the report stays on one page.` };
  try {
    await query(`INSERT INTO outcome_metrics (outcome_id, name, unit, better, baseline, position) VALUES ($1,$2,$3,$4,$5,$6)`, [outcomeId, name.slice(0, 80), (str(form, "unit") ?? "").slice(0, 20), str(form, "better") === "higher" ? "higher" : "lower", baseline, Number(n)]);
  } catch (e: any) { if (e?.code === "23505") return { error: "There is already a metric with that name." }; throw e; }
  paths(outcomeId);
}

export async function saveMetric(form: FormData): Promise<{ error?: string } | void> {
  await requireLogin();
  const id = num(form, "id"), name = str(form, "name"), baseline = parseNum(str(form, "baseline"));
  if (!name) return { error: "Name the metric." };
  if (baseline === null) return { error: "Enter the baseline number (0 or more)." };
  if (containsContactDetails(name)) return { error: NO_PERSONAL };
  try {
    const [m] = await query<{ outcome_id: number }>(`UPDATE outcome_metrics SET name=$2, unit=$3, better=$4, baseline=$5 WHERE id=$1 RETURNING outcome_id`, [id, name.slice(0, 80), (str(form, "unit") ?? "").slice(0, 20), str(form, "better") === "higher" ? "higher" : "lower", baseline]);
    if (m) paths(m.outcome_id);
  } catch (e: any) { if (e?.code === "23505") return { error: "There is already a metric with that name." }; throw e; }
}

export async function deleteMetric(form: FormData): Promise<void> {
  await requireLogin();
  const [m] = await query<{ outcome_id: number }>(`DELETE FROM outcome_metrics WHERE id = $1 RETURNING outcome_id`, [num(form, "id")]);
  if (m) paths(m.outcome_id);
}

// ---------- logging results ----------

async function kickoffMonth(outcomeId: number) {
  const [o] = await query<{ k: string; company_id: number }>(`SELECT to_char(kickoff_on, 'YYYY-MM-01') AS k, company_id FROM outcomes WHERE id = $1`, [outcomeId]);
  return o;
}

/** One month's numbers typed in by hand. Blank boxes are left alone. */
export async function saveReadings(form: FormData): Promise<{ error?: string } | void> {
  await requireLogin();
  const outcomeId = num(form, "outcome_id"), month = str(form, "month");
  const o = await kickoffMonth(outcomeId);
  if (!o) return { error: "Outcome not found." };
  if (!month || !/^\d{4}-\d{2}$/.test(month)) return { error: "Choose the month." };
  const period = monthStart(month);
  if (period > monthStart(todayIso())) return { error: "That month hasn't happened yet." };
  if (period < o.k) return { error: `That's before kickoff (${monthLabel(o.k)}).` };
  const metrics = await query<{ id: number }>(`SELECT id FROM outcome_metrics WHERE outcome_id = $1`, [outcomeId]);
  const rows: { id: number; value: number }[] = [];
  for (const m of metrics) {
    const raw = str(form, `v_${m.id}`);
    if (raw === null) continue;
    const value = parseNum(raw);
    if (value === null) return { error: `“${raw}” isn't a number I can use (0 or more).` };
    rows.push({ id: m.id, value });
  }
  if (rows.length === 0) return { error: "Enter at least one number." };
  await tx(async (c) => { for (const r of rows) await c.query(`INSERT INTO outcome_readings (metric_id, period, value, source) VALUES ($1,$2,$3,'manual') ON CONFLICT (metric_id, period) DO UPDATE SET value = EXCLUDED.value, source = 'manual'`, [r.id, period, r.value]); });
  await logActivity("outcome_logged", { company_id: o.company_id, body: `${rows.length} result${rows.length === 1 ? "" : "s"} logged for ${monthLabel(period)}` });
  paths(outcomeId, o.company_id);
}

export type ImportState = { ok?: string; problems?: string[]; error?: string } | null;

/** Import a CSV: either month,metric,value rows, or a month column plus one column per metric. */
export async function importReadings(_prev: ImportState, form: FormData): Promise<ImportState> {
  await requireLogin();
  const outcomeId = num(form, "outcome_id"), file = form.get("file");
  const o = await kickoffMonth(outcomeId);
  if (!o) return { error: "Outcome not found." };
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a .csv file." };
  if (file.size > 1_000_000) return { error: "That file is over 1 MB." };
  const metrics = await query<{ id: number; name: string }>(`SELECT id, name FROM outcome_metrics WHERE outcome_id = $1`, [outcomeId]);
  const r = readingsFromCsv(parseCsv(await file.text()), metrics, todayIso());
  const problems = [...r.problems];
  const usable = r.readings.filter((x) => { if (x.period < o.k) { if (problems.length < 20) problems.push(`${monthLabel(x.period)} is before kickoff (${monthLabel(o.k)}), so it was skipped.`); return false; } return true; });
  if (usable.length === 0) return { error: problems[0] ?? "Nothing to import.", problems: problems.slice(1) };
  const have = new Set((await query<{ k: string }>(`SELECT metric_id || '|' || to_char(period, 'YYYY-MM-DD') AS k FROM outcome_readings WHERE metric_id = ANY($1)`, [metrics.map((m) => m.id)])).map((r) => r.k));
  const replaced = usable.filter((x) => have.has(`${x.metricId}|${x.period}`)).length;
  await tx(async (c) => { for (const x of usable) await c.query(`INSERT INTO outcome_readings (metric_id, period, value, source) VALUES ($1,$2,$3,'csv') ON CONFLICT (metric_id, period) DO UPDATE SET value = EXCLUDED.value, source = 'csv'`, [x.metricId, x.period, x.value]); });
  await logActivity("outcome_logged", { company_id: o.company_id, body: `${usable.length} result${usable.length === 1 ? "" : "s"} imported from CSV` });
  paths(outcomeId, o.company_id);
  return { ok: `Imported ${usable.length} number${usable.length === 1 ? "" : "s"}${replaced ? ` (${replaced} replaced an existing figure)` : ""}.`, problems };
}

// ---------- the monthly report ----------

async function factsFor(outcomeId: number) {
  const l = await loadOutcome(outcomeId);
  return l && { l, facts: { client: l.outcome.company_name, kickoff: l.outcome.kickoff_on, built: l.outcome.built, metrics: l.metrics, today: todayIso() } };
}

async function underCap(): Promise<string | null> {
  const cap = Number(process.env.OUTCOMES_DAILY_CAP ?? 20) || 20;
  const [{ n }] = await query<{ n: string }>(`SELECT count(*) AS n FROM activities WHERE type = 'outcome_ai_drafted' AND occurred_at::date = current_date`);
  return Number(n) >= cap ? `Daily cap of ${cap} AI drafts reached. Edit the existing text, or try again tomorrow.` : null;
}

/** Drafts the wins and next improvement with Claude. Uses credits, so it only runs when you click, and stops at a daily cap. */
export async function draftMonthlyAction(outcomeId: number, period: string): Promise<{ error?: string; warnings?: string[] }> {
  await requireLogin();
  const full = await factsFor(outcomeId);
  if (!full) return { error: "Outcome not found." };
  if (!/^\d{4}-\d{2}-01$/.test(period)) return { error: "Choose a month." };
  if (!full.l.metrics.some((m) => m.readings.some((r) => r.period <= period))) return { error: `No results logged up to ${monthLabel(period)} yet.` };
  const capped = await underCap(); if (capped) return { error: capped };
  try {
    const { draft, model, warnings } = await draftMonthly(full.facts, period);
    await query(`INSERT INTO outcome_reports (outcome_id, period, wins, next_improvement, model, generated_at) VALUES ($1,$2,$3::jsonb,$4,$5,now())
                 ON CONFLICT (outcome_id, period) DO UPDATE SET wins = EXCLUDED.wins, next_improvement = EXCLUDED.next_improvement, model = EXCLUDED.model, generated_at = now()`, [outcomeId, period, JSON.stringify(draft.wins), draft.next_improvement, model]);
    await logActivity("outcome_ai_drafted", { company_id: full.l.outcome.company_id, body: `Monthly report wording drafted for ${monthLabel(period)} (${model})` });
    paths(outcomeId);
    return { warnings };
  } catch (err) { return { error: err instanceof Error ? err.message : String(err) }; }
}

/** Saves hand-written or edited wording (also how you write a report without using any AI). */
export async function saveNarrative(form: FormData): Promise<{ error?: string } | void> {
  await requireLogin();
  const id = num(form, "outcome_id"), period = str(form, "period");
  if (!period || !/^\d{4}-\d{2}-01$/.test(period)) return { error: "Choose a month." };
  const wins = (str(form, "wins") ?? "").split("\n").map((l) => l.replace(/^[-*•\s]+/, "").trim()).filter(Boolean).slice(0, 3).map((w) => w.slice(0, 300));
  const next = str(form, "next_improvement")?.slice(0, 450) ?? null;
  if (containsContactDetails(`${wins.join(" ")} ${next}`)) return { error: NO_PERSONAL };
  await query(`INSERT INTO outcome_reports (outcome_id, period, wins, next_improvement) VALUES ($1,$2,$3::jsonb,$4) ON CONFLICT (outcome_id, period) DO UPDATE SET wins = EXCLUDED.wins, next_improvement = EXCLUDED.next_improvement`, [id, period, JSON.stringify(wins), next]);
  paths(id);
}

/** Builds the one-page PDF for a month and keeps a copy against the client record. */
export async function saveReportPdf(outcomeId: number, period: string): Promise<{ error?: string; documentId?: number; note?: string }> {
  await requireLogin();
  const full = await factsFor(outcomeId);
  if (!full) return { error: "Outcome not found." };
  const { assessment } = factsText(full.facts, period);
  if (!assessment.metrics.some((m) => m.latest)) return { error: `No results logged up to ${monthLabel(period)} yet.` };
  const [rep] = await query<{ wins: string[]; next_improvement: string | null }>(`SELECT wins, next_improvement FROM outcome_reports WHERE outcome_id = $1 AND period = $2`, [outcomeId, period]);
  if (!rep || (rep.wins.length === 0 && !rep.next_improvement)) return { error: "Add the wins and next improvement first (draft them with AI, or type them)." };
  const o = full.l.outcome;
  const { bytes, overflow } = await reportPdf({
    brand: process.env.BUSINESS_NAME?.trim() || "Your AI automation partner", sender: process.env.SENDER_NAME?.trim() || null,
    client: o.company_name, monthLabel: monthLabel(period), kickoffText: longDate(o.kickoff_on), built: o.built,
    rows: assessment.metrics.map((m) => ({ name: m.name, unit: m.unit, better: m.better, baseline: m.baseline, now: m.latest?.value ?? null, moved: m.moved, verdict: m.verdict })),
    wins: rep.wins, nextImprovement: rep.next_improvement ?? "",
  });
  const slug = o.company_name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
  const filename = `results-report-${slug}-${period.slice(0, 7)}.pdf`;
  const [doc] = await query<{ id: number }>(`INSERT INTO company_documents (company_id, deal_id, outcome_id, kind, filename, size_bytes, data) VALUES ($1,$2,$3,'client_report',$4,$5,$6) RETURNING id`, [o.company_id, o.deal_id, outcomeId, filename, bytes.length, Buffer.from(bytes)]);
  await logActivity("outcome_report_saved", { company_id: o.company_id, deal_id: o.deal_id, body: `${filename} saved to the client record` });
  paths(outcomeId, o.company_id);
  return { documentId: doc.id, note: overflow ? "The text was long, so the PDF is cramped. Shorten the wording to keep it on one page." : undefined };
}

// ---------- case study and testimonial request ----------

export async function draftCaseStudyAction(outcomeId: number): Promise<{ error?: string; warnings?: string[] }> {
  await requireLogin();
  const full = await factsFor(outcomeId);
  if (!full) return { error: "Outcome not found." };
  const capped = await underCap(); if (capped) return { error: capped };
  try {
    const { draft, model, warnings } = await draftCaseStudy(full.facts);
    await query(`UPDATE outcomes SET case_study = $2::jsonb, case_study_model = $3, case_study_at = now() WHERE id = $1`, [outcomeId, JSON.stringify(draft), model]);
    await logActivity("outcome_ai_drafted", { company_id: full.l.outcome.company_id, body: `Case study and testimonial request drafted (${model})` });
    paths(outcomeId);
    return { warnings };
  } catch (err) { return { error: err instanceof Error ? err.message : String(err) }; }
}

export async function saveCaseStudy(form: FormData): Promise<{ error?: string } | void> {
  await requireLogin();
  const id = num(form, "id");
  const cs: CaseStudy = {
    headline: String(form.get("headline") ?? "").trim().slice(0, 140), challenge: String(form.get("challenge") ?? "").trim().slice(0, 900), solution: String(form.get("solution") ?? "").trim().slice(0, 900),
    results: String(form.get("results") ?? "").split("\n").map((l) => l.replace(/^[-*•\s]+/, "").trim()).filter(Boolean).slice(0, 5).map((l) => l.slice(0, 300)),
    email_subject: String(form.get("email_subject") ?? "").trim().slice(0, 140), email_body: String(form.get("email_body") ?? "").trim().slice(0, 2500),
  };
  const { email_body, email_subject, ...rest } = cs;
  if (containsContactDetails(JSON.stringify(rest)) || containsContactDetails(email_subject)) return { error: NO_PERSONAL };
  if (!/reply 'no'/i.test(email_body)) return { error: "Keep the opt-out line in the email: Reply 'no' and I won't email again." };
  const [o] = await query<{ company_id: number }>(`UPDATE outcomes SET case_study = $2::jsonb WHERE id = $1 AND case_study IS NOT NULL RETURNING company_id`, [id, JSON.stringify(cs)]);
  if (o) paths(id, o.company_id);
}

// ---------- intervening ----------

/** Adds a task to check in with a client whose results are flat. One open check-in at a time. */
export async function createCheckInTask(form: FormData): Promise<{ error?: string } | void> {
  await requireLogin();
  const id = num(form, "id");
  const l = await loadOutcome(id);
  if (!l) return { error: "Outcome not found." };
  const title = `Check in with ${l.outcome.company_name}: results ${l.assessment.state === "slipping" ? "are slipping" : l.assessment.state === "flat" ? "are flat" : "need attention"}`;
  const [open] = await query<{ id: number }>(`SELECT id FROM tasks WHERE company_id = $1 AND done_at IS NULL AND title LIKE 'Check in with %' LIMIT 1`, [l.outcome.company_id]);
  if (open) return { error: "There is already an open check-in task for this client." };
  await query(`INSERT INTO tasks (title, due_at, company_id) VALUES ($1, (current_date + 1) + time '09:00', $2)`, [title, l.outcome.company_id]);
  await logActivity("outcome_checkin_task", { company_id: l.outcome.company_id, body: title });
  revalidatePath("/tasks"); revalidatePath("/");
}
