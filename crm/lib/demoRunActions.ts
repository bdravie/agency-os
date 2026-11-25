"use server";

// Run a demo from a proposal (the Run a demo tab). Only on the owner's click, only a demo listed in config/demos.yaml, and only its
// free demo version: fake data, no AI calls, nothing sent. What it printed comes back to the screen; nothing is saved but the activity.
import { requireLogin } from "./auth";
import { logActivity } from "./activity";
import { query } from "./db";
import { demoServing, loadRecipes, runSteps, startServing, stopServing, type Serving } from "./demoRun";
import { scrub } from "./launch";
import { pushDemo } from "./n8nPush";
import { pushSummary, type PushResult } from "./n8nPushMath";

export type DemoRunResult = { error?: string; ok?: boolean; output?: string; seconds?: number; serving?: Serving | null };

export async function runDemoAction(form: FormData): Promise<DemoRunResult> {
  await requireLogin();
  const id = Number(form.get("id")), folder = String(form.get("folder") ?? "");
  if (!Number.isInteger(id) || !(await query(`SELECT 1 FROM proposals WHERE id = $1`, [id])).length) return { error: "Proposal not found." };
  const recipe = (await loadRecipes()).recipes.find((r) => r.folder === folder);
  if (!recipe) return { error: "That demo is not set up to run from here. Add it to config/demos.yaml." };
  const started = Date.now();
  try {
    const steps = await runSteps(recipe);
    let output = steps.output, error: string | undefined;
    if (steps.ok && recipe.serve) {
      const page = await startServing(recipe);
      output = [output, page.output].filter(Boolean).join("\n\n");
      error = page.error;
    } else if (!steps.ok) error = "It stopped with an error. What it printed is below.";
    await logActivity("proposal_demo_run", { channel: "upwork", body: `Demo run for proposal #${id}: ${recipe.title}`, meta: { proposal_id: id, demo: recipe.folder, ok: !error } });
    return { ok: !error, error, output: scrub(output), seconds: Math.round((Date.now() - started) / 100) / 10, serving: demoServing() };
  } catch (err) {
    return { error: scrub(err instanceof Error ? err.message : String(err)), serving: demoServing() };
  }
}

/** Stops the demo page that is up. */
export async function stopDemoAction(): Promise<DemoRunResult> {
  await requireLogin();
  await stopServing();
  return { serving: null };
}

export type N8nSendResult = { error?: string; summary?: string; results?: PushResult[] };

/**
 * Send to my n8n: adds the chosen demo's workflow files to the owner's own n8n (N8N_API_URL, their local one by default) through
 * n8n's API. Only on their click, only the files that demo lists in config/demos.yaml, always switched off, and a workflow already
 * there by the same name is left alone.
 */
export async function sendToN8nAction(form: FormData): Promise<N8nSendResult> {
  await requireLogin();
  const id = Number(form.get("id")), folder = String(form.get("folder") ?? "");
  if (!Number.isInteger(id) || !(await query(`SELECT 1 FROM proposals WHERE id = $1`, [id])).length) return { error: "Proposal not found." };
  const recipe = (await loadRecipes()).recipes.find((r) => r.folder === folder);
  if (!recipe) return { error: "That demo is not listed in config/demos.yaml." };
  try {
    const sent = await pushDemo(recipe);
    if (sent.results.length) {
      await logActivity("demo_sent_to_n8n", { channel: "upwork", body: `${recipe.title} sent to n8n at ${sent.label} for proposal #${id}`, meta: { proposal_id: id, demo: recipe.folder, added: sent.results.filter((r) => r.status === "added").length } });
    }
    return { error: sent.error ? scrub(sent.error) : undefined, results: sent.results, summary: sent.results.length ? pushSummary(sent.results, sent.label) : undefined };
  } catch (err) {
    return { error: scrub(err instanceof Error ? err.message : String(err)) };
  }
}
