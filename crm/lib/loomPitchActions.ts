"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireLogin } from "./auth";
import { logActivity } from "./activity";
import { containsContactDetails } from "./audit";
import { query } from "./db";
import { buildLoomPitch, rewriteSection } from "./loomPitch";
import { cleanEdit, cleanLoomUrl, SECTIONS, type LoomInputs, type LoomPitch, type Section } from "./loomPitchMath";
import { loadPitchContext } from "./pitchLibrary";
import { analyseFit } from "./proposalPlan";
import { proposalName, titleFromJob } from "./proposalName";
import { cleanName } from "./upworkPackMath";

const val = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const NOTHING: LoomInputs = { budget: "", screening_questions: [], client_name: "", client_info: "" };

/** What was typed beside the job post. A first name stays on the proposal and is never made into a contact. */
function readInputs(f: FormData): { inputs: LoomInputs; error?: string } {
  const inputs: LoomInputs = {
    budget: val(f, "budget").slice(0, 200),
    screening_questions: val(f, "screening_questions").split("\n").map((q) => q.trim()).filter(Boolean).slice(0, 15).map((q) => q.slice(0, 500)),
    client_name: cleanName(val(f, "client_name")) ?? "",
    client_info: val(f, "client_info").slice(0, 4000),
  };
  if (containsContactDetails(`${inputs.client_info} ${inputs.budget}`)) return { inputs, error: "Leave email addresses and phone numbers out of the client info." };
  return { inputs };
}

async function markUsed(pitch: Partial<LoomPitch>) {
  const ids = (pitch.screening_answers ?? []).filter((a) => a.source === "bank" && a.bank_id).map((a) => a.bank_id);
  if (ids.length) await query(`UPDATE answer_bank SET last_used_at = now() WHERE id = ANY($1::bigint[])`, [ids]);
}

/** A new proposal in Loom pitch mode. Scored like any other proposal, then one click writes the whole pitch. Nothing is sent. */
export async function createLoomPitch(_prev: string | null, form: FormData): Promise<string | null> {
  await requireLogin();
  const job = val(form, "job_text");
  if (job.length < 40) return "Paste the full job post (at least a few sentences).";
  if (job.length > 20000) return "That job post is too long.";
  const { inputs, error } = readInputs(form);
  if (error) return error;
  let id: number;
  try {
    const fit = await analyseFit(job);
    if (fit.score < 6 && form.get("force") !== "on") return `Fit score ${fit.score}/10: ${fit.summary} Risks: ${fit.risks.join(" ")} Tick "Draft anyway" to write it regardless.`;
    const pitch = await buildLoomPitch(await loadPitchContext(job, inputs));
    const title = val(form, "job_title") || titleFromJob(job);
    const company = val(form, "company_name") || null;
    const rows = await query<{ id: number }>(
      `INSERT INTO proposals (job_title, company_name, job_url, job_text, fit_score, fit_analysis, status, pitch_mode, loom_inputs, loom_pitch, loom_pitch_at)
       VALUES ($1,$2,$3,$4,$5,$6,'Draft','loom',$7,$8,now()) RETURNING id`,
      [title, company, val(form, "job_url") || null, job, fit.score, JSON.stringify(fit), JSON.stringify(inputs), JSON.stringify(pitch)]);
    id = rows[0].id;
    await markUsed(pitch);
    await logActivity("proposal_loom_pitch", { channel: "upwork", body: `Loom pitch: ${proposalName({ id, job_title: title, company_name: company })}` });
  } catch (err) {
    return `Something went wrong: ${err instanceof Error ? err.message : String(err)}`;
  }
  redirect(`/proposals/${id}#loom-pitch`);
}

/** Click-only: writes the whole Loom pitch for a saved proposal, replacing any earlier one. */
export async function generateLoomPitchAction(_prev: string | null, form: FormData): Promise<string | null> {
  await requireLogin();
  const id = Number(val(form, "id"));
  const { inputs, error } = readInputs(form);
  if (error) return error;
  const [p] = await query<{ job_text: string }>(`SELECT job_text FROM proposals WHERE id = $1`, [id]);
  if (!p) return "Proposal not found.";
  try {
    const pitch = await buildLoomPitch(await loadPitchContext(p.job_text, inputs));
    await query(`UPDATE proposals SET pitch_mode = 'loom', loom_inputs = $2, loom_pitch = $3, loom_pitch_at = now() WHERE id = $1`, [id, JSON.stringify(inputs), JSON.stringify(pitch)]);
    await markUsed(pitch);
    await logActivity("proposal_loom_pitch", { channel: "upwork", body: `Loom pitch for proposal #${id}` });
  } catch (err) {
    return `Something went wrong: ${err instanceof Error ? err.message : String(err)}`;
  }
  revalidatePath(`/proposals/${id}`);
  revalidatePath("/proposals");
  return null;
}

