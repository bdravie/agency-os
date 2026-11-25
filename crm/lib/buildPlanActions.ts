"use server";

// The Build Plan pipeline's actions. Each runs one step for one proposal, only when the owner clicks, and saves it as its own
// part of proposals.build_plan so a step can be run again or edited without touching the others. Nothing is sent anywhere.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireLogin } from "./auth";
import { logActivity } from "./activity";
import { containsContactDetails } from "./audit";
import { query } from "./db";
import { extractPains, findMatches, loadCases, loadPicked, writeDemo, writePlan } from "./buildPlan";
import { chosenPain, cleanDemoEdit, cleanPainsEdit, cleanPicked, cleanPlanEdit, painBasis, STEP_LABELS, type BuildPlan, type Picked, type StepKey } from "./buildPlanMath";
import { cleanPageEdit } from "./buildPlanPageMath";
import { templateDailyCap } from "./n8nTemplates";
import { cleanSearches, templateIdFromUrl } from "./n8nTemplatesMath";
import { analyseFit } from "./proposalPlan";
import { clientPageTitle, proposalName, titleFromJob } from "./proposalName";
import { cleanParsed, type ParsedWorkflow } from "./workflowParse";

export type StepResult = { error?: string; picked?: boolean };

const val = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const commas = (s: string) => [...new Set(s.split(",").map((t) => t.trim().slice(0, 40)).filter(Boolean))].slice(0, 12);
const message = (err: unknown) => (err instanceof Error ? err.message : String(err));
const now = () => new Date().toISOString();
const LIBRARY = "/proposals/library";

async function load(id: number): Promise<{ job: string; title: string | null; bp: BuildPlan } | null> {
  if (!Number.isInteger(id)) return null;
  const [p] = await query<{ job_text: string | null; job_title: string | null; build_plan: BuildPlan | null }>(`SELECT job_text, job_title, build_plan FROM proposals WHERE id = $1`, [id]);
  return p ? { job: p.job_text ?? "", title: p.job_title, bp: p.build_plan ?? {} } : null;
}

/** Saves one or more parts, leaving the others as they are. */
async function save(id: number, patch: Partial<BuildPlan>) {
  await query(`UPDATE proposals SET build_plan = COALESCE(build_plan, '{}'::jsonb) || $2::jsonb, build_plan_at = now() WHERE id = $1`, [id, JSON.stringify(patch)]);
  revalidatePath(`/proposals/${id}`);
}

const logged = (id: number, step: StepKey, requests = 0) =>
  logActivity("proposal_build_plan", { channel: "upwork", body: `Build plan (${STEP_LABELS[step].toLowerCase()}) for proposal #${id}`, meta: { proposal_id: id, step, n8n_requests: requests } });

/** How many more calls to n8n's library today's limit allows. */
async function n8nAllowance(): Promise<number> {
  const [{ n }] = await query<{ n: string }>(
    `SELECT COALESCE(sum((meta->>'n8n_requests')::int), 0) AS n FROM activities WHERE type = 'proposal_build_plan' AND occurred_at::date = current_date AND meta ? 'n8n_requests'`);
  return Math.max(0, templateDailyCap() - Number(n));
}

/** A new proposal that starts on the Build plan tab. Scored like any other; the pipeline then runs on that page, a step at a time. */
export async function createBuildPlan(_prev: string | null, form: FormData): Promise<string | null> {
  await requireLogin();
  const job = val(form, "job_text");
  if (job.length < 40) return "Paste the full job post (at least a few sentences).";
  if (job.length > 20000) return "That job post is too long.";
  let id: number;
  try {
    const fit = await analyseFit(job);
    if (fit.score < 6 && form.get("force") !== "on") return `Fit score ${fit.score}/10: ${fit.summary} Risks: ${fit.risks.join(" ")} Tick "Draft anyway" to plan it regardless.`;
    const title = val(form, "job_title") || titleFromJob(job), company = val(form, "company_name") || null;
    const rows = await query<{ id: number }>(
      `INSERT INTO proposals (job_title, company_name, job_url, job_text, fit_score, fit_analysis, status, pitch_mode) VALUES ($1,$2,$3,$4,$5,$6,'Draft','build_plan') RETURNING id`,
      [title, company, val(form, "job_url") || null, job, fit.score, JSON.stringify(fit)]);
    id = rows[0].id;
    await logActivity("proposal_drafted", { channel: "upwork", body: `Build plan started: ${proposalName({ id, job_title: title, company_name: company })}` });
  } catch (err) {
    return `Something went wrong: ${message(err)}`;
  }
  revalidatePath("/proposals");
  redirect(`/proposals/${id}?tab=build&run=1`);
}

