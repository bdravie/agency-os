// Pure rules for a proposal's Build Plan (no AI, no database, no network), so they can be tested on their own.
// Four steps: pain points, a matching workflow, a demo workflow, a tailored build plan. The AI drafts; the code here checks and
// finishes each reply, places the case study word for word from the owner's own table, and works out the timeline and the
// fixed price. The AI never writes a client's name, a result or a price.
import { containsContactDetails } from "./audit.ts";
import { rankDemos } from "./demoRunMath.ts";
import { buildMermaid, normaliseTool, PERSONAL_DATA, toolLevel, type ProofItem } from "./loomPitchMath.ts";
import { cleanSearches } from "./n8nTemplatesMath.ts";
import { priceMilestones, type Ease, type Milestone, type Pricing, type Rates } from "./proposalPlanMath.ts";
import { cleanParsed, plainStep, workflowMermaid, type ParsedWorkflow } from "./workflowParse.ts";

export const STEPS = ["pains", "matches", "demo", "plan"] as const;
export type StepKey = (typeof STEPS)[number];
export const STEP_LABELS: Record<StepKey, string> = { pains: "Pain points", matches: "Matching workflow", demo: "Demo workflow", plan: "Tailored build plan" };

export type Cost = "money" | "time" | "both";
/** `search` is what to type into a workflow library to find something that solves this pain point. */
export type Pain = { id: string; pain: string; quote: string; cost: Cost; why: string; search: string[] };
export type PainStep = { pains: Pain[]; chosen: string; search: string[]; data_note: string | null; at?: string };

/** `demo` is the workflow of a demo the owner built (config/demos.yaml); `library` is one they saved as run by them. `score` and `shares` are set on the owner's own, by `ownFirst`. */
export type Candidate = { ref: string; source: "n8n" | "library" | "demo"; name: string; summary: string; apps: string[]; url: string | null; tags?: string[]; score?: number; shares?: string[] };
export type Match = Candidate & { reason: string };
export type MatchStep = { basis: string; search: string[]; matches: Match[]; considered: number; notes: string[]; at?: string };

/** The workflow the owner chose. `own` is true only for one from their library, or a pasted one they say they have run. A demo they built is theirs, but it is a demo, so it is never `own`. */
export type Picked = { ref: string; source: "n8n" | "library" | "pasted" | "demo"; own: boolean; name: string; url: string | null; workflow: ParsedWorkflow };

export type CaseItem = Pick<ProofItem, "id" | "name" | "kind" | "one_line" | "problem_solved" | "results" | "tags" | "tools"> & { client_type?: string | null };
export type CaseStudy = { proof_id: number; client_type: string; problem: string; built: string; results: string | null };
export type DemoStep = {
  basis: string; ref: string; heading: string; summary: string; mermaid: string; walkthrough: { id: string; text: string }[];
  case_study: CaseStudy | null; case_reason: string; notes: string[]; at?: string;
};

/** `tool` is the step's whole tech stack as one comma-separated list ("Gmail, n8n, HubSpot"); `stackOf` splits it. */
export type FlowStep = { label: string; detail: string; tool: string | null };
export type Branch = { from: number; to: number; label: string };
export type PlanMilestone = { name: string; delivers: string[]; ease: Ease; hours_low: number; hours_high: number };
export type TailoredStep = {
  basis: string; ref: string; flow: FlowStep[]; branches: Branch[]; mermaid: string; outcomes: string[]; access: string[];
  milestones: PlanMilestone[]; assumptions: string[]; data_note: string | null; at?: string;
};

/** The owner's own words for the client page (buildPlanPageMath.ts). An empty one means "use what the plan says". `basis` is the pain point `problem` was written for. */
export type PageNotes = { basis: string; title: string; client: string; intro: string; problem: string; closing: string; at?: string };
export type BuildPlan = { pains?: PainStep; matches?: MatchStep; workflow?: Picked | null; demo?: DemoStep; plan?: TailoredStep; page?: PageNotes };

export const HEADING_OWN = "A workflow I use for this kind of problem";
export const HEADING_PATTERN = "A workflow pattern I'd start from for this kind of problem";
export const HEADING_DEMO = "A demo workflow I built for this kind of problem";
/** How well one of the owner's own workflows has to score against the job (out of 100, the Run a demo score) to be put ahead of public templates. */
export const OWN_SIMILAR = 30;
export const DPA_NOTE = "The job points to personal data. A data processing agreement comes first, before any of their customers' personal data is handled.";
export const MERMAID_MAX = 6000;

