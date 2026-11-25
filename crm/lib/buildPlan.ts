// The Build Plan pipeline for one proposal: pain points, a matching workflow, a demo workflow and a tailored build plan.
// The AI drafts each step; buildPlanMath.ts checks and finishes it. The case study is placed from the owner's own table,
// and the timeline and fixed price are worked out in code. Nothing is sent anywhere.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { parse } from "yaml";
import { askStructured, upworkModel } from "./llm.ts";
import { withPositioning } from "./positioning.ts";
import { query } from "./db.ts";
import { loadProfile, loadProof } from "./pitchLibrary.ts";
import { loadRecipes } from "./demoRun.ts";
import { joinDemos, mainWorkflowFile } from "./demoRunMath.ts";
import { parseWorkflowText, MAX_FILE_CHARS, type ParsedWorkflow } from "./workflowParse.ts";
import { fetchTemplate, searchTemplates, templatesOn } from "./n8nTemplates.ts";
import { broaden, ENOUGH_HITS, TEMPLATE_PAGE } from "./n8nTemplatesMath.ts";
import { loadLibrary, loadLibraryWorkflow } from "./workflowLibrary.ts";
import {
  eligibleCases, finishDemo, finishMatches, finishPains, finishPlan, ownFirst, rankCandidates, settleDemo, WIDE_EXTRA,
  type Candidate, type CaseItem, type DemoStep, type MatchStep, type Pain, type PainStep, type Picked, type TailoredStep,
} from "./buildPlanMath.ts";

const ROOT = path.resolve(process.cwd(), "..");
const read = (file: string) => readFile(path.join(ROOT, file), "utf8");
const str = { type: "string" } as const;
const strings = (max: number) => ({ type: "array", items: str, maxItems: max }) as const;
const post = (job: string) => (job.length > 12000 ? `${job.slice(0, 12000)}…` : job);

/** The retry shows the refused draft, so a fix changes only what was wrong. */
const refusal = (problems: string[], draft: unknown) => `\n\nYour last reply was refused for these reasons:\n${problems.slice(0, 8).map((p) => `- ${p}`).join("\n")}\n\nHere it is. Change only what is needed to fix those, keep everything else word for word, and send the whole result again:\n${JSON.stringify(draft)}`;
const failed = (problems: string[]) => new Error(`The AI's reply didn't pass the checks twice, so nothing was saved: ${problems.slice(0, 3).join("; ")}. Try again.`);

/** Dollars to pounds from config/rates.yaml, for showing a fixed price in the currency Upwork uses. Null when it is not set. */
export async function loadUsdRate(): Promise<number | null> {
  const fx = Number((parse(await read("config/rates.yaml").catch(() => "")) ?? {}).usd_to_gbp);
  return Number.isFinite(fx) && fx > 0 ? fx : null;
}

/** Proof items that can be shown as a case study: real work for a client or the owner's own business, with the problem written down. */
export const loadCases = async () => eligibleCases(await query<CaseItem>(
  `SELECT id::int AS id, name, kind, client_type, one_line, problem_solved, results, tags, tools FROM proof_items ORDER BY (kind = 'client') DESC, name`));

// ---------- Step 1 ----------

const PAINS = {
  type: "object" as const,
  properties: {
    pains: {
      type: "array", minItems: 1, maxItems: 6,
      items: { type: "object", properties: { pain: str, quote: str, cost: { type: "string", enum: ["money", "time", "both"] }, why: str, search: { type: "array", items: str, minItems: 1, maxItems: 3 } }, required: ["pain", "quote", "cost", "why", "search"] },
    },
  },
  required: ["pains"],
};

/** Every pain point in the job post, ranked by what it costs the client, each with a quote the code finds in the post. */
export async function extractPains(job: string): Promise<PainStep> {
  const prompt = `${await read("prompts/build-plan-pains.md")}\n\nJOB POST:\n${post(job)}`;
  const ask = (extra = "") => askStructured<any>(prompt + extra, PAINS, upworkModel(), 3000);
  const raw = await ask();
  let r = finishPains(raw, job);
  if (r.problems.length) r = finishPains(await ask(refusal(r.problems, raw)), job);
  if (r.problems.length) throw failed(r.problems);
  return r.step;
}