/** Step 1, click-only: the pain points in the job post, ranked, with the top one taken as the angle. */
export async function runPainsAction(form: FormData): Promise<StepResult> {
  await requireLogin();
  const id = Number(val(form, "id")), p = await load(id);
  if (!p) return { error: "Proposal not found." };
  if (p.job.length < 40) return { error: "This proposal has no job post saved. Add it under Draft > Edit details first." };
  try {
    await save(id, { pains: { ...(await extractPains(p.job)), at: now() } });
    await logged(id, "pains");
  } catch (err) {
    return { error: message(err) };
  }
  return {};
}

/** The owner's own pick of angle, wording and search words. */
export async function savePainsAction(form: FormData): Promise<StepResult> {
  await requireLogin();
  const id = Number(val(form, "id")), p = await load(id);
  if (!p?.bp.pains) return { error: "Find the pain points first." };
  let raw: unknown;
  try { raw = JSON.parse(String(form.get("value") ?? "null")); } catch { return { error: "That could not be read." }; }
  const edit = cleanPainsEdit(raw, p.bp.pains);
  if (!edit.value) return { error: edit.error };
  await save(id, { pains: edit.value });
  return {};
}

/** Step 2, click-only: search n8n's library and the owner's own for workflows that solve the chosen pain point. With `auto`, the top match is taken straight away. */
export async function runMatchesAction(form: FormData): Promise<StepResult> {
  await requireLogin();
  const id = Number(val(form, "id")), p = await load(id), pain = chosenPain(p?.bp);
  if (!p || !pain) return { error: "Find the pain points first." };
  try {
    // Search words typed on the page are saved with the pain points, so the next search starts from them.
    const typed = form.has("search") ? cleanSearches(val(form, "search").split(",")) : [];
    const search = typed.length ? typed : p.bp.pains!.search;
    const allowance = await n8nAllowance();
    const { step, requests } = await findMatches(p.job, pain, search, painBasis(p.bp), allowance);
    let workflow: Picked | undefined, spent = requests;
    if (val(form, "auto") === "1" && step.matches[0] && (step.matches[0].source === "library" || allowance - requests > 0)) {
      try {
        const got = await loadPicked(step.matches[0].ref);
        workflow = got.picked; spent += got.requests;
      } catch (err) {
        step.notes.push(`The top match could not be opened (${message(err)}). Pick another.`);
      }
    }
    await save(id, { matches: { ...step, at: now() }, ...(workflow ? { workflow } : {}), ...(typed.length ? { pains: { ...p.bp.pains!, search } } : {}) });
    await logged(id, "matches", spent);
    return { picked: !!workflow };
  } catch (err) {
    return { error: message(err) };
  }
}

/** The owner picks one of the matches. An n8n template is read once into an outline. */
export async function pickWorkflowAction(form: FormData): Promise<StepResult> {
  await requireLogin();
  const id = Number(val(form, "id")), ref = val(form, "ref"), p = await load(id);
  if (!p) return { error: "Proposal not found." };
  try {
    if (ref.startsWith("n8n:") && (await n8nAllowance()) < 1) return { error: `Today's limit of ${templateDailyCap()} n8n lookups is reached. Paste the template's JSON instead, or try tomorrow.` };
    const got = await loadPicked(ref);
    await save(id, { workflow: got.picked });
    if (got.requests) await logged(id, "matches", got.requests);
  } catch (err) {
    return { error: message(err) };
  }
  return { picked: true };
}