const CONTACT = /[\w.+-]+@[\w-]+\.[\w.-]+|\+?\d[\d\s().-]{8,}\d/g;
const FIGURE = /[£$€]\s?\d|\d\s?%|\b\d+(?:\.\d+)?\s?x\b|\bguarantee/i;
// A digit glued inside a word is part of a name (n8n, GA4, v2), not a figure, so it is neither checked nor counted as backing.
const NUMBER = /(?<![A-Za-z\d])\d[\d,]*(?:\.\d+)?/g;
// Past work for someone else: that only ever comes from the owner's own case study table.
const PAST_WORK = /\b(?:my|our|another|previous|past|former|recent)\s+clients?\b|\bclients? of mine\b|\bfor (?:a|one|some|several|many) (?:of my )?clients?\b|\bcase study\b/i;

const text = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
const scrub = (v: unknown, max: number) => text(typeof v === "string" ? v.replace(CONTACT, "") : v, max);
const ease = (v: unknown): Ease => (v === "easy" || v === "hard" ? v : "medium");
const halfHours = (n: number) => Math.round(n * 2) / 2;

// ---------- Step 1: pain points ----------

const plain = (s: string) => s.toLowerCase().replace(/[‘’`]/g, "'").replace(/[“”]/g, '"').replace(/[^a-z0-9£$%]+/g, " ").trim();

/** A pain point only counts when its quote really is in the job post (ignoring case, spacing and punctuation). */
export function quoteInPost(quote: string, job: string): boolean {
  const q = plain(quote);
  return q.split(" ").length >= 3 && plain(job).includes(q);
}

/** Numbers in this text that the source does not contain: a guard against the model making one up. */
export function unbackedNumbers(value: string, source: string): string[] {
  const known = new Set((source.match(NUMBER) ?? []).map((n) => n.replace(/,/g, "")));
  return [...new Set((value.match(NUMBER) ?? []).filter((n) => !known.has(n.replace(/,/g, ""))))];
}

const STOP = new Set("a an and are as at be but by for from has have i in is it its of on or our so that the their them they this to we were what when which who will with you your need needs want wants looking help".split(" "));
const tokens = (s: string) => plain(s).split(" ").filter((w) => w.length > 2 && !STOP.has(w));

/** A search phrase made from the pain point itself, for when the AI gave none. */
export const searchFromPain = (pain: string) => cleanSearches([tokens(pain).slice(0, 4).join(" ")]);

/** Finish the AI's pain points: keep those with a real quote, in the order it ranked them, and commit to the first. */
export function finishPains(raw: any, job: string): { step: PainStep; problems: string[] } {
  const seen = new Set<string>();
  const pains: Pain[] = [];
  let unquoted = 0;
  for (const p of Array.isArray(raw?.pains) ? raw.pains : []) {
    const pain = scrub(p?.pain, 160), quote = scrub(p?.quote, 240);
    if (!pain || seen.has(pain.toLowerCase())) continue;
    if (!quoteInPost(quote, job)) { unquoted++; continue; }
    seen.add(pain.toLowerCase());
    const search = cleanSearches(p?.search);
    pains.push({ id: `p${pains.length + 1}`, pain, quote, cost: p?.cost === "money" || p?.cost === "time" ? p.cost : "both", why: scrub(p?.why, 220), search: search.length ? search : searchFromPain(pain) });
    if (pains.length === 6) break;
  }
  const problems: string[] = [];
  if (!pains.length) problems.push(unquoted ? "every pain point needs a quote copied word for word from the job post" : "no pain points");
  for (const p of pains) {
    const made = unbackedNumbers(`${p.pain} ${p.why}`, job);
    if (made.length) problems.push(`"${p.pain}" uses a number that is not in the job post (${made.join(", ")})`);
    if (PAST_WORK.test(`${p.pain} ${p.why}`)) problems.push(`"${p.pain}" talks about past client work`);
  }
  return { step: { pains, chosen: pains[0]?.id ?? "", search: pains[0]?.search ?? [], data_note: PERSONAL_DATA.test(job) ? DPA_NOTE : null }, problems };
}

/** The owner's own edit: reword, add or drop pain points, pick another angle, change the search words. Only contact details are refused. */
export function cleanPainsEdit(raw: any, current: PainStep): { value?: PainStep; error?: string } {
  const quotes = new Map(current.pains.map((p) => [p.id, p.quote])), searches = new Map(current.pains.map((p) => [p.id, p.search ?? []]));
  const pains: Pain[] = (Array.isArray(raw?.pains) ? raw.pains : []).slice(0, 8).map((p: any, i: number): Pain => {
    const id = typeof p?.id === "string" && quotes.has(p.id) ? p.id : `own${i + 1}`;
    const pain = text(p?.pain, 160);
    return { id, pain, quote: quotes.get(id) ?? "", cost: p?.cost === "money" || p?.cost === "time" ? p.cost : "both", why: text(p?.why, 220), search: searches.get(id) ?? searchFromPain(pain) };
  }).filter((p: Pain) => p.pain);
  if (!pains.length) return { error: "Keep at least one pain point." };
  if (new Set(pains.map((p) => p.id)).size !== pains.length) return { error: "That could not be read. Reload the page and try again." };
  if (containsContactDetails(pains.map((p) => `${p.pain} ${p.why}`).join(" "))) return { error: "Leave email addresses and phone numbers out." };
  const chosen = pains.some((p) => p.id === raw?.chosen) ? raw.chosen : pains[0].id;
  // Picking another angle brings that pain point's own search words with it, unless the owner typed some.
  const typed = cleanSearches(raw?.search), picked = pains.find((p) => p.id === chosen)!;
  const search = typed.length && (chosen === current.chosen || typed.join("|") !== current.search.join("|")) ? typed : chosen === current.chosen ? current.search : picked.search;
  return { value: { ...current, pains, chosen, search: search.length ? search : searchFromPain(picked.pain) } };
}

export const chosenPain = (bp: BuildPlan | null | undefined): Pain | null => bp?.pains?.pains.find((p) => p.id === bp.pains!.chosen) ?? bp?.pains?.pains[0] ?? null;
/** What the later steps were built for. If the angle changes, they are out of date. */
export const painBasis = (bp: BuildPlan | null | undefined) => (chosenPain(bp)?.pain ?? "").toLowerCase();

// ---------- Step 2: a matching workflow ----------

/** Rough keyword ranking in code, used to cut a long list down before the AI sees it and as the fallback if the AI's picks can't be used. The owner's own workflows get a head start. */
export function rankCandidates(cands: Candidate[], about: string, limit = 12): Candidate[] {
  const want = new Set(tokens(about));
  const score = (c: Candidate) => {
    const hit = (s: string, weight: number) => new Set(tokens(s).filter((w) => want.has(w))).size * weight;
    const s = hit(c.name, 2) + hit(c.apps.join(" "), 2) + hit(c.summary, 1);
    return c.source === "n8n" ? s : s + 1.5;
  };
  return cands.map((c, i) => ({ c, s: score(c), i })).sort((a, b) => b.s - a.s || a.i - b.i).slice(0, limit).map((x) => x.c);
}

const WHOSE = { demo: "A demo you built.", library: "From your own library.", n8n: "" } as const;
const codeReason = (c: Candidate) =>
  c.source !== "n8n" && c.shares?.length ? `${WHOSE[c.source]} Shares ${c.shares.slice(0, 4).join(", ")} with this job.`
    : c.apps.length ? `${WHOSE[c.source]} Uses ${c.apps.slice(0, 3).join(", ")}.`.trim() : WHOSE[c.source] || "Closest by name.";

/**
 * The owner's own workflows (their demos and their library) scored against the job, best first, with the ones similar enough to go
 * ahead of any public template (`first`, three at most). The score is the same one the Run a demo tab shows: shared tags, tools and
 * wording, worked out in code.
 */
export function ownFirst(own: Candidate[], about: string): { ranked: Candidate[]; first: Candidate[] } {
  const mine = own.filter((c) => c.source !== "n8n"), byRef = new Map(mine.map((c) => [c.ref, c]));
  const scored = rankDemos(about, mine.map((c) => ({ key: c.ref, name: c.name, one_line: c.summary, problem: "", tags: c.tags ?? [], tools: c.apps, recipe: null })));
  const ranked = scored.map((m) => ({ ...byRef.get(m.key)!, score: m.score, shares: m.shares }));
  return { ranked, first: ranked.filter((c) => (c.score ?? 0) >= OWN_SIMILAR).slice(0, 3) };
}

/**
 * The top 3 with a reason each. Only workflows that were really found can be picked; a reason with a figure or a claim is replaced by a plain one.
 * `first` are the owner's own similar workflows: they always come before anything else, in their own order, whatever the AI ranked.
 */
export function finishMatches(raw: any, cands: Candidate[], first: Candidate[] = []): Match[] {
  const byRef = new Map(cands.map((c) => [c.ref, c]));
  const said = new Map<string, string>();
  for (const p of Array.isArray(raw?.picks) ? raw.picks : []) {
    const ref = String(p?.ref ?? ""), reason = scrub(p?.reason, 180);
    if (byRef.has(ref) && !said.has(ref)) said.set(ref, !reason || FIGURE.test(reason) || PAST_WORK.test(reason) ? "" : reason);
  }
  const out: Match[] = first.filter((c) => byRef.has(c.ref)).slice(0, 3).map((c) => ({ ...c, reason: said.get(c.ref) || codeReason(c) }));
  for (const [ref, reason] of said) {
    if (out.length >= 3) break;
    const c = byRef.get(ref)!;
    if (!out.some((m) => m.ref === ref)) out.push({ ...c, reason: reason || codeReason(c) });
  }
  for (const c of cands) {
    if (out.length >= 3) break;
    if (!out.some((m) => m.ref === c.ref)) out.push({ ...c, reason: codeReason(c) });
  }
  return out;
}

export const headingFor = (own: boolean) => (own ? HEADING_OWN : HEADING_PATTERN);
/** The heading for the chosen workflow: "a workflow I use" only for one the owner runs, a demo is called a demo, anything else is a pattern to start from. */
export const headingOf = (p: Pick<Picked, "own" | "source">) => (p.own ? HEADING_OWN : p.source === "demo" ? HEADING_DEMO : HEADING_PATTERN);

/** Tidies a chosen workflow read back from the database or sent from the browser. */
export function cleanPicked(v: any): Picked | null {
  const workflow = cleanParsed(v?.workflow);
  if (!workflow || typeof v?.ref !== "string") return null;
  const source = v.source === "n8n" || v.source === "library" || v.source === "demo" ? v.source : "pasted";
  const url = typeof v.url === "string" && /^https:\/\/n8n\.io\/workflows\/\d+$/.test(v.url) ? v.url : null;
  return { ref: v.ref.slice(0, 120), source, own: source === "library" || (source === "pasted" && v.own === true), name: scrub(v.name, 120) || workflow.name || "Workflow", url, workflow };
}

// ---------- Step 3: the demo workflow ----------

/** Case studies are proof items about real work for someone: a client or the owner's own business. Demos and tools are not case studies. */
export const eligibleCases = <T extends CaseItem>(proof: T[]): T[] => proof.filter((p) => (p.kind === "client" || p.kind === "own_business") && text(p.one_line, 10) && text(p.problem_solved, 10));

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The case study, word for word from the owner's table. A real client is never named: its name is swapped for "the client" wherever the owner's own text uses it. */
export function caseStudyOf(item: CaseItem): CaseStudy {
  const hide = (s: string | null | undefined) => {
    const t = text(s, 600);
    if (item.kind !== "client" || item.name.trim().length < 3) return t;
    const swapped = t.replace(new RegExp(`(^|[^A-Za-z0-9])${escapeRe(item.name.trim()).replace(/\s+/g, "\\s+")}(?![A-Za-z0-9])`, "gi"), "$1the client");
    return swapped.replace(/(^|[.!?]\s+)the client/g, "$1The client");
  };
  return {
    proof_id: item.id, client_type: text(item.client_type, 80) || (item.kind === "own_business" ? "My own business" : "A client"),
    problem: hide(item.problem_solved), built: hide(item.one_line), results: hide(item.results) || null,
  };
}

/** What is wrong with one line the AI wrote about a workflow step. Digits are only fine when the step's own name has them. */
export function lineProblems(line: string, allowed = ""): string[] {
  return [
    FIGURE.test(line) && "a figure or a guarantee", unbackedNumbers(line, allowed).length > 0 && "a number", PAST_WORK.test(line) && "a claim about client work",
    containsContactDetails(line) && "contact details",
  ].filter(Boolean) as string[];
}

/**
 * Finish the demo: one plain line per step of the chosen workflow, in the workflow's own order, the diagram drawn by code, and the
 * case study (if the AI chose one that exists) placed from the table. `bad` lists the lines that broke a rule, so the caller can ask again.
 */
export function finishDemo(raw: any, picked: Picked, cases: CaseItem[], basis: string): { step: DemoStep; problems: string[]; bad: string[] } {
  const said = new Map<string, string>((Array.isArray(raw?.walkthrough) ? raw.walkthrough : []).map((w: any) => [String(w?.id ?? ""), scrub(w?.text, 240)]));
  const problems: string[] = [], bad: string[] = [];
  const walkthrough = picked.workflow.steps.map((s) => {
    const line = said.get(s.id) || plainStep(s);
    const wrong = said.get(s.id) ? lineProblems(line, `${s.name} ${s.app ?? ""} ${s.action ?? ""}`) : [];
    if (wrong.length) { bad.push(s.id); problems.push(`walkthrough ${s.id} ("${s.name}") has ${wrong.join(" and ")}`); }
    return { id: s.id, text: line };
  });
  let summary = scrub(raw?.summary, 240);
  const wrong = summary ? lineProblems(summary, picked.name) : [];
  if (wrong.length) { bad.push("summary"); problems.push(`the summary has ${wrong.join(" and ")}`); }
  if (!summary) summary = picked.name;
  const item = cases.find((c) => c.id === Number(raw?.case_id)) ?? null;
  const reason = scrub(raw?.case_reason, 200);
  return {
    step: {
      basis, ref: picked.ref, heading: headingOf(picked), summary, mermaid: workflowMermaid(picked.workflow), walkthrough,
      case_study: item ? caseStudyOf(item) : null, case_reason: item && reason && !FIGURE.test(reason) ? reason : "", notes: [],
    },
    problems, bad,
  };
}

/** After a second try, a line that still breaks a rule is replaced by the plain one written by code, and the page says so. */
export function settleDemo(step: DemoStep, picked: Picked, bad: string[]): DemoStep {
  if (!bad.length) return step;
  const byId = new Map(picked.workflow.steps.map((s) => [s.id, s]));
  const lines = bad.filter((b) => b !== "summary").length;
  return {
    ...step, summary: bad.includes("summary") ? picked.name : step.summary,
    walkthrough: step.walkthrough.map((w) => (bad.includes(w.id) && byId.has(w.id) ? { id: w.id, text: plainStep(byId.get(w.id)!) } : w)),
    notes: [...step.notes, `${lines ? `${lines} walkthrough line${lines === 1 ? " was" : "s were"}` : "The summary was"} written by code, because the AI's wording used a number or a claim it had no source for. Reword ${lines === 1 || !lines ? "it" : "them"} if you like.`],
  };
}