const parseSection = (raw: string): Section | null => ((SECTIONS as readonly string[]).includes(raw) ? (raw as Section) : null);

/** Click-only: one section again. The other sections, and the owner's edits to them, stay as they are. */
export async function regenerateLoomSectionAction(form: FormData): Promise<{ error?: string }> {
  await requireLogin();
  const id = Number(val(form, "id")), section = parseSection(val(form, "section"));
  if (!section) return { error: "That section is not known." };
  const [p] = await query<any>(`SELECT job_text, loom_inputs, loom_pitch FROM proposals WHERE id = $1`, [id]);
  if (!p?.loom_pitch) return { error: "Write the pitch first." };
  try {
    const changed = await rewriteSection(await loadPitchContext(p.job_text, p.loom_inputs ?? NOTHING), p.loom_pitch, section);
    await query(`UPDATE proposals SET loom_pitch = loom_pitch || $2::jsonb, loom_pitch_at = now() WHERE id = $1`, [id, JSON.stringify(changed)]);
    await markUsed(changed);
    await logActivity("proposal_loom_pitch", { channel: "upwork", body: `Loom pitch section rewritten (${section}) for proposal #${id}` });
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
  revalidatePath(`/proposals/${id}`);
  return {};
}

/** The owner's own edit to one section. Never sent to the AI until they click something that reads it. */
export async function saveLoomSectionAction(form: FormData): Promise<{ error?: string }> {
  await requireLogin();
  const id = Number(val(form, "id")), section = parseSection(val(form, "section"));
  if (!section) return { error: "That section is not known." };
  const [p] = await query<any>(`SELECT loom_pitch FROM proposals WHERE id = $1`, [id]);
  if (!p?.loom_pitch) return { error: "Write the pitch first." };
  let raw: unknown;
  try { raw = JSON.parse(String(form.get("value") ?? "null")); } catch { return { error: "That could not be read." }; }
  const edit = cleanEdit(section, raw, p.loom_pitch);
  if (edit.error) return { error: edit.error };
  await query(`UPDATE proposals SET loom_pitch = jsonb_set(loom_pitch, $2::text[], $3::jsonb) WHERE id = $1`, [id, [section], JSON.stringify(edit.value)]);
  revalidatePath(`/proposals/${id}`);
  return {};
}

/** Pasting the link says the Loom is recorded, which clears it from the Proposals number. Clearing the link takes that back. */
export async function saveLoomUrlAction(form: FormData): Promise<{ error?: string }> {
  await requireLogin();
  const id = Number(val(form, "id")), raw = val(form, "loom_url");
  const url = raw ? cleanLoomUrl(raw) : null;
  if (raw && !url) return { error: "That isn't a Loom share link. It should look like https://www.loom.com/share/..." };
  const rows = await query(
    `UPDATE proposals SET loom_url = $2, loom_recorded_at = CASE WHEN $2::text IS NULL THEN NULL ELSE COALESCE(loom_recorded_at, now()) END WHERE id = $1 RETURNING id`, [id, url]);
  if (!rows.length) return { error: "Proposal not found." };
  await logActivity("proposal_loom", { channel: "upwork", body: `${url ? "Loom link added" : "Loom link removed"} for proposal #${id}` });
  revalidatePath(`/proposals/${id}`);
  revalidatePath("/proposals");
  return {};
}

/** Saves a new screening answer for next time, and marks it in this pitch as coming from the bank. */
export async function saveAnswerToBankAction(form: FormData): Promise<{ error?: string }> {
  await requireLogin();
  const id = Number(val(form, "id")), index = Number(val(form, "index"));
  const question = val(form, "question"), answer = val(form, "answer"), category = val(form, "category") || "custom";
  if (!question || !answer) return { error: "Write the answer first." };
  if (answer.length > 3000) return { error: "Keep the answer to 3,000 characters." };
  if (containsContactDetails(`${question} ${answer}`)) return { error: "Leave email addresses and phone numbers out of the bank." };
  const [row] = await query<{ id: number }>(`INSERT INTO answer_bank (category, question, answer, last_used_at) VALUES ($1,$2,$3,now()) RETURNING id::int AS id`, [category, question.slice(0, 500), answer]);
  await query(
    `UPDATE proposals SET loom_pitch = jsonb_set(jsonb_set(jsonb_set(loom_pitch, ARRAY['screening_answers', $2::text, 'source'], '"bank"'), ARRAY['screening_answers', $2::text, 'bank_id'], $3::jsonb), ARRAY['screening_answers', $2::text, 'answer'], $4::jsonb) WHERE id = $1`,
    [id, String(index), String(row.id), JSON.stringify(answer)]);
  revalidatePath(`/proposals/${id}`);
  revalidatePath("/proposals/library");
  return {};
}
