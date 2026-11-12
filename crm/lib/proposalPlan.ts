import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { parse } from "yaml";
import { askStructured, upworkModel } from "./llm";
import { aboutMe } from "./upworkPack";
import { cleanDemoBrief, demoBriefProblems, type DemoBrief } from "./demoBriefMath";
import { loadProfile, loadProof } from "./pitchLibrary";
import { cleanImprovements, improveProblems, type Improvements } from "./proposalImproveMath";
import { cleanFit, cleanPlan, fitProblems, normaliseRates, planProblems, type FitAnalysis, type Plan, type Rates } from "./proposalPlanMath";

export type { Improvements } from "./proposalImproveMath";
export type { DemoBrief } from "./demoBriefMath";
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

const DEMO_SCHEMA = {
  type: "object" as const,
  properties: {
    gaps: { type: "array", maxItems: 5, items: { type: "object", properties: { what: str, kind: { type: "string", enum: ["tool", "work"] }, why: str }, required: ["what", "kind", "why"] } },
    covered: strings(4),
    demo: {
      type: "object",
      properties: {
        title: str, outcome: str, covers_gaps: { type: "array", items: { type: "integer", minimum: 1, maximum: 5 }, maxItems: 5 },
        steps: strings(6), tools: strings(6), sample_data: strings(4), out_of_scope: strings(4), loom_points: strings(3), hours: { type: "number" },
      },
      required: ["title", "outcome", "covers_gaps", "steps", "tools", "sample_data", "out_of_scope", "loom_points", "hours"],
    },
    data_note: { type: ["string", "null"] },
  },
  required: ["gaps", "covered", "demo", "data_note"],
};

/**
 * Work out what this job needs that the owner has nothing to show for yet, and plan one small demo that would prove it.
 * The result becomes a brief for Claude Code (written in code, `demoBriefPrompt`). Nothing is built or sent here.
 */
export async function buildDemoBrief(job: string, fit: FitAnalysis | null): Promise<DemoBrief> {
  const [rules, ctx, portfolioRaw, profile, proof, entries] = await Promise.all([
    read("prompts/proposal-demo-brief.md"), context(), read("portfolio/portfolio.md").catch(() => ""), loadProfile(), loadProof(),
    readdir(path.join(ROOT, "demos"), { withFileTypes: true }).catch(() => []),
  ]);
  const portfolio = stripComments(portfolioRaw);
  const existing = entries.filter((e) => e.isDirectory() && !e.name.startsWith(".")).map((e) => e.name).sort();
  const prompt =
    `${rules}\n\n${ctx}\n\nPORTFOLIO:\n${/^## /m.test(portfolio) ? portfolio : "(No portfolio items yet.)"}\n\n` +
    `TOOLS:\nStrong: ${profile.strong_tools.join(", ") || "(none listed)"}\nFamiliar: ${profile.familiar_tools.join(", ") || "(none listed)"}\n\n` +
    `PROOF:\n${proof.map((p) => `- ${p.name} (${p.kind})${p.one_line ? `: ${p.one_line}` : ""}${p.tools?.length ? ` [tools: ${p.tools.join(", ")}]` : ""}`).join("\n") || "(No proof items yet.)"}\n\n` +
    `EXISTING DEMOS:\n${existing.map((d) => `- ${d}`).join("\n") || "(None yet.)"}\n\n` +
    `FIT ANALYSIS:\n${fit ? `${fit.summary}\nRisks:\n${fit.risks.map((r) => `- ${r}`).join("\n")}` : "(None saved.)"}\n\nJOB POST:\n${job}`;
  const run = async () => cleanDemoBrief(await askStructured(prompt, DEMO_SCHEMA, upworkModel(), 4000), job, existing);
  let r = await run();
  if (demoBriefProblems(r).length) r = await run();
  const bad = demoBriefProblems(r);
  if (bad.length) throw new Error(`The AI reply was incomplete (${bad.join(", ")}). Try again.`);
  return r;
}