/** The owner's own edit to the demo. Their wording is only refused for contact details; the case study can be swapped or removed, never typed. */
export function cleanDemoEdit(raw: any, current: DemoStep, picked: Picked, cases: CaseItem[]): { value?: DemoStep; error?: string } {
  const typed = new Map<string, string>((Array.isArray(raw?.walkthrough) ? raw.walkthrough : []).map((w: any) => [String(w?.id ?? ""), text(w?.text, 300)]));
  const walkthrough = picked.workflow.steps.map((s) => ({ id: s.id, text: typed.get(s.id) || current.walkthrough.find((w) => w.id === s.id)?.text || plainStep(s) }));
  const mermaid = typeof raw?.mermaid === "string" && raw.mermaid.trim() ? raw.mermaid.trim().slice(0, MERMAID_MAX) : current.mermaid;
  const heading = text(raw?.heading, 120) || current.heading, summary = text(raw?.summary, 300) || current.summary;
  if (containsContactDetails([heading, summary, mermaid, ...walkthrough.map((w) => w.text)].join(" "))) return { error: "Leave email addresses and phone numbers out." };
  const item = raw?.case_id === null || raw?.case_id === "" ? null : cases.find((c) => c.id === Number(raw?.case_id)) ?? null;
  const kept = item && item.id === current.case_study?.proof_id;
  return { value: { ...current, heading, summary, mermaid, walkthrough, case_study: item ? caseStudyOf(item) : null, case_reason: kept ? current.case_reason : "", notes: [] } };
}