async function addToLibrary(name: string, solves: string, tags: string[], workflow: ParsedWorkflow): Promise<{ id?: number; error?: string }> {
  if (!name || name.length > 120) return { error: "Give the workflow a name of up to 120 characters." };
  if (solves.length > 300) return { error: "Keep the problem it solves to 300 characters." };
  if (containsContactDetails(`${name} ${solves} ${tags.join(" ")}`)) return { error: "Leave email addresses and phone numbers out of the library." };
  try {
    const [row] = await query<{ id: number }>(
      `INSERT INTO workflow_library (name, platform, solves, tags, apps, workflow) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id::int AS id`,
      [name, workflow.platform, solves || null, tags, workflow.apps, JSON.stringify(workflow)]);
    return { id: row.id };
  } catch (err) {
    if ((err as { code?: string }).code === "23505") return { error: "You already have a workflow with that name in your library." };
    throw err;
  }
}

/**
 * A workflow the owner brings themselves: a link to an n8n template, or a file's outline. The file is read in the browser, so only
 * the outline (step names, apps, connections) ever reaches the server, and it is tidied again here. Ticking "I have run this" is what
 * lets it be presented as a workflow the owner uses; saving it to the library keeps it for next time.
 */
export async function pasteWorkflowAction(form: FormData): Promise<StepResult> {
  await requireLogin();
  const id = Number(val(form, "id")), p = await load(id);
  if (!p) return { error: "Proposal not found." };
  const link = val(form, "url");
  try {
    if (link) {
      const template = templateIdFromUrl(link);
      if (!template) return { error: "That isn't a link to an n8n template. It should look like https://n8n.io/workflows/1234-name, or paste the workflow's JSON instead." };
      if ((await n8nAllowance()) < 1) return { error: `Today's limit of ${templateDailyCap()} n8n lookups is reached. Paste the template's JSON instead.` };
      const got = await loadPicked(`n8n:${template}`);
      await save(id, { workflow: got.picked });
      if (got.requests) await logged(id, "matches", got.requests);
      return { picked: true };
    }
    let outline: unknown;
    try { outline = JSON.parse(String(form.get("outline") ?? "null")); } catch { return { error: "That could not be read." }; }
    const workflow = cleanParsed(outline);
    if (!workflow) return { error: "That workflow could not be read. Paste the whole exported file." };
    const own = form.get("own") === "on", name = val(form, "name").slice(0, 120) || workflow.name || "Pasted workflow";
    let picked: Picked = { ref: `pasted:${Date.now().toString(36)}`, source: "pasted", own, name, url: null, workflow };
    if (own && form.get("keep") === "on") {
      const added = await addToLibrary(name, val(form, "solves"), commas(val(form, "tags")), workflow);
      if (!added.id) return { error: added.error };
      picked = { ...picked, ref: `lib:${added.id}`, source: "library" };
      revalidatePath(LIBRARY);
    }
    await save(id, { workflow: picked });
  } catch (err) {
    return { error: message(err) };
  }
  return { picked: true };
}

/** Plan without a pattern workflow: clears the choice, so the tailored plan is written from the job post alone. */
export async function clearWorkflowAction(form: FormData): Promise<StepResult> {
  await requireLogin();
  const id = Number(val(form, "id"));
  if (!(await load(id))) return { error: "Proposal not found." };
  await save(id, { workflow: null });
  return {};
}

/** Step 3, click-only: the walkthrough of the chosen workflow, and a case study if one of the owner's really matches. */
export async function runDemoAction(form: FormData): Promise<StepResult> {
  await requireLogin();
  const id = Number(val(form, "id")), p = await load(id), pain = chosenPain(p?.bp), picked = cleanPicked(p?.bp.workflow);
  if (!p || !pain) return { error: "Find the pain points first." };
  if (!picked) return { error: "Choose a workflow first." };
  try {
    await save(id, { demo: { ...(await writeDemo(p.job, pain, picked, painBasis(p.bp))), at: now() } });
    await logged(id, "demo");
  } catch (err) {
    return { error: message(err) };
  }
  return {};
}

export async function saveDemoAction(form: FormData): Promise<StepResult> {
  await requireLogin();
  const id = Number(val(form, "id")), p = await load(id), picked = cleanPicked(p?.bp.workflow);
  if (!p?.bp.demo || !picked) return { error: "Write the demo first." };
  let raw: unknown;
  try { raw = JSON.parse(String(form.get("value") ?? "null")); } catch { return { error: "That could not be read." }; }
  const edit = cleanDemoEdit(raw, p.bp.demo, picked, await loadCases());
  if (!edit.value) return { error: edit.error };
  await save(id, { demo: edit.value });
  return {};
}

