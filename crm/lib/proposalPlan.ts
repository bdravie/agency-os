import { readFile } from "node:fs/promises";
import path from "node:path";
import { parse } from "yaml";
import { askStructured, upworkModel } from "./llm";
import { aboutMe } from "./upworkPack";
import { cleanImprovements, improveProblems, type Improvements } from "./proposalImproveMath";
import { cleanFit, cleanPlan, fitProblems, normaliseRates, planProblems, type FitAnalysis, type Plan, type Rates } from "./proposalPlanMath";

export type { Improvements } from "./proposalImproveMath";
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
  const run = async () => cleanFit(await askStructured(prompt, FIT_SCHEMA, "haiku", 4000));
  let r = await run();
  if (fitProblems(r).length) r = await run();
  const bad = fitProblems(r);
  if (bad.length) throw new Error(`The AI reply was incomplete (${bad.join(", ")}). Try again.`);
  return r;
}

/** Break a job into milestones with ease and hours. The price is worked out in code from config/rates.yaml. */
export async function buildPlan(job: string): Promise<Plan> {
  const prompt = `${await read("prompts/proposal-plan.md")}\n\n${await context()}\n\nJOB POST:\n${job}`;
  const run = async () => cleanPlan(await askStructured(prompt, PLAN_SCHEMA, upworkModel(), 4500));
  let r = await run();
  if (planProblems(r).length) r = await run();
  const bad = planProblems(r);
  if (bad.length) throw new Error(`The AI reply was incomplete (${bad.join(", ")}). Try again.`);
  return r;
}

const IMPROVE_SCHEMA = {
  type: "object" as const,
  properties: {
    actions: {
      type: "array", minItems: 1, maxItems: 6,
      items: {
        type: "object",
        properties: {
          title: str, how: str, kind: { type: "string", enum: ["learn", "build", "change", "ask", "portfolio"] },
          effort_hours: { type: "number" }, score_gain: { type: "integer", minimum: 0, maximum: 3 },
          long_term: { type: "string", enum: ["yes", "maybe", "no"] }, long_term_note: str,
        },
        required: ["title", "how", "kind", "effort_hours", "score_gain", "long_term", "long_term_note"],
      },
    },
    verdict: {
      type: "object",
      properties: { overall: { type: "string", enum: ["worth_it", "apply_as_is", "partial", "skip"] }, reasoning: str, best_actions: strings(6), long_term: str },
      required: ["overall", "reasoning", "best_actions", "long_term"],
    },
  },
  required: ["actions", "verdict"],
};

const stripComments = (s: string) => s.replace(/<!--[\s\S]*?-->/g, "").trim();

/**
 * Suggest what to learn, build, change or ask to lift this job's fit score, and whether it pays off long term.
 * `recentJobs` is a plain-text digest of the owner's other proposals (title, score, risks) so repeated gaps can be spotted.
 */
export async function suggestImprovements(job: string, score: number | null, fit: FitAnalysis | null, recentJobs: string, rates: Rates): Promise<Improvements> {
  const portfolio = stripComments(await read("portfolio/portfolio.md").catch(() => ""));
  const fitText = fit
    ? `Score ${fit.score}/10. ${fit.summary}\nFactors:\n${fit.factors.map((f) => `- [${f.effect}] ${f.factor}: ${f.note}`).join("\n")}\nRisks:\n${fit.risks.map((r) => `- ${r}`).join("\n")}`
    : `Score ${score ?? "unknown"}/10. No explanation was saved: work out the likely gaps from the job post yourself.`;
  const prompt =
    `${await read("prompts/proposal-improve.md")}\n\n${await context()}\n\nPORTFOLIO:\n${/^## /m.test(portfolio) ? portfolio : "(No portfolio items yet.)"}\n\n` +
    `RATES: £${rates.hourly_rate_gbp}/hour, ${rates.hours_per_day} productive hours a day.\n\nFIT ANALYSIS:\n${fitText}\n\n` +
    `RECENT JOBS:\n${recentJobs || "(No other jobs saved yet, so say any long-term view is a judgement.)"}\n\nJOB POST:\n${job}`;
  const run = async () => cleanImprovements(await askStructured(prompt, IMPROVE_SCHEMA, upworkModel(), 4500));
  let r = await run();
  if (improveProblems(r).length) r = await run();
  const bad = improveProblems(r);
  if (bad.length) throw new Error(`The AI reply was incomplete (${bad.join(", ")}). Try again.`);
  return r;
}