// ---------- Step 4: the tailored build plan ----------

/** A step's tech stack as separate names. Commas are the usual divider; "A / B", "A + B", "A and B" are split too. */
export function splitStack(tool: string | null | undefined): string[] {
  const seen = new Set<string>(), out: string[] = [];
  for (const t of (tool ?? "").split(/\s*[,;·\n]\s*|\s+(?:[/+&]|and|or)\s+/i)) {
    const name = t.trim().slice(0, 30).trim();
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    out.push(name);
  }
  return out.slice(0, 6);
}
export const stackOf = (f: FlowStep) => splitStack(f.tool);
/** The numbers (from 1) of the steps that name no tool at all. The client page states the tech stack under every step, so these need filling in. */
export const stepsWithoutStack = (flow: FlowStep[]) => flow.map((f, i) => (stackOf(f).length ? 0 : i + 1)).filter(Boolean);

const nodeLabel = (s: unknown) => text(s, 60).replace(/["[\]{}()<>|#;`\\]/g, "").replace(/\s+/g, " ").trim().slice(0, 40);

/** The plan's diagram, built in code from its steps so it always draws: the steps in a line, plus any branch the plan names. */
export function planMermaid(flow: FlowStep[], branches: Branch[]): string {
  const nodes = flow.map((f, i) => ({ id: `S${i + 1}`, label: nodeLabel(f.label) || `Step ${i + 1}` }));
  const edges = [
    ...flow.slice(1).map((_, i) => ({ from: `S${i + 1}`, to: `S${i + 2}`, label: null as string | null })),
    ...branches.filter((b) => b.to !== b.from + 1).map((b) => ({ from: `S${b.from}`, to: `S${b.to}`, label: nodeLabel(b.label).slice(0, 24) || null })),
  ];
  return buildMermaid(nodes, edges);
}

/** `keep` is how a piece of text is tidied: the AI's has contact details stripped, the owner's is left whole so it can be refused with a reason. */
function readPlan(raw: any, keep: (v: unknown, max: number) => string = scrub) {
  const lines = (v: unknown, n: number, max: number) => (Array.isArray(v) ? v : []).map((s) => keep(s, max)).filter(Boolean).slice(0, n);
  const flow: FlowStep[] = (Array.isArray(raw?.flow) ? raw.flow : []).map((f: any) => ({ label: nodeLabel(keep(f?.label, 60)), detail: keep(f?.detail, 260), tool: splitStack(keep(Array.isArray(f?.stack) ? f.stack.join(", ") : f?.tool, 240)).join(", ") || null }))
    .filter((f: FlowStep) => f.label && f.detail).slice(0, 9);
  const whole = (n: unknown) => Math.round(Number(n));
  const branches: Branch[] = (Array.isArray(raw?.branches) ? raw.branches : []).map((b: any) => ({ from: whole(b?.from), to: whole(b?.to), label: keep(b?.label, 60) }))   // whole on the client page; the diagram shortens it itself
    .filter((b: Branch) => b.from >= 1 && b.to >= 1 && b.from <= flow.length && b.to <= flow.length && b.from !== b.to).slice(0, 4);
  const milestones: PlanMilestone[] = (Array.isArray(raw?.milestones) ? raw.milestones : []).map((m: any): PlanMilestone => {
    const low = halfHours(Math.max(0.5, Math.min(80, Number(m?.hours_low) || 0.5)));
    return { name: keep(m?.name, 80), delivers: lines(m?.delivers, 3, 160), ease: ease(m?.ease), hours_low: low, hours_high: halfHours(Math.max(low, Math.min(80, Number(m?.hours_high) || low))) };
  }).filter((m: PlanMilestone) => m.name).slice(0, 6);
  return { flow, branches, milestones, outcomes: lines(raw?.outcomes, 5, 180), access: lines(raw?.access, 8, 180), assumptions: lines(raw?.assumptions, 4, 200) };
}

/** Finish the AI's tailored plan. Nothing in it may be a price, a promise, a number the job post does not give, or a story about past clients. */
export function finishPlan(raw: any, job: string, basis: string, ref: string): { step: TailoredStep; problems: string[]; missing: number[] } {
  const p = readPlan(raw);
  const problems: string[] = [
    p.flow.length < 4 && `the flow has ${p.flow.length} steps; it needs 4 to 9`, p.outcomes.length < 2 && "what the team ends up with needs at least 2 items",
    !p.access.length && "tools and access needed is empty", p.milestones.length < 2 && "it needs at least 2 milestones",
  ].filter(Boolean) as string[];
  const said = [...p.flow.flatMap((f) => [f.label, f.detail, f.tool ?? ""]), ...p.branches.map((b) => b.label), ...p.outcomes, ...p.access, ...p.assumptions, ...p.milestones.flatMap((m) => [m.name, ...m.delivers])];
  for (const s of said) {
    if (FIGURE.test(s)) problems.push(`"${s.slice(0, 60)}" states a price, a percentage or a guarantee (the price is worked out in code)`);
    else if (unbackedNumbers(s, job).length) problems.push(`"${s.slice(0, 60)}" uses a number that is not in the job post (${unbackedNumbers(s, job).join(", ")})`);
    if (PAST_WORK.test(s)) problems.push(`"${s.slice(0, 60)}" talks about past client work`);
  }
  // A step with no tech stack is worth one more ask, but not worth throwing the plan away: the owner can fill it in.
  return { step: { basis, ref, ...p, mermaid: planMermaid(p.flow, p.branches), data_note: PERSONAL_DATA.test(job) ? DPA_NOTE : null }, problems: [...new Set(problems)], missing: stepsWithoutStack(p.flow) };
}

/** Tools the plan names that are neither in the job post nor on the owner's tool lists: shown as a warning to check, never a refusal. */
export function toolsToCheck(flow: FlowStep[], job: string, lists: { strong_tools: string[]; familiar_tools: string[] }): string[] {
  const post = ` ${normaliseTool(job)} `;
  return [...new Set(flow.flatMap(stackOf).filter((t) => t && !/^(?:your|their|the)\b/i.test(t) && toolLevel(t, lists) === "not_listed" && !post.includes(` ${normaliseTool(t)} `)))];
}

/** The owner's own edit to the plan. Their numbers and wording are theirs; only contact details are refused. */
export function cleanPlanEdit(raw: any, current: TailoredStep): { value?: TailoredStep; error?: string } {
  const p = readPlan(raw, text);
  if (p.flow.length < 2) return { error: "Keep at least 2 steps in the flow, each with a short label and a line of detail." };
  if (!p.milestones.length) return { error: "Keep at least one milestone." };
  const typed = typeof raw?.mermaid === "string" ? raw.mermaid.trim().slice(0, MERMAID_MAX) : "";
  const mermaid = typed || planMermaid(p.flow, p.branches);
  const typedText = [...p.flow.flatMap((f) => [f.label, f.detail, f.tool ?? ""]), ...p.branches.map((b) => b.label), ...p.outcomes, ...p.access, ...p.assumptions, ...p.milestones.flatMap((m) => [m.name, ...m.delivers]), mermaid];
  if (containsContactDetails(typedText.join(" \n "))) return { error: "Leave email addresses and phone numbers out." };
  return { value: { ...current, ...p, mermaid } };
}

// ---------- Timeline and fixed price ----------

export type QuoteLine = { name: string; days: number; from_day: number; to_day: number; price: number };
export type Quote = { lines: QuoteLine[]; days: number; total: number; pricing: Pricing };

/**
 * The timeline and the fixed price, worked out here from the hours and config/rates.yaml (the AI never prices).
 * A milestone takes whole working days. The fixed price is the Plan and price total (buffer, minimum and rounding included),
 * shared between the milestones in proportion so the lines add up to it exactly.
 */
export function quoteFor(ms: PlanMilestone[], rates: Rates): Quote {
  const asPriced: Milestone[] = ms.map((m) => ({ name: m.name, requirements: m.delivers, ease: m.ease, hours_low: m.hours_low, hours_high: m.hours_high, why: "" }));
  const pricing = priceMilestones(asPriced, rates);
  const step = rates.round_to_gbp > 0 ? rates.round_to_gbp : 1;
  let day = 0, spent = 0;
  const lines = ms.map((m, i): QuoteLine => {
    const days = Math.max(1, Math.ceil(pricing.lines[i].hours / rates.hours_per_day - 1e-9));
    const share = pricing.subtotal > 0 ? pricing.lines[i].price / pricing.subtotal : 1 / ms.length;
    const price = i === ms.length - 1 ? pricing.total - spent : Math.round((pricing.total * share) / step) * step;
    spent += price;
    const line = { name: m.name, days, from_day: day + 1, to_day: day + days, price };
    day += days;
    return line;
  });
  return { lines, days: day, total: pricing.total, pricing };
}

export type Currency = "GBP" | "USD";
/** A price in pounds, or in dollars at the owner's saved rate (rounded to the nearest 5, since it is a quote, not a conversion). */
export function money(gbp: number, currency: Currency, usdToGbp: number | null): string {
  if (currency === "USD" && usdToGbp && usdToGbp > 0) return `$${(Math.round(gbp / usdToGbp / 5) * 5).toLocaleString("en-US")}`;
  return `£${gbp.toLocaleString("en-GB")}`;
}
const dayRange = (l: QuoteLine) => (l.days === 1 ? `day ${l.from_day}` : `days ${l.from_day} to ${l.to_day}`);

// ---------- What is done, and what is out of date ----------

export type StepState = "empty" | "ready" | "stale";

/** Each step remembers what it was built for. Change the angle or the workflow and the steps after it are out of date, never silently rewritten. */
export function stepStates(bp: BuildPlan | null | undefined): Record<StepKey, StepState> {
  const basis = painBasis(bp), ref = bp?.workflow?.ref ?? "";
  return {
    pains: bp?.pains?.pains.length ? "ready" : "empty",
    matches: !bp?.matches ? "empty" : bp.matches.basis === basis ? "ready" : "stale",
    demo: !bp?.demo ? "empty" : bp.demo.basis === basis && bp.demo.ref === ref ? "ready" : "stale",
    plan: !bp?.plan ? "empty" : bp.plan.basis === basis && bp.plan.ref === ref ? "ready" : "stale",
  };
}

// ---------- The text to paste into the application ----------

/**
 * Everything for one application as plain text, put together by code from the saved steps (no AI). A step that is missing or
 * out of date is left out, so nothing built for a different angle is pasted by mistake.
 */
export function applicationText(bp: BuildPlan, rates: Rates, o: { currency: Currency; usdToGbp: number | null } = { currency: "GBP", usdToGbp: null }): string {
  const state = stepStates(bp), pain = chosenPain(bp), out: string[] = [];
  if (pain) out.push(`THE PROBLEM I'D SOLVE FIRST\n${pain.pain}${pain.quote ? `\nYou wrote: "${pain.quote}"` : ""}`);
  const d = state.demo === "ready" ? bp.demo! : null;
  if (d) {
    out.push(`${d.heading.toUpperCase()}\n${d.summary}\n\n${d.walkthrough.map((w, i) => `${i + 1}. ${w.text}`).join("\n")}`);
    const c = d.case_study;
    if (c) out.push(["WHERE I'VE DONE THIS", `Who for: ${c.client_type}`, `The problem: ${c.problem}`, `What I built: ${c.built}`, c.results && `Results: ${c.results}`].filter(Boolean).join("\n"));
  }
  const p = state.plan === "ready" ? bp.plan! : null;
  if (p) {
    const q = quoteFor(p.milestones, rates), cash = (n: number) => money(n, o.currency, o.usdToGbp);
    out.push(`MY PLAN FOR YOU\n${p.flow.map((f, i) => `${i + 1}. ${f.detail}${f.tool ? ` (${f.tool})` : ""}`).join("\n")}`);
    if (p.outcomes.length) out.push(`WHAT YOUR TEAM ENDS UP WITH\n${p.outcomes.map((s) => `- ${s}`).join("\n")}`);
    if (p.access.length) out.push(`WHAT I'D NEED FROM YOU\n${p.access.map((s) => `- ${s}`).join("\n")}`);
    out.push(`MILESTONES\n${q.lines.map((l, i) => `${i + 1}. ${l.name} (${dayRange(l)}): ${cash(l.price)}${p.milestones[i].delivers.length ? `\n${p.milestones[i].delivers.map((s) => `   - ${s}`).join("\n")}` : ""}`).join("\n")}` +
      `\n\nTimeline: ${q.days} working day${q.days === 1 ? "" : "s"} from the day I have access.\nFixed price: ${cash(q.total)}`);
    if (p.assumptions.length) out.push(`THIS ASSUMES\n${p.assumptions.map((s) => `- ${s}`).join("\n")}`);
    if (p.data_note) out.push("Because this would handle personal data, a data processing agreement comes first.");
  }
  return out.join("\n\n");
}
