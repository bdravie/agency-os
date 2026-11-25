// Runs the Build plan pipeline on a job file without saving anything to the proposals table, and prints each step. It takes the
// top-ranked pain point and the top match, as Run all does. Reads your profile, proof and workflow library from the database,
// makes real AI calls and searches n8n's template library (unless N8N_TEMPLATES=off).
// Usage (from crm/):  node --experimental-strip-types --no-warnings --env-file=../.env scripts/buildPlanTest.mts <job.txt> [out.json]
import { readFileSync, writeFileSync } from "node:fs";
import { extractPains, findMatches, loadPicked, loadUsdRate, writeDemo, writePlan } from "../lib/buildPlan.ts";
import { applicationText, chosenPain, painBasis, quoteFor, stepStates, type BuildPlan } from "../lib/buildPlanMath.ts";
import { normaliseRates } from "../lib/proposalPlanMath.ts";
import { parse } from "yaml";

const [file, out] = process.argv.slice(2);
if (!file) { console.error("Give the path of a text file holding the job post."); process.exit(2); }
const job = readFileSync(file, "utf8").trim();
const rates = normaliseRates(parse(readFileSync(new URL("../../config/rates.yaml", import.meta.url), "utf8")));
const timed = async <T>(label: string, run: () => Promise<T>): Promise<T> => { const t = Date.now(); const r = await run(); console.error(`# ${label}: ${((Date.now() - t) / 1000).toFixed(1)}s`); return r; };
const started = Date.now();

const bp: BuildPlan = {};
bp.pains = await timed("1 pain points", () => extractPains(job));
const pain = chosenPain(bp)!, basis = painBasis(bp);
const found = await timed("2 matching workflow", () => findMatches(job, pain, bp.pains!.search, basis, 10));
bp.matches = found.step;
if (found.step.matches[0]) bp.workflow = (await timed("2 open the top match", () => loadPicked(found.step.matches[0].ref))).picked;
if (bp.workflow) bp.demo = await timed("3 demo workflow", () => writeDemo(job, pain, bp.workflow!, basis));
bp.plan = await timed("4 tailored build plan", () => writePlan(job, pain, bp.workflow ?? null, basis));
console.error(`# whole run: ${((Date.now() - started) / 1000).toFixed(1)}s, ${found.requests} n8n request(s)`);

const json = JSON.stringify({ ...bp, quote: quoteFor(bp.plan.milestones, rates), states: stepStates(bp) }, null, 2);
if (out) writeFileSync(out, json);
console.log(out ? applicationText(bp, rates, { currency: "GBP", usdToGbp: await loadUsdRate() }) : json);
process.exit(0);