// ---------- Step 2 ----------

const MATCH = {
  type: "object" as const,
  properties: { picks: { type: "array", maxItems: 6, items: { type: "object", properties: { ref: str, reason: str }, required: ["ref", "reason"] } } },
  required: ["picks"],
};

export type DemoWorkflow = { ref: string; folder: string; name: string; summary: string; tags: string[]; workflow: ParsedWorkflow };

/**
 * The workflows of the demos the owner has already built: each demo's main workflow file (config/demos.yaml), read from the project
 * folder and kept only as an outline, named and described by its entry under Proof and answers. A file that cannot be read is skipped.
 */
export async function loadDemoWorkflows(): Promise<DemoWorkflow[]> {
  const [{ recipes }, proof] = await Promise.all([loadRecipes(), loadProof()]);
  const out: DemoWorkflow[] = [];
  for (const d of joinDemos(proof, recipes)) {
    const file = d.recipe ? mainWorkflowFile(d.recipe) : null;
    if (!d.recipe || !file) continue;
    try {
      const raw = await readFile(path.join(ROOT, file), "utf8");
      const workflow = raw.length <= MAX_FILE_CHARS ? parseWorkflowText(raw).workflow : undefined;
      if (workflow) out.push({ ref: `demo:${d.recipe.folder}`, folder: d.recipe.folder, name: d.name, summary: d.one_line || d.recipe.shows, tags: d.tags, workflow });
    } catch { /* a missing file only means that demo is not offered */ }
  }
  return out;
}

/**
 * Looks for workflows that solve the pain point, **the owner's own first**: the workflows of the demos they have built and the ones
 * in their library are scored against the job in code, and those similar enough go to the front. n8n's public library is only
 * searched to fill the places left (or when `wide` asks for it anyway), unless it is switched off or over today's limit. A cheap
 * model picks among the rest and writes the reasons; if it fails, the keyword ranking stands. `requests` is how many calls to n8n
 * were really made (5 at most: up to 3 phrases, and 2 shorter ones if those found little).
 */
export async function findMatches(job: string, pain: Pain, search: string[], basis: string, allowance: number, wide = false): Promise<{ step: MatchStep; requests: number }> {
  const notes: string[] = [], cands: Candidate[] = [];
  let requests = 0;
  for (const d of await loadDemoWorkflows()) {
    cands.push({ ref: d.ref, source: "demo", name: d.name, summary: [d.summary.slice(0, 220), `${d.workflow.steps.length} steps`].filter(Boolean).join(" · "), apps: d.workflow.apps, url: null, tags: d.tags, platform: d.workflow.platform });
  }
  for (const w of await loadLibrary()) {
    cands.push({ ref: `lib:${w.id}`, source: "library", name: w.name, summary: [w.solves, `${w.workflow.steps.length} steps`].filter(Boolean).join(" · "), apps: w.apps, url: null, tags: w.tags });
  }
  const own = ownFirst(cands, `${pain.pain} ${search.join(" ")} ${post(job)}`), first = own.first;
  cands.splice(0, cands.length, ...own.ranked);   // each of the owner's own now carries its score and what it shares
  if (first.length) notes.push(`${first.length === 1 ? "One of your own workflows is" : `${first.length} of your own workflows are`} close to this job, so ${first.length === 1 ? "it is" : "they are"} listed first.`);
  if (!templatesOn()) notes.push("n8n's library is switched off (N8N_TEMPLATES=off), so only your own workflows were searched.");
  else if (first.length >= 3 && !wide) notes.push("Three of your own fit, so n8n's public library was not searched. Tick \"Search n8n's library as well\" to see what is there too.");
  else {
    const found = () => cands.filter((c) => c.source === "n8n").length;
    const look = async (phrases: string[]): Promise<boolean> => {
      for (const phrase of phrases) {
        if (requests >= allowance) { notes.push("Today's limit of n8n lookups is reached, so the search stopped early."); return false; }
        try {
          const { hits, fresh } = await searchTemplates(phrase);
          if (fresh) requests++;
          for (const h of hits) if (!cands.some((c) => c.ref === `n8n:${h.id}`)) cands.push({ ref: `n8n:${h.id}`, source: "n8n", name: h.name, summary: h.summary, apps: h.apps, url: TEMPLATE_PAGE(h.id) });
        } catch (err) {
          notes.push(`n8n's library could not be searched (${err instanceof Error ? err.message : String(err)}). Paste a template link or its JSON instead.`);
          return false;
        }
      }
      return true;
    };
    // n8n only returns templates holding every word, so a thin result gets one more go with shorter versions of the same phrases.
    if ((await look(search)) && found() < ENOUGH_HITS) await look(broaden(search));
  }
  if (!cands.length) return { step: { basis, search, matches: [], considered: 0, notes: [...notes, "Nothing was found. Change the search words, or paste a workflow."] }, requests };
  const rest = rankCandidates(cands.filter((c) => !first.some((f) => f.ref === c.ref)), `${pain.pain} ${search.join(" ")}`, 12 - first.length);
  const short = [...first, ...rest];
  // Asked for n8n's library as well: the owner's own stay in front, and up to three public templates follow them.
  const limit = wide && first.length ? Math.min(6, first.length + WIDE_EXTRA) : 3;
  const WHERE = { demo: "a demo the consultant built", library: "the consultant's own library", n8n: "n8n public template" } as const;
  const listing = short.map((c) => `[ref ${c.ref}] (${WHERE[c.source]}) ${c.name}\n  ${c.summary || "(no description)"}\n  Apps: ${c.apps.join(", ") || "(not listed)"}`).join("\n");
  let raw: unknown = null;
  try {
    raw = await askStructured(`${await read("prompts/build-plan-match.md")}\n\nPAIN POINT:\n${pain.pain}\n\nHOW MANY: ${limit}\n\nJOB POST:\n${post(job).slice(0, 4000)}\n\nCANDIDATES:\n${listing}`, MATCH, "haiku", 1600);
  } catch {
    notes.push("The AI could not rank these, so they are in keyword order.");
  }
  return { step: { basis, search, matches: finishMatches(raw, short, first, limit), considered: cands.length, notes }, requests };
}

