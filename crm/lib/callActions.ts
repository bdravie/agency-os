"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { query, tx } from "./db";
import { requireLogin } from "./auth";
import { logActivity } from "./activity";
import { MAX_CHARS, prepareTranscript } from "./transcript";
import { analyseTranscript } from "./callAnalysis";

const str = (f: FormData, k: string) => { const v = String(f.get(k) ?? "").trim(); return v === "" ? null : v; };
const num = (f: FormData, k: string) => Number(str(f, k) ?? 0) || 0;
const isDate = (s: string | null): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
const MAX_FILE = 2_000_000;

// ---- Saving a call ----

/** Saves a call (a transcript, a .vtt/.srt file, or pasted notes), masking contact details and speaker names first.
 *  With intent=analyse it also runs the AI analysis, which uses Claude credits. */
export async function createCall(_prev: string | null, form: FormData): Promise<string | null> {
  await requireLogin();
  const dealId = num(form, "deal_id") || null;
  let companyId = num(form, "company_id");
  if (dealId) { const [d] = await query<{ company_id: number | null }>(`SELECT company_id FROM deals WHERE id = $1`, [dealId]); if (!d?.company_id) return "That deal has no company."; companyId = d.company_id; }
  const [co] = await query<{ name: string }>(`SELECT name FROM companies WHERE id = $1`, [companyId]);
  if (!co) return "Choose a company or deal for this call.";

  const mode = str(form, "mode") ?? "paste";
  const file = form.get("file");
  let raw = "", filename: string | undefined;
  if (mode === "upload") {
    if (!(file instanceof File) || file.size === 0) return "Choose a transcript file (.vtt, .srt or .txt).";
    if (file.size > MAX_FILE) return "That file is over 2 MB. Trim it or split the call.";
    raw = await file.text(); filename = file.name;
  } else raw = String(form.get("text") ?? "");
  if (raw.trim().length < 20) return mode === "notes" ? "Write a few lines of notes first." : "There isn't enough text there to analyse.";

  const p = prepareTranscript(raw, { filename, asNotes: mode === "notes", anonymise: form.get("anonymise") === "on", ownName: process.env.SENDER_NAME ?? null });
  if (p.tooLong) return `That's over ${MAX_CHARS.toLocaleString("en-GB")} characters. Trim it or split the call.`;
  const on = str(form, "occurred_on");
  const day = isDate(on) ? on : new Date().toISOString().slice(0, 10);
  const title = str(form, "title")?.slice(0, 200) ?? `Call with ${co.name}`;

  const [call] = await query<{ id: number }>(
    `INSERT INTO calls (company_id, deal_id, title, occurred_at, source, transcript, transcript_chars) VALUES ($1,$2,$3,($4::date + time '12:00')::timestamptz,$5,$6,$7) RETURNING id`,
    [companyId, dealId, title, day, p.source, p.text, p.chars]);
  await logActivity("call_logged", { company_id: companyId, deal_id: dealId, channel: "call", body: title });
  revalidatePath("/calls");
  let note = p.masked ? `${p.masked} email address${p.masked === 1 ? "" : "es"} or phone number${p.masked === 1 ? "" : "s"} masked.` : "";
  if (str(form, "intent") === "analyse") {
    const r = await runAnalysis(call.id);
    if (r.error) note = `Saved, but the analysis didn't run: ${r.error}`;
  }
  redirect(`/calls/${call.id}${note ? `?note=${encodeURIComponent(note)}` : ""}`);
}

// ---- The AI analysis (uses Claude credits: only runs when you click) ----