/** Step 4, click-only: the plan written for this client. Works with or without a chosen workflow. */
export async function runPlanAction(form: FormData): Promise<StepResult> {
  await requireLogin();
  const id = Number(val(form, "id")), p = await load(id), pain = chosenPain(p?.bp);
  if (!p || !pain) return { error: "Find the pain points first." };
  try {
    await save(id, { plan: { ...(await writePlan(p.job, pain, cleanPicked(p.bp.workflow), painBasis(p.bp))), at: now() } });
    await logged(id, "plan");
  } catch (err) {
    return { error: message(err) };
  }
  return {};
}

export async function savePlanAction(form: FormData): Promise<StepResult> {
  await requireLogin();
  const id = Number(val(form, "id")), p = await load(id);
  if (!p?.bp.plan) return { error: "Write the plan first." };
  let raw: unknown;
  try { raw = JSON.parse(String(form.get("value") ?? "null")); } catch { return { error: "That could not be read." }; }
  const edit = cleanPlanEdit(raw, p.bp.plan);
  if (!edit.value) return { error: edit.error };
  await save(id, { plan: edit.value });
  return {};
}

/**
 * The owner's edit of the client page (/proposals/[id]/build-plan?edit=1): their own words, saved only on their click. Step and list
 * text goes into the plan itself, so the application text follows; the page's own words (title, who it is for, opening and closing
 * lines, the problem in their wording) are kept beside it. No AI runs and nothing is sent.
 */
export async function saveClientPageAction(form: FormData): Promise<StepResult> {
  await requireLogin();
  const id = Number(val(form, "id")), p = await load(id);
  if (!p) return { error: "Proposal not found." };
  let raw: unknown;
  try { raw = JSON.parse(String(form.get("value") ?? "null")); } catch { return { error: "That could not be read." }; }
  const edit = cleanPageEdit(raw, p.bp, clientPageTitle(p.title, p.job));
  if (!edit.value) return { error: edit.error };
  await save(id, { plan: edit.value.plan, page: { ...edit.value.page, at: now() } });
  revalidatePath(`/proposals/${id}/build-plan`);
  return {};
}

// ---------- The owner's workflow library (Proposals > Proof and answers) ----------

/** Adds an uploaded workflow to the library. The file was read in the browser; only its outline arrives here. */
export async function addLibraryWorkflowAction(form: FormData): Promise<{ error?: string }> {
  await requireLogin();
  let outline: unknown;
  try { outline = JSON.parse(String(form.get("outline") ?? "null")); } catch { return { error: "That could not be read." }; }
  const workflow = cleanParsed(outline);
  if (!workflow) return { error: "Choose an n8n workflow file or a Make blueprint first." };
  const added = await addToLibrary(val(form, "name") || workflow.name, val(form, "solves"), commas(val(form, "tags")), workflow);
  if (!added.id) return { error: added.error };
  revalidatePath(LIBRARY);
  return {};
}

export async function saveLibraryWorkflowAction(form: FormData): Promise<{ error?: string }> {
  await requireLogin();
  const id = Number(val(form, "id")), name = val(form, "name"), solves = val(form, "solves"), tags = commas(val(form, "tags"));
  if (!name || name.length > 120) return { error: "Give the workflow a name of up to 120 characters." };
  if (solves.length > 300) return { error: "Keep the problem it solves to 300 characters." };
  if (containsContactDetails(`${name} ${solves} ${tags.join(" ")}`)) return { error: "Leave email addresses and phone numbers out of the library." };
  try {
    await query(`UPDATE workflow_library SET name = $2, solves = $3, tags = $4 WHERE id = $1`, [id, name, solves || null, tags]);
  } catch (err) {
    if ((err as { code?: string }).code === "23505") return { error: "You already have a workflow with that name in your library." };
    throw err;
  }
  revalidatePath(LIBRARY);
  return {};
}

export async function deleteLibraryWorkflowAction(form: FormData): Promise<{ error?: string }> {
  await requireLogin();
  await query(`DELETE FROM workflow_library WHERE id = $1`, [Number(val(form, "id"))]);
  revalidatePath(LIBRARY);
  return {};
}