/** The chosen workflow as an outline: one of the owner's own, or an n8n template read once and then dropped. */
export async function loadPicked(ref: string): Promise<{ picked: Picked; requests: number }> {
  if (ref.startsWith("demo:")) {
    const d = (await loadDemoWorkflows()).find((w) => w.ref === ref);
    if (!d) throw new Error("That demo's workflow could not be found. Check its entry in config/demos.yaml.");
    return { picked: { ref, source: "demo", own: false, name: d.name, url: null, workflow: d.workflow }, requests: 0 };
  }
  const [kind, raw] = ref.split(":"), id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) throw new Error("That workflow is not known.");
  if (kind === "lib") {
    const w = await loadLibraryWorkflow(id);
    if (!w) throw new Error("That workflow is no longer in your library.");
    return { picked: { ref, source: "library", own: true, name: w.name, url: null, workflow: w.workflow }, requests: 0 };
  }
  if (kind !== "n8n") throw new Error("That workflow is not known.");
  if (!templatesOn()) throw new Error("n8n's library is switched off (N8N_TEMPLATES=off). Paste the template's JSON instead.");
  const t = await fetchTemplate(id);
  return { picked: { ref, source: "n8n", own: false, name: t.name, url: TEMPLATE_PAGE(id), workflow: t.workflow }, requests: t.fresh ? 1 : 0 };
}

// ---------- Step 3 ----------

const DEMO = {
  type: "object" as const,
  properties: {
    summary: str,
    walkthrough: { type: "array", items: { type: "object", properties: { id: str, text: str }, required: ["id", "text"] } },
    case_id: { type: ["integer", "null"] }, case_reason: str,
  },
  required: ["summary", "walkthrough", "case_id", "case_reason"],
};