async function runAnalysis(callId: number): Promise<{ error?: string; note?: string }> {
  const cap = Number(process.env.CALLS_DAILY_CAP ?? 20) || 20;
  const [{ n }] = await query<{ n: string }>(`SELECT count(*) AS n FROM activities WHERE type = 'call_analysed' AND occurred_at::date = current_date`);
  if (Number(n) >= cap) return { error: `Daily cap of ${cap} AI analyses reached. Try again tomorrow, or edit the call by hand.` };
  const [call] = await query<any>(
    `SELECT c.*, to_char(c.occurred_at, 'YYYY-MM-DD') AS day, co.name AS company_name FROM calls c JOIN companies co ON co.id = c.company_id WHERE c.id = $1`, [callId]);
  if (!call) return { error: "Call not found." };
  if (!call.transcript) return { error: "The transcript was removed, so there's nothing to analyse. Upload it again as a new call." };
  const library = (await query<{ name: string }>(`SELECT name FROM objections ORDER BY name`)).map((o) => o.name);

  let result;
  try {
    result = await analyseTranscript({ transcript: call.transcript, source: call.source, library, callDate: call.day, client: call.company_name });
  } catch (err) {
    await query(`UPDATE calls SET status = CASE WHEN status = 'analysed' THEN status ELSE 'failed' END WHERE id = $1`, [callId]);
    return { error: err instanceof Error ? err.message : String(err) };
  }
  const { analysis: a, followUp, model, droppedQuotes } = result;

  await tx(async (c) => {
    // Objections: reuse library entries, create new ones, and replace this call's list (a re-analysis starts fresh).
    await c.query(`DELETE FROM call_objections WHERE call_id = $1`, [callId]);
    for (const o of a.objections) {
      const { rows: [row] } = await c.query(
        `INSERT INTO objections (name) VALUES ($1) ON CONFLICT (lower(name)) DO UPDATE SET name = objections.name RETURNING id`, [o.name]);
      await c.query(`INSERT INTO call_objections (call_id, objection_id, quote) VALUES ($1,$2,$3) ON CONFLICT (call_id, objection_id) DO NOTHING`, [callId, row.id, o.quote]);
    }
    // The follow-up task: updated in place if it is still open, otherwise created.
    const title = (a.next_step ? `Follow up: ${a.next_step}` : `Follow up after call: ${call.title}`).slice(0, 160);
    let taskId: number | null = null;
    if (call.follow_up_task_id) {
      const { rows } = await c.query(`UPDATE tasks SET title = $2, due_at = ($3::date + time '09:00')::timestamptz WHERE id = $1 AND done_at IS NULL RETURNING id`, [call.follow_up_task_id, title, followUp.date]);
      taskId = rows[0]?.id ?? null;
    }
    if (taskId === null) {
      const { rows: [t] } = await c.query(`INSERT INTO tasks (title, due_at, company_id, deal_id) VALUES ($1, ($2::date + time '09:00')::timestamptz, $3, $4) RETURNING id`, [title, followUp.date, call.company_id, call.deal_id]);
      taskId = t.id;
    }
    await c.query(
      `UPDATE calls SET summary = $2, pains = $3::jsonb, budget_signals = $4::jsonb, next_step = $5, follow_up_on = $6, follow_up_assumed = $7, follow_up_task_id = $8,
              status = 'analysed', analysed_at = now(), analysis_model = $9 WHERE id = $1`,
      [callId, a.summary, JSON.stringify(a.pains), JSON.stringify(a.budget_signals), a.next_step, followUp.date, followUp.assumed, taskId, model]);
  });
  await logActivity("call_analysed", { company_id: call.company_id, deal_id: call.deal_id, channel: "call", body: `${call.title}: ${a.objections.length} objection(s),  follow-up ${followUp.date}${followUp.assumed ? " (assumed)" : ""}, ${model}` });
  for (const p of ["/calls", `/calls/${callId}`, "/objections", "/tasks", "/"]) revalidatePath(p);
  return { note: droppedQuotes > 0 ? `${droppedQuotes} quote${droppedQuotes === 1 ? " was" : "s were"} left out because they weren't word for word in the transcript.` : undefined };
}

export async function analyseCallAction(callId: number): Promise<{ error?: string; note?: string }> {
  await requireLogin();
  return runAnalysis(callId);
}

// ---- Editing a call ----

export async function saveCallEdits(form: FormData): Promise<{ error?: string } | void> {
  await requireLogin();
  const id = num(form, "id");
  const summary = str(form, "summary"), next = str(form, "next_step"), day = str(form, "follow_up_on");
  if (day && !isDate(day)) return { error: "Use a valid follow-up date." };
  const [call] = await query<any>(`SELECT follow_up_task_id, follow_up_on::text AS follow_up_on, title FROM calls WHERE id = $1`, [id]);
  if (!call) return { error: "Call not found." };
  const changedDate = day !== call.follow_up_on;
  await query(`UPDATE calls SET summary = $2, next_step = $3, follow_up_on = $4, follow_up_assumed = CASE WHEN $5::boolean THEN false ELSE follow_up_assumed END WHERE id = $1`, [id, summary?.slice(0, 1200) ?? null, next?.slice(0, 300) ?? null, day, changedDate]);
  if (call.follow_up_task_id && day) {
    await query(`UPDATE tasks SET title = $2, due_at = ($3::date + time '09:00')::timestamptz WHERE id = $1 AND done_at IS NULL`, [call.follow_up_task_id, (next ? `Follow up: ${next}` : `Follow up after call: ${call.title}`).slice(0, 160), day]);
  }
  revalidatePath(`/calls/${id}`);
  revalidatePath("/tasks");
}

