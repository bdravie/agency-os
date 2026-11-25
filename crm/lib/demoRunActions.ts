"use server";

// Run a demo from a proposal (the Run a demo tab). Only on the owner's click, only a demo listed in config/demos.yaml, and only its
// free demo version: fake data, no AI calls, nothing sent. What it printed comes back to the screen; nothing is saved but the activity.
import { requireLogin } from "./auth";
import { logActivity } from "./activity";
import { query } from "./db";
import { demoServing, loadRecipes, runSteps, startServing, stopServing, type Serving } from "./demoRun";
import { scrub } from "./launch";

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