/** One plain line per step of the chosen workflow, and the owner's case study if one really matches. A line that breaks a rule twice is replaced by a plain one written in code. */
export async function writeDemo(job: string, pain: Pain, picked: Picked, basis: string): Promise<DemoStep> {
  const cases = await loadCases();
  const steps = picked.workflow.steps.map((s) => `[${s.id}] ${s.name} (${s.kind}${s.app ? `; app: ${s.app}` : ""}${s.action ? `; does: ${s.action}` : ""}${s.uses.length ? `; with: ${s.uses.join(", ")}` : ""})${s.next.length ? ` -> ${s.next.map((n) => `${n.to}${n.label ? ` (${n.label})` : ""}`).join(", ")}` : ""}`).join("\n");
  const studies = cases.map((c) => `[id ${c.id}] ${c.client_type || (c.kind === "own_business" ? "My own business" : "A client")}\n  Problem: ${c.problem_solved}\n  What was built: ${c.one_line}${c.tags?.length ? `\n  Tags: ${c.tags.join(", ")}` : ""}`).join("\n");
  const prompt = `${await withPositioning(await read("prompts/build-plan-demo.md"))}\n\nPAIN POINT:\n${pain.pain}\n\nJOB POST:\n${post(job).slice(0, 5000)}\n\n` +
    `WORKFLOW: ${picked.name}\n${steps}\n\nCASE STUDIES:\n${studies || "(none: return case_id null)"}`;
  const ask = (extra = "") => askStructured<any>(prompt + extra, DEMO, upworkModel(), 4000);
  const raw = await ask();
  let r = finishDemo(raw, picked, cases, basis);
  if (r.problems.length) r = finishDemo(await ask(refusal(r.problems, raw)), picked, cases, basis);
  return settleDemo(r.step, picked, r.bad);
}

// ---------- Step 4 ----------

const PLAN = {
  type: "object" as const,
  properties: {
    flow: { type: "array", minItems: 4, maxItems: 8, items: { type: "object", properties: { label: str, detail: str, stack: { type: "array", items: str, minItems: 1, maxItems: 6 } }, required: ["label", "detail", "stack"] } },
    branches: { type: "array", maxItems: 4, items: { type: "object", properties: { from: { type: "integer" }, to: { type: "integer" }, label: str }, required: ["from", "to", "label"] } },
    outcomes: strings(4), access: strings(6),
    milestones: {
      type: "array", minItems: 2, maxItems: 4,
      items: { type: "object", properties: { name: str, delivers: strings(3), ease: { type: "string", enum: ["easy", "medium", "hard"] }, hours_low: { type: "number" }, hours_high: { type: "number" } }, required: ["name", "delivers", "ease", "hours_low", "hours_high"] },
    },
    assumptions: strings(4),
  },
  required: ["flow", "branches", "outcomes", "access", "milestones", "assumptions"],
};

/** The plan written for this client: flow, what they end up with, what is needed, milestones with hours. The price and timeline are added in code. */
export async function writePlan(job: string, pain: Pain, picked: Picked | null, basis: string): Promise<TailoredStep> {
  const profile = await loadProfile();
  const pattern = picked ? `PATTERN WORKFLOW: ${picked.name}\n${picked.workflow.steps.map((s, i) => `${i + 1}. ${s.name}${s.app ? ` (${s.app})` : ""}${s.kind === "branch" ? " [decision]" : ""}`).join("\n")}` : "PATTERN WORKFLOW:\n(none chosen: plan it from the job post alone)";
  const prompt = `${await withPositioning(await read("prompts/build-plan-tailored.md"))}\n\nJOB POST:\n${post(job)}\n\nPAIN POINT:\n${pain.pain}${pain.quote ? `\nIn their words: "${pain.quote}"` : ""}\n\n` +
    `TOOLS:\nStrong: ${profile.strong_tools.join(", ") || "(none listed)"}\nFamiliar: ${profile.familiar_tools.join(", ") || "(none listed)"}\n\n${pattern}`;
  const ref = picked?.ref ?? "";
  const ask = (extra = "") => askStructured<any>(prompt + extra, PLAN, upworkModel(), 5000);
  const raw = await ask();
  let r = finishPlan(raw, job, basis, ref);
  const gaps = () => r.missing.map((n) => `step ${n} of the flow has an empty stack: name every tool, app or service that step needs`);
  if (r.problems.length || r.missing.length) r = finishPlan(await ask(refusal([...r.problems, ...gaps()], raw)), job, basis, ref);
  if (r.problems.length) throw failed(r.problems);
  return r.step;   // a step still without a stack is flagged on the page for the owner to fill in
}