export async function addCallObjection(form: FormData): Promise<{ error?: string } | void> {
  await requireLogin();
  const callId = num(form, "call_id"), name = str(form, "name")?.slice(0, 80);
  if (!name) return { error: "Name the objection." };
  await tx(async (c) => {
    const { rows: [o] } = await c.query(`INSERT INTO objections (name) VALUES ($1) ON CONFLICT (lower(name)) DO UPDATE SET name = objections.name RETURNING id`, [name]);
    await c.query(`INSERT INTO call_objections (call_id, objection_id, quote) VALUES ($1,$2,$3) ON CONFLICT (call_id, objection_id) DO NOTHING`, [callId, o.id, str(form, "quote")?.slice(0, 400) ?? null]);
  });
  revalidatePath(`/calls/${callId}`);
  revalidatePath("/objections");
}

export async function removeCallObjection(form: FormData) {
  await requireLogin();
  const [r] = await query<{ call_id: number }>(`DELETE FROM call_objections WHERE id = $1 RETURNING call_id`, [num(form, "id")]);
  if (r) { revalidatePath(`/calls/${r.call_id}`); revalidatePath("/objections"); }
}

/** Remove the transcript text but keep the analysis: for privacy, once you have what you need. */
export async function purgeTranscript(form: FormData) {
  await requireLogin();
  const id = num(form, "id");
  await query(`UPDATE calls SET transcript = NULL WHERE id = $1`, [id]);
  revalidatePath(`/calls/${id}`);
}

/** Delete a call completely (its transcript, analysis and objection mentions). The follow-up task is left alone. */
export async function deleteCall(form: FormData) {
  await requireLogin();
  const id = num(form, "id");
  const [c] = await query<{ deal_id: number | null; company_id: number }>(`DELETE FROM calls WHERE id = $1 RETURNING deal_id, company_id`, [id]);
  revalidatePath("/calls"); revalidatePath("/objections");
  redirect(c?.deal_id ? `/deals/${c.deal_id}` : "/calls");
}

// ---- The Objection Library ----

export async function saveObjection(form: FormData): Promise<{ error?: string } | void> {
  await requireLogin();
  const name = str(form, "name")?.slice(0, 80);
  if (!name) return { error: "An objection needs a name." };
  try {
    await query(`UPDATE objections SET name = $2, best_response = $3 WHERE id = $1`, [num(form, "id"), name, str(form, "best_response")?.slice(0, 3000) ?? null]);
  } catch (err) {
    if (String(err).includes("objections_name_uniq")) return { error: "Another objection already has that name. Use Merge to combine them." };
    throw err;
  }
  revalidatePath("/objections");
}

export async function addObjection(form: FormData): Promise<{ error?: string } | void> {
  await requireLogin();
  const name = str(form, "name")?.slice(0, 80);
  if (!name) return { error: "Name the objection." };
  await query(`INSERT INTO objections (name, best_response) VALUES ($1,$2) ON CONFLICT (lower(name)) DO NOTHING`, [name, str(form, "best_response")?.slice(0, 3000) ?? null]);
  revalidatePath("/objections");
}

/** Combine two entries: every mention moves to the one you keep, and the other is deleted. */
export async function mergeObjection(form: FormData): Promise<{ error?: string } | void> {
  await requireLogin();
  const from = num(form, "from_id"), into = num(form, "into_id");
  if (!into || from === into) return { error: "Choose a different objection to merge into." };
  await tx(async (c) => {
    // Where a call already has the target, drop the duplicate instead of violating the one-per-call rule.
    await c.query(`DELETE FROM call_objections a USING call_objections b WHERE a.objection_id = $1 AND b.objection_id = $2 AND a.call_id = b.call_id`, [from, into]);
    await c.query(`UPDATE call_objections SET objection_id = $2 WHERE objection_id = $1`, [from, into]);
    // Keep the better-written response: the target's if it has one, otherwise the merged entry's.
    await c.query(`UPDATE objections t SET best_response = COALESCE(t.best_response, f.best_response) FROM objections f WHERE t.id = $2 AND f.id = $1`, [from, into]);
    await c.query(`DELETE FROM objections WHERE id = $1`, [from]);
  });
  revalidatePath("/objections");
}
