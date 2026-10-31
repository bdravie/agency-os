import { readFile } from "node:fs/promises";
import path from "node:path";
import { parse } from "yaml";
import { askStructured, upworkModel } from "./llm";
import { aboutMe } from "./upworkPack";
import { cleanFit, cleanPlan, fitProblems, normaliseRates, planProblems, type FitAnalysis, type Plan, type Rates } from "./proposalPlanMath";

export type { FitAnalysis, Plan, Milestone, Rates } from "./proposalPlanMath";

// The CRM runs from crm/, shared files live in the repo root.
const ROOT = path.resolve(process.cwd(), "..");
const read = (file: string) => readFile(path.join(ROOT, file), "utf8");
const str = { type: "string" } as const;
const strings = (max: number) => ({ type: "array", items: str, maxItems: max }) as const;

const FIT_SCHEMA = {
  type: "object" as const,
  properties: {
    score: { type: "integer", minimum: 1, maximum: 10 },
    summary: str,
    factors: { type: "array", minItems: 3, maxItems: 6, items: { type: "object", properties: { factor: str, effect: { type: "string", enum: ["up", "down", "neutral"] }, note: str }, required: ["factor", "effect", "note"] } },
    benefits: strings(4), risks: strings(4),
    data_note: { type: ["string", "null"] },
  },
  required: ["score", "summary", "factors", "benefits", "risks", "data_note"],
};

const PLAN_SCHEMA = {
  type: "object" as const,
  properties: {
    milestones: {
      type: "array", minItems: 2, maxItems: 8,
      items: {
        type: "object",
        properties: { name: str, requirements: strings(3), ease: { type: "string", enum: ["easy", "medium", "hard"] }, hours_low: { type: "number" }, hours_high: { type: "number" }, why: str },
        required: ["name", "requirements", "ease", "hours_low", "hours_high", "why"],
      },
    },
    assumptions: strings(4), questions: strings(3),
    data_note: { type: ["string", "null"] },
  },
  required: ["milestones", "assumptions", "questions", "data_note"],
};

async function context(): Promise<string> {
  const [about, offersYaml] = await Promise.all([aboutMe(), read("config/offers.yaml")]);
  const offers = (parse(offersYaml)?.offers ?? []) as { name: string; outcome?: string }[];
  return `ABOUT ME:\n${about || "(Nothing written yet. Do not assume any past work.)"}\n\nOFFERS:\n${offers.map((o) => `- ${o.name}: ${o.outcome ?? ""}`).join("\n")}`;
}

/** Your general rates from config/rates.yaml; anything missing falls back to a default. */
export async function loadRates(): Promise<Rates> {
  return normaliseRates(parse(await read("config/rates.yaml").catch(() => "")));
}

/** Score a job 1-10 and say why: the factors, the benefits and the risks of applying. Haiku, to keep the cost low. */
export async function analyseFit(job: string): Promise<FitAnalysis> {
  const prompt = `${await read("prompts/proposal-analysis.md")}\n\n${await context()}\n\nJOB POST:\n${job}`;
  const run = async () => cleanFit(await askStructured(prompt, FIT_SCHEMA, "haiku", 1500));
  let r = await run();
  if (fitProblems(r).length) r = await run();
  const bad = fitProblems(r);
  if (bad.length) throw new Error(`The AI reply was incomplete (${bad.join(", ")}). Try again.`);
  return r;
}

/** Break a job into milestones with ease and hours. The price is worked out in code from config/rates.yaml. */
export async function buildPlan(job: string): Promise<Plan> {
  const prompt = `${await read("prompts/proposal-plan.md")}\n\n${await context()}\n\nJOB POST:\n${job}`;
  const run = async () => cleanPlan(await askStructured(prompt, PLAN_SCHEMA, upworkModel(), 3000));
  let r = await run();
  if (planProblems(r).length) r = await run();
  const bad = planProblems(r);
  if (bad.length) throw new Error(`The AI reply was incomplete (${bad.join(", ")}). Try again.`);
  return r;
}
