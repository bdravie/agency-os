// Pure rules for the Loom pitch (no AI, no database), so they can be tested on their own. The guardrails live here: the AI's reply is checked and finished in code.
import { containsContactDetails } from "./audit.ts";
import { cleanName } from "./upworkPackMath.ts";

export const SECTIONS = ["job_analysis", "workflow_diagram", "loom_script", "tool_flexibility_line", "cover_letter", "screening_answers", "pre_record_checklist"] as const;
export type Section = (typeof SECTIONS)[number];

export const SECTION_LABELS: Record<Section, string> = {
  job_analysis: "Job analysis", workflow_diagram: "Workflow diagram", loom_script: "Loom script", tool_flexibility_line: "Tool line",
  cover_letter: "Cover letter", screening_answers: "Screening answers", pre_record_checklist: "Before you record",
};

export const BEATS = ["hook", "relevance_bridge", "sketch", "walkthrough", "proof_drop", "tool_flexibility", "maintainability", "extra_proof", "long_term", "cta"] as const;
export type BeatKey = (typeof BEATS)[number];
export const BEAT_LABELS: Record<BeatKey, string> = {
  hook: "Hook", relevance_bridge: "Relevance bridge", sketch: "I sketched this out for you", walkthrough: "Walkthrough", proof_drop: "Proof drop",
  tool_flexibility: "Tool flexibility", maintainability: "Easy to maintain", extra_proof: "Extra proof", long_term: "Long-term angle", cta: "Call to action and sign-off",
};

export const COVER_MAX = 250, COVER_SOFT = 200;
export const LOOM_PLACEHOLDER = "{{LOOM_URL}}";
export const LOOM_LINK_LENGTH = 59;        // https://www.loom.com/share/ plus a 32-character id
export const SCRIPT_MIN_SECONDS = 150, SCRIPT_MAX_SECONDS = 240;
export const NODES_MIN = 4, NODES_MAX = 7;
export const RECENT_DAYS = 90;
export const COMPARE_MIN_SENT = 10;
export const GENERAL_LINE = "I build these kinds of systems.";
export const SECONDS_PER_STEP = 15;       // what happens, the options, the pick and what it depends on can't be said in less

export type ToolLevel = "strong" | "familiar" | "not_listed";
export type PickLevel = ToolLevel | "general";     // general: an approach rather than a product, so there is nothing to check
export type Profile = {
  name: string; positioning_line: string; short_positioning: string; strong_tools: string[]; familiar_tools: string[];
  preferred_defaults: string; portfolio_links: { label: string; url: string }[]; facts: string[];
};
export type ProofKind = "client" | "own_business" | "demo" | "internal_tool";
export type ProofItem = {
  id: number; name: string; kind: ProofKind; one_line: string | null; problem_solved: string | null; tools: string[]; results: string | null;
  link: string | null; tags: string[]; last_worked_on: string | null; notes: string | null;
};
export type BankAnswer = { id: number; category: string; question: string; answer: string };
export type LoomInputs = { budget: string; screening_questions: string[]; client_name: string; client_info: string };
export type Rates = { hourly_rate_gbp: number; usd_to_gbp: number | null };
export type PitchContext = { jobText: string; inputs: LoomInputs; profile: Profile; proof: ProofItem[]; bank: BankAnswer[]; rates: Rates; coverTemplate: string; today: string };

export type Flag = { type: "personal_data" | "vague_scope" | "budget_mismatch" | "other"; note: string };
export type JobAnalysis = {
  core_need: string; business_outcome: string; tools: { known_well: string[]; less_experienced: string[]; unknown: string[] };
  assumptions: string[]; open_questions: string[]; flags: Flag[]; missing: string[]; budget_note: string | null;
};
export type DiagramNode = { id: string; label: string };
export type Diagram = { nodes: DiagramNode[]; edges: { from: string; to: string; label: string | null }[]; mermaid: string };
export type Beat = { key: BeatKey; label: string; target_seconds: number; opening_line: string; talking_points: string[]; node_id?: string | null };
export type WalkStep = {
  node_id: string; what_happens: string; options: { name: string; note: string }[]; pick: string; pick_tools?: string[]; pick_why: string; backup: string; depends_on: string; pick_level: PickLevel;
};
export type ProofUsed = { id: number; name: string; kind: ProofKind; link: string | null; reason: string; match: "direct" | "partial" };
export type LoomScript = { proof: ProofUsed | null; proof_reason: string; positioning_line: string; name: string; beats: Beat[]; walkthrough: WalkStep[]; total_seconds: number };
export type ScreeningAnswer = { question: string; answer: string; source: "bank" | "new" | "needs_input"; bank_id: number | null };
export type LoomPitch = {
  job_analysis: JobAnalysis; workflow_diagram: Diagram; loom_script: LoomScript; tool_flexibility_line: string;
  cover_letter: string; screening_answers: ScreeningAnswer[]; pre_record_checklist: string[];
};

const text = (v: unknown, max = 2000) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
const list = (v: unknown, max = 12, each = 400) => (Array.isArray(v) ? v.map((x) => text(x, each)).filter(Boolean).slice(0, max) : []);
const leaked = (v: unknown) => typeof v === "string" && /<\/?parameter|<invoke/i.test(v);

/** Every piece of text in a value, so a check can't miss a field. The drawn Mermaid is left out because it is built from the labels, which are checked. */
function allStrings(v: unknown): string[] {
  if (typeof v === "string") return [v];
  if (Array.isArray(v)) return v.flatMap(allStrings);
  if (v && typeof v === "object") return Object.entries(v).filter(([k]) => k !== "mermaid").flatMap(([, x]) => allStrings(x));
  return [];
}

// ---------- Tools ----------

/** "Make.com" and "make" are the same tool; anything else has to match in full, so a doubtful name stays unknown rather than claimed. */
export const normaliseTool = (t: string) => t.toLowerCase().replace(/\.(com|io|ai)\b/g, "").replace(/[^a-z0-9]+/g, " ").trim();

export function toolLevel(tool: string, p: Pick<Profile, "strong_tools" | "familiar_tools">): ToolLevel {
  const n = normaliseTool(tool);
  if (p.strong_tools.some((t) => normaliseTool(t) === n)) return "strong";
  if (p.familiar_tools.some((t) => normaliseTool(t) === n)) return "familiar";
  return "not_listed";
}

/** Is this tool named in the text? "Make" counts only with its capital, because "I can make that work" is not the product. */
function namesTool(sentence: string, tool: string): boolean {
  const n = normaliseTool(tool);
  if (!n) return false;
  if (n === "make") return /(^|[^A-Za-z0-9])Make($|[^A-Za-z0-9])/.test(sentence.replace(/^\s*Make\s/, ""));   // "Make sure..." at the start of a sentence is the verb
  return new RegExp(`(^|[^a-z0-9])${n.replace(/ /g, "[^a-z0-9]+")}($|[^a-z0-9])`).test(sentence.toLowerCase());
}

/** A pick may name a tool inside a longer phrase ("Make.com's OCR module"), so look for each listed tool in it. */
export function pickLevel(pick: string, p: Pick<Profile, "strong_tools" | "familiar_tools">): ToolLevel {
  if (p.strong_tools.some((t) => namesTool(pick, t))) return "strong";
  if (p.familiar_tools.some((t) => namesTool(pick, t))) return "familiar";
  return "not_listed";
}

/** How far a pick can be claimed: as far as the weakest product it relies on. A pick naming no product is a general approach. */
export function pickToolsLevel(pick: string, tools: string[], p: Pick<Profile, "strong_tools" | "familiar_tools">): PickLevel {
  if (!tools.length) { const named = pickLevel(pick, p); return named === "not_listed" ? "general" : named; }
  const levels = tools.map((t) => toolLevel(t, p));
  return levels.includes("not_listed") ? "not_listed" : levels.includes("familiar") ? "familiar" : "strong";
}

export function sortTools(mentioned: string[], p: Profile): JobAnalysis["tools"] {
  const out: JobAnalysis["tools"] = { known_well: [], less_experienced: [], unknown: [] };
  for (const t of mentioned) {
    const bucket = { strong: out.known_well, familiar: out.less_experienced, not_listed: out.unknown }[toolLevel(t, p)];
    if (!bucket.some((x) => normaliseTool(x) === normaliseTool(t))) bucket.push(t);
  }
  return out;
}

// ---------- Claims ----------

const NUMBER = /(?<![A-Za-z0-9])\d+(?:[.,]\d+)*(?![A-Za-z0-9])/g;
const YEARS = /\b(?:one|two|three|four|five|six|seven|eight|nine|ten|\d+)\+?\s*(?:years?|yrs?)\b/gi;
const BOASTS = /\b(foremost|world[- ]class|best[- ]in[- ]class|industry[- ]leading|top[- ]rated|award[- ]winning|guru|rockstar|unrivalled)\b/i;
const SELF_EXPERT = /\bI(?:'m| am)\b[^.!?]{0,40}\b(expert|specialist)\b|\b(expert|specialist) in\b/i;
const CREDENTIAL = /\b(certified|accredited|official partner|partnered with|partnership)\b/i;
const COMPLIANT = /\b(?:I'll|I will|I'd|we'll|it'll|it will|it's|it is|this is|this will|that'll|that's|will be|would be)\b[^.!?]{0,30}\b(?:gdpr|ico)[- ]compliant\b|\bfully compliant\b|\bguarantee/i;
const SEEMS_BUILT = /\balready (?:built|running|live|working)\b|\bworking system\b|\bfully built\b|\bbuilt this for you\b|\bI(?:'ve| have) built this\b|\bhere'?s the system\b|\bthe system I built\b/i;
const PAST_WORK = /\b(?:I|I've|I have|we|we've)\s+(?:(?:recently|just|also|previously|actually)\s+)*(?:built|worked on|was (?:recently |just )?working on|delivered|shipped|implemented|developed|created|helped)\b/i;
const CLIENT_WORK = /\b(?:my clients?|a client of mine|past clients?|previous clients?|for a client|client work)\b/i;
const RECENTLY = /\b(?:recently|lately|just finished|just built|was just|last (?:week|month))\b/i;
const NOTICED = /\b(?:noticed|saw|see|looks like)\b[^.!?]{0,40}\b(?:posted|jobs|hired|hires|history)\b/i;

export function isRecent(date: string | null, today: string): boolean {
  if (!date) return false;
  const days = (Date.parse(today) - Date.parse(date)) / 86_400_000;
  return days >= 0 && days <= RECENT_DAYS;
}
export const usableProof = (items: ProofItem[]) => items.filter((p) => text(p.one_line));

const NOT_A_NAME = new Set(["the", "a", "an", "my", "our", "new"]);
/** The ways a real client's name could be said. Real clients are "a client" in anything a prospect sees or hears, whichever project is being used as proof. */
function clientNames(item: ProofItem): string[] {
  const words = item.name.toLowerCase().split(/\s+/).filter(Boolean);
  return [...new Set([item.name.toLowerCase(), words.slice(0, 2).join(" "), ...(NOT_A_NAME.has(words[0]) ? [] : [words[0]])])];
}
export function clientNameProblems(where: string, value: unknown, proof: ProofItem[]): string[] {
  const said = allStrings(value).join(" \n ").toLowerCase();
  return proof.filter((p) => p.kind === "client")
    .filter((p) => clientNames(p).some((n) => new RegExp(`(^|[^a-z0-9])${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+")}($|[^a-z0-9])`).test(said)))
    .map((p) => `${where}: names a real client (${p.name}); say "a client" instead`);
}

/** Everything the AI may draw facts from. A number, a length of time or a credential outside this was made up. */
function sourceText(c: PitchContext, proof: ProofItem | null): string {
  const { profile: p, inputs: i } = c;
  return [c.jobText, i.budget, i.client_info, i.screening_questions.join(" "), p.positioning_line, p.facts.join(" "), p.preferred_defaults,
    p.portfolio_links.map((l) => l.label).join(" "), c.bank.map((b) => b.answer).join(" "),
    proof ? [proof.name, proof.one_line, proof.problem_solved, proof.tools.join(" "), proof.results, proof.notes].filter(Boolean).join(" ") : ""].join(" ").toLowerCase();
}
const digitsOf = (s: string) => new Set((s.match(NUMBER) ?? []).map((n) => n.replace(/,/g, "")));

/** Claims in this text that its sources don't back: numbers, lengths of time, credentials, boasts, compliance promises, a diagram described as built. */
export function claimProblems(where: string, value: unknown, source: string, jobText: string): string[] {
  const bad = new Set<string>();
  const known = digitsOf(source), job = jobText.toLowerCase();
  for (const s of allStrings(value)) {
    if (leaked(s)) bad.add(`${where}: broken formatting in the reply`);
    for (const n of s.match(NUMBER) ?? []) if (!known.has(n.replace(/,/g, ""))) bad.add(`${where}: uses the number ${n}, which is not in your data`);
    for (const y of s.match(YEARS) ?? []) if (!source.includes(y.toLowerCase())) bad.add(`${where}: says "${y}", which is not in your data`);
    const boast = s.match(BOASTS)?.[0];
    if (boast && !job.includes(boast.toLowerCase())) bad.add(`${where}: boasts ("${boast}")`);
    if (SELF_EXPERT.test(s)) bad.add(`${where}: calls the consultant an expert or specialist`);
    const cred = s.match(CREDENTIAL)?.[0];
    if (cred && !source.includes(cred.toLowerCase())) bad.add(`${where}: claims "${cred}", which is not in your data`);
    if (COMPLIANT.test(s)) bad.add(`${where}: promises compliance; say it would be designed with UK GDPR in mind`);
    // "a sketched plan, not a working system" is the honest thing to say, so a negated phrase doesn't count.
    if (SEEMS_BUILT.test(s.replace(/\b(?:not|isn't|isnt|aren't|never|hasn't|nothing(?: is)?)\b[^.!?]{0,40}/gi, " "))) bad.add(`${where}: presents the diagram as already built`);
    if (containsContactDetails(s)) bad.add(`${where}: contains an email address or phone number`);
  }
  return [...bad];
}

// ---------- Job analysis ----------

const PERSONAL_DATA = /\bu?k?\s?gdpr\b|\bdata protection\b|\bpersonal (?:data|details|information)\b|\bpatients?\b|\bmedical\b|\bhealth records?\b|\bcustomer (?:data|records)\b/i;

export function budgetNote(raw: any, rates: Rates): { note: string | null; flag: Flag | null } {
  const amount = Number(raw?.amount);
  if (!raw || !Number.isFinite(amount) || amount <= 0) return { note: null, flag: null };
  const cur = String(raw.currency ?? "").toUpperCase().replace("$", "USD").replace("£", "GBP");
  const money = `${cur === "USD" ? "$" : cur === "GBP" ? "£" : `${cur} `}${amount}`;
  if (raw.unit !== "hourly") return { note: `Budget stated as ${money} fixed: compare it with Plan and price before you pitch.`, flag: null };
  const gbp = cur === "GBP" ? amount : cur === "USD" && rates.usd_to_gbp ? amount * rates.usd_to_gbp : null;
  if (gbp === null) return { note: `Budget stated as ${money}/hr. Could not compare it with your rate.`, flag: null };
  const rounded = Math.round(gbp), rate = rates.hourly_rate_gbp;
  if (gbp < rate) return { note: null, flag: { type: "budget_mismatch", note: `${money}/hr is about £${rounded}/hr, below your £${rate}/hr rate.` } };
  return { note: `${money}/hr is about £${rounded}/hr, at or above your £${rate}/hr rate.`, flag: null };
}

function finishAnalysis(raw: any, c: PitchContext): JobAnalysis {
  const flags: Flag[] = (Array.isArray(raw?.flags) ? raw.flags : [])
    .filter((f: any) => text(f?.note)).map((f: any) => ({ type: ["personal_data", "vague_scope", "budget_mismatch", "other"].includes(f.type) ? f.type : "other", note: text(f.note, 500) }));
  const money = budgetNote(raw?.budget, c.rates);
  const merged = flags.filter((f) => f.type !== "budget_mismatch" || !money.note);
  if (money.flag) { merged.splice(0, merged.length, ...merged.filter((f) => f.type !== "budget_mismatch")); merged.push(money.flag); }
  const dpa = "A data processing agreement comes first, before any of their customers' personal data is handled.";
  const pd = merged.find((f) => f.type === "personal_data");
  if (pd) { if (!/data processing agreement/i.test(pd.note)) pd.note = `${pd.note} ${dpa}`; }
  else if (PERSONAL_DATA.test(c.jobText)) merged.unshift({ type: "personal_data", note: `The post points to personal data or compliance work (UK GDPR). ${dpa}` });
  const tools = sortTools(list(raw?.tools_mentioned, 20, 60), c.profile);
  const missing = list(raw?.missing).filter((m) => !/\bportfolio\b|\bclient(?:'s)? (?:first )?name\b|\bname of the (?:person|client|poster)\b/i.test(m));   // work is shown locally, so no link is not a gap; nor is a missing name
  if (tools.unknown.length) missing.push(`Not on either of your tool lists, so left out of the tool line: ${tools.unknown.join(", ")}. Add them to your profile if you know them.`);
  if (!c.profile.positioning_line) missing.push("No positioning line in your profile, so the hook has none.");
  return {
    core_need: text(raw?.core_need, 400), business_outcome: text(raw?.business_outcome, 400), tools,
    assumptions: list(raw?.assumptions), open_questions: list(raw?.open_questions), flags: merged, missing, budget_note: money.note,
  };
}
const analysisProblems = (a: JobAnalysis) => [!a.core_need && "job_analysis: no core need", !a.business_outcome && "job_analysis: no business outcome"].filter(Boolean) as string[];

// ---------- Diagram ----------

const label = (s: unknown) => text(s, 60).replace(/["[\]{}()<>|#;`\\]/g, "").replace(/\s+/g, " ").trim();

/** The Mermaid is built here from checked nodes and edges, so a reply can't produce a diagram that won't draw. */
export function buildMermaid(nodes: DiagramNode[], edges: Diagram["edges"]): string {
  return ["flowchart LR", ...nodes.map((n) => `  ${n.id}["${n.label}"]`),
    ...edges.map((e) => `  ${e.from} ${e.label ? `-->|"${e.label}"|` : "-->"} ${e.to}`)].join("\n");
}

function finishDiagram(raw: any): Diagram {
  const nodes: DiagramNode[] = (Array.isArray(raw?.nodes) ? raw.nodes : []).map((n: any) => ({ id: text(n?.id, 12).replace(/\W/g, ""), label: label(n?.label) }));
  const edges: Diagram["edges"] = (Array.isArray(raw?.edges) ? raw.edges : []).map((e: any) => ({ from: text(e?.from, 12).replace(/\W/g, ""), to: text(e?.to, 12).replace(/\W/g, ""), label: label(e?.label) || null }));
  return { nodes, edges, mermaid: buildMermaid(nodes, edges) };
}

export function diagramProblems(d: Diagram): string[] {
  const bad: string[] = [];
  if (d.nodes.length < NODES_MIN || d.nodes.length > NODES_MAX) bad.push(`workflow_diagram: has ${d.nodes.length} steps; it needs ${NODES_MIN} to ${NODES_MAX}`);
  const ids = new Set(d.nodes.map((n) => n.id));
  if (ids.size !== d.nodes.length || d.nodes.some((n) => !/^[A-Za-z]\w*$/.test(n.id) || /^end$/i.test(n.id))) bad.push("workflow_diagram: node ids must be unique, like S1 and S2");
  if (d.nodes.some((n) => !n.label || n.label.length > 40)) bad.push("workflow_diagram: every step needs a short label");
  if (!d.edges.length || d.edges.some((e) => !ids.has(e.from) || !ids.has(e.to))) bad.push("workflow_diagram: edges must join its own steps");
  const joined = new Set(d.edges.flatMap((e) => [e.from, e.to]));
  if (d.nodes.some((n) => !joined.has(n.id))) bad.push("workflow_diagram: a step is not joined to anything");
  return bad;
}

/** Node ids in Mermaid the owner may have edited, so the page can say when the walkthrough no longer matches. */
export function mermaidNodeIds(code: string): string[] {
  const ids = new Set<string>();
  for (const m of code.matchAll(/(?:^|[\s;>|-])([A-Za-z]\w*)\s*(?:\[|\(|\{)/gm)) if (!/^(flowchart|graph|subgraph)$/i.test(m[1])) ids.add(m[1]);
  return [...ids];
}
export function walkthroughMismatch(code: string, steps: { node_id: string }[]): string[] {
  const inCode = mermaidNodeIds(code), inSteps = steps.map((s) => s.node_id);
  return [...inCode.filter((i) => !inSteps.includes(i)).map((i) => `${i} is in the diagram but not the walkthrough`), ...inSteps.filter((i) => !inCode.includes(i)).map((i) => `${i} is in the walkthrough but not the diagram`)];
}

// ---------- Script ----------

function finishScript(raw: any, c: PitchContext): LoomScript {
  const chosen = c.proof.find((p) => p.id === Number(raw?.proof_id)) ?? null;
  const beats: Beat[] = [];
  for (const key of BEATS) {
    const b = (Array.isArray(raw?.beats) ? raw.beats : []).find((x: any) => x?.key === key);
    if (!chosen && (key === "relevance_bridge" || key === "proof_drop")) continue;
    if (!b) continue;
    const beat: Beat = { key, label: BEAT_LABELS[key], target_seconds: Math.round(Number(b.target_seconds) || 0), opening_line: text(b.opening_line, 400), talking_points: key === "tool_flexibility" ? [] : list(b.talking_points, 8) };   // the tool line itself is shown under this beat
    if (key === "proof_drop") beat.node_id = text(b.node_id, 12) || null;
    beats.push(beat);
  }
  if (!chosen) beats.splice(Math.min(1, beats.length), 0, { key: "relevance_bridge", label: BEAT_LABELS.relevance_bridge, target_seconds: 3, opening_line: GENERAL_LINE, talking_points: [] });
  const walkthrough: WalkStep[] = (Array.isArray(raw?.walkthrough) ? raw.walkthrough : []).map((s: any) => ({
    node_id: text(s?.node_id, 12), what_happens: text(s?.what_happens, 500),
    options: (Array.isArray(s?.options) ? s.options : []).map((o: any) => ({ name: text(o?.name, 80), note: text(o?.note, 300) })).filter((o: any) => o.name).slice(0, 3),
    pick: text(s?.pick, 80), pick_tools: list(s?.pick_tools, 6, 60), pick_why: text(s?.pick_why, 500), backup: text(s?.backup, 80), depends_on: text(s?.depends_on, 400),
    pick_level: pickToolsLevel(text(s?.pick, 80), list(s?.pick_tools, 6, 60), c.profile),
  }));
  return {
    proof: chosen ? { id: chosen.id, name: chosen.name, kind: chosen.kind, link: chosen.link, reason: text(raw?.proof_reason, 400), match: raw?.proof_match === "direct" ? "direct" : "partial" } : null,
    proof_reason: text(raw?.proof_reason, 400), positioning_line: c.profile.positioning_line, name: c.profile.name,
    beats, walkthrough, total_seconds: beats.reduce((n, b) => n + b.target_seconds, 0),
  };
}

const beatText = (b: Beat | undefined) => (b ? [b.opening_line, ...b.talking_points].join(" ") : "");
const firstWords = (name: string) => name.split(/\s+/).slice(0, 2).join(" ").toLowerCase();

export function scriptProblems(s: LoomScript, d: Diagram, c: PitchContext, flags: Flag[]): string[] {
  const bad: string[] = [];
  const beat = (k: BeatKey) => s.beats.find((b) => b.key === k);
  const required: BeatKey[] = ["hook", "sketch", "walkthrough", "tool_flexibility", "maintainability", "extra_proof", "long_term", "cta"];
  for (const k of required) if (!beat(k)?.opening_line) bad.push(`loom_script: the ${k} beat is missing`);
  if (s.total_seconds < SCRIPT_MIN_SECONDS || s.total_seconds > SCRIPT_MAX_SECONDS) bad.push(`loom_script: totals ${s.total_seconds} seconds; it must be ${SCRIPT_MIN_SECONDS} to ${SCRIPT_MAX_SECONDS}`);
  const walkBeat = beat("walkthrough");
  if (walkBeat && walkBeat.target_seconds < s.walkthrough.length * SECONDS_PER_STEP) bad.push(`loom_script: the walkthrough needs at least ${SECONDS_PER_STEP} seconds per step`);
  for (const b of s.beats) if (/\b(?:tool_flexibility|job_analysis|workflow_diagram|loom_script|proof_id|field)\b|\bS\d\b/.test(beatText(b))) bad.push(`loom_script: the ${b.key} beat mentions an internal label; talk about steps in plain words`);
  const backstage = /\b(?:strong|familiar|tool) lists?\b|\bmy (?:lists?|profile)\b|\bproof library\b/i;
  for (const x of [...s.beats.map(beatText), ...s.walkthrough.map((w) => allStrings(w).join(" "))]) if (backstage.test(x)) { bad.push(`loom_script: says "${x.match(backstage)![0]}" aloud; the client doesn't know about your lists`); break; }
  const excuse = /\b(?:don't|do not|haven't|have no|no)\b[^.!?]{0,30}\b(?:portfolio|links?|examples?|experience)\b/i;
  if (excuse.test(beatText(beat("extra_proof")))) bad.push("loom_script: the extra proof beat points out something you lack; just say what you can show");
  if (!/\bsketch/i.test(beatText(beat("sketch")))) bad.push("loom_script: the sketch beat must say it was sketched for them");

  const ids = d.nodes.map((n) => n.id);
  if (s.walkthrough.map((w) => w.node_id).join() !== ids.join()) bad.push("loom_script: the walkthrough needs one entry per diagram step, in order");
  for (const w of s.walkthrough) {
    // Wording can differ a little between the list and the pick ("Webhook" and "Webhook from the scanner"), so match loosely. What matters is that there is a choice, a pick and a different fallback.
    const same = (x: string, y: string) => { const p = normaliseTool(x), q = normaliseTool(y); return !!p && !!q && (p.includes(q) || q.includes(p)); };
    if (w.options.length < 2) bad.push(`loom_script: step ${w.node_id} needs 2 or 3 options`);
    if (!w.options.some((o) => same(o.name, w.pick))) bad.push(`loom_script: step ${w.node_id}'s pick is not one of its options`);
    if (!w.backup || same(w.backup, w.pick)) bad.push(`loom_script: step ${w.node_id}'s backup must be a different option`);
    if (!w.what_happens || !w.pick_why || !w.depends_on) bad.push(`loom_script: step ${w.node_id} is incomplete`);
    // A sentence about a tool that is on the owner's lists is true ("I know the Google APIs well"), even when the pick itself is not listed.
    const claimsUse = /\bI(?:'ve| have)? (?:used|use|always|tend to|usually)\b|\bin my experience\b|\bcomfortable with\b|\bfamiliar with\b|\bI know\b/i;
    if (w.pick_level === "not_listed" && w.pick_why.split(/[.!?](?:\s|$)/).some((t) => claimsUse.test(t) && pickLevel(t, c.profile) === "not_listed")) bad.push(`loom_script: step ${w.node_id} implies experience with ${w.pick}, which is not on your tool lists`);
  }

  const proof = c.proof.find((p) => p.id === s.proof?.id) ?? null;
  const mayClaim = new Set<BeatKey>(proof ? ["relevance_bridge", "proof_drop", "extra_proof"] : ["extra_proof"]);
  for (const b of s.beats) {
    const t = beatText(b);
    if (!mayClaim.has(b.key)) {
      if (PAST_WORK.test(t)) bad.push(`loom_script: the ${b.key} beat claims past work outside the proof beats`);
      if (RECENTLY.test(t)) bad.push(`loom_script: the ${b.key} beat says "recently" without proof`);
    }
    if (CLIENT_WORK.test(t) && proof?.kind !== "client") bad.push(`loom_script: the ${b.key} beat mentions client work with no client proof behind it`);
  }
  for (const w of s.walkthrough) if (PAST_WORK.test(allStrings(w).join(" "))) bad.push(`loom_script: step ${w.node_id} claims past work; that belongs in the proof drop`);
  if (PAST_WORK.test(beatText(beat("extra_proof"))) && !/\b(demo|portfolio|template)/i.test(beatText(beat("extra_proof")))) bad.push("loom_script: extra proof claims past work that is not a demo or portfolio item");

  if (proof) {
    const claim = `${beatText(beat("relevance_bridge"))} ${beatText(beat("proof_drop"))}`;
    if (!beat("relevance_bridge") && !beat("proof_drop")) bad.push("loom_script: a proof item was chosen but not used");
    if (proof.kind === "client") { if (!/\bclient\b/i.test(claim)) bad.push("loom_script: this is real client work, so the proof beats must say \"a client\""); }
    else if (!claim.toLowerCase().includes(firstWords(proof.name))) bad.push(`loom_script: the proof beats must name ${proof.name}`);
    if (proof.kind === "demo" && !/\bdemo\b/i.test(claim)) bad.push(`loom_script: ${proof.name} is a demo and must be called one`);
    if (proof.kind === "internal_tool" && !/\b(own|internal|my CRM)\b/i.test(claim)) bad.push(`loom_script: ${proof.name} is your own tool and must be described that way`);
    if (RECENTLY.test(claim) && !isRecent(proof.last_worked_on, c.today)) bad.push(`loom_script: says "recently", but ${proof.name} has no recent date`);
    const drop = beat("proof_drop");
    if (drop && !ids.includes(String(drop.node_id))) bad.push("loom_script: the proof drop must be tied to a diagram step");
  }
  if (!c.inputs.client_info && NOTICED.test(s.beats.map(beatText).join(" "))) bad.push("loom_script: refers to their job history, but no client info was given");
  if (flags.some((f) => f.type === "personal_data") && !/data processing agreement|\bDPA\b/i.test(s.beats.map(beatText).join(" "))) bad.push("loom_script: personal data was flagged, so a talking point must say a data processing agreement comes first");
  return bad;
}

// ---------- Tool line ----------

export function toolLineProblems(raw: any, tools: JobAnalysis["tools"], p: Profile): string[] {
  const bad: string[] = [];
  const line = text(raw?.line, 500);
  if (!line) return ["tool_flexibility_line: empty"];
  if ((line.match(/[.!?](?:\s|$)/g) ?? []).length > 2) bad.push("tool_flexibility_line: keep it to one or two sentences");
  for (const t of list(raw?.strong_named, 20, 60)) if (toolLevel(t, p) !== "strong") bad.push(`tool_flexibility_line: names ${t} as a strength, but it is not on your strong list`);
  for (const t of tools.unknown) if (namesTool(line, t)) bad.push(`tool_flexibility_line: names ${t}, which is not on your tool lists`);
  for (const t of [...tools.known_well, ...tools.less_experienced]) if (!namesTool(line, t)) bad.push(`tool_flexibility_line: must cover ${t}, which they mentioned`);
  for (const clause of line.split(/[.;!?](?:\s|$)|\bbut\b/i)) {   // a full stop only ends a sentence before a space: "Make.com" is one word
    if (!/\b(?:know|strong|strongest|confident|expert|comfortable|specialis\w*|go-to|master\w*)\b/i.test(clause)) continue;
    for (const t of [...tools.less_experienced, ...tools.unknown]) if (namesTool(clause, t)) bad.push(`tool_flexibility_line: claims strength in ${t}, which is not on your strong list`);
  }
  return bad;
}

// ---------- Cover letter ----------

export function fillLoomCover(template: string, blanks: { domain: string; flow: string }, shortPositioning: string, clientName: string | null): string {
  const name = cleanName(clientName);
  return template.trim().replace("{client_greeting}", name ? ` ${name}` : "").replace("{domain}", blanks.domain.trim())
    .replace("{short_positioning}", shortPositioning.trim().replace(/[.\s]+$/, "") || "build these kinds of systems").replace("{flow}", blanks.flow.trim());
}

/** The length the client will see: the placeholder is much shorter than a real Loom link, so counting it would flatter the letter. */
export function coverLength(letter: string, url?: string | null): number {
  return letter.split(LOOM_PLACEHOLDER).join(url || "x".repeat(LOOM_LINK_LENGTH)).length;
}
export const fillLoomLink = (letter: string, url: string) => letter.split(LOOM_PLACEHOLDER).join(url);

function coverProblems(raw: any, letter: string): string[] {
  const bad: string[] = [];
  if (!text(raw?.domain) || text(raw?.domain).length > 24) bad.push("cover_letter: domain must be 1 to 24 characters");
  if (!text(raw?.flow) || text(raw?.flow).length > 30) bad.push("cover_letter: flow must be 1 to 30 characters");
  if (!letter.includes(LOOM_PLACEHOLDER)) bad.push("cover_letter: the Loom link placeholder is missing");
  if (coverLength(letter) > COVER_MAX) bad.push(`cover_letter: ${coverLength(letter)} characters with a real link; the limit is ${COVER_MAX}`);
  return bad;
}

/** A Loom share link, or null. The query string is dropped: it only adds length and tracking. */
export function cleanLoomUrl(raw: unknown): string | null {
  try {
    const u = new URL(String(raw ?? "").trim());
    if (u.protocol !== "https:" || !/^(www\.)?loom\.com$/.test(u.hostname)) return null;
    const m = u.pathname.match(/^\/share\/([A-Za-z0-9-]{8,120})\/?$/);
    return m ? `https://www.loom.com/share/${m[1]}` : null;
  } catch { return null; }
}

// ---------- Screening answers ----------

function finishScreening(raw: any, c: PitchContext): ScreeningAnswer[] {
  const got: any[] = Array.isArray(raw) ? raw : [];
  return c.inputs.screening_questions.map((question, i) => {
    const r = got[i];
    const bank = r?.source === "bank" ? c.bank.find((b) => b.id === Number(r.bank_id)) : undefined;
    if (bank) return { question, answer: bank.answer, source: "bank", bank_id: bank.id };   // placed word for word
    const answer = r?.source === "new" ? text(r.answer, 3000) : "";
    return answer ? { question, answer, source: "new", bank_id: null } : { question, answer: "", source: "needs_input", bank_id: null };
  });
}
function screeningProblems(answers: ScreeningAnswer[], c: PitchContext): string[] {
  const names = c.proof.filter((p) => p.kind !== "client").map((p) => firstWords(p.name));
  const hasClient = c.proof.some((p) => p.kind === "client");
  return answers.filter((a) => a.source === "new" && PAST_WORK.test(a.answer) && !names.some((n) => a.answer.toLowerCase().includes(n)) && !(hasClient && /\bclient\b/i.test(a.answer)))
    .map((a) => `screening_answers: "${a.question.slice(0, 40)}" claims past work that isn't in your proof library`);
}

// ---------- Checklist ----------

function finishChecklist(raw: unknown, script: LoomScript | null, p: Profile): string[] {
  const out = ["This workflow diagram, on screen"];
  if (script?.proof) out.push(script.proof.kind === "client"
    ? `${script.proof.name}, open locally, with its name and any real customer data kept off screen`
    : `${script.proof.name}, open locally${script.proof.link ? ` or at ${script.proof.link}` : ""}`);
  for (const l of p.portfolio_links) out.push(`${l.label}: ${l.url}`);
  const proofWords = script?.proof ? firstWords(script.proof.name) : null;
  return [...out, ...list(raw, 4, 160).filter((t) => !proofWords || !t.toLowerCase().includes(proofWords))];
}

// ---------- Putting it together ----------

/** Finishes one section from the AI's reply and lists what's wrong with it. Only that section is checked, so the owner's edits elsewhere are never refused. */
export function finishSection(section: Section, raw: any, current: Partial<LoomPitch>, c: PitchContext): { value: unknown; problems: string[]; extra?: Partial<LoomPitch> } {
  const proofFor = (s: LoomScript | undefined) => c.proof.find((p) => p.id === s?.proof?.id) ?? null;
  const check = (where: string, v: unknown, proof: ProofItem | null) => claimProblems(where, v, sourceText(c, proof), c.jobText);
  switch (section) {
    case "job_analysis": {
      const value = finishAnalysis(raw, c);
      const { flags: _f, missing: _m, budget_note: _b, ...written } = value;
      return { value, problems: [...analysisProblems(value), ...check(section, written, proofFor(current.loom_script))] };
    }
    case "workflow_diagram": {
      const value = finishDiagram(raw);
      return { value, problems: [...diagramProblems(value), ...check(section, value.nodes, null), ...clientNameProblems(section, value.nodes, c.proof)] };
    }
    case "loom_script": {
      const value = finishScript(raw, c);
      const diagram = current.workflow_diagram;
      const { positioning_line: _p, name: _n, ...written } = value;
      return { value, problems: [...(diagram ? scriptProblems(value, diagram, c, current.job_analysis?.flags ?? []) : ["loom_script: no diagram yet"]), ...check(section, written, proofFor(value)), ...clientNameProblems(section, [value.beats, value.walkthrough], c.proof)] };
    }
    case "tool_flexibility_line": {
      const tools = current.job_analysis?.tools ?? { known_well: [], less_experienced: [], unknown: [] };
      return { value: text(raw?.line, 500), problems: [...toolLineProblems(raw, tools, c.profile), ...check(section, text(raw?.line, 500), proofFor(current.loom_script)), ...clientNameProblems(section, text(raw?.line, 500), c.proof)] };
    }
    case "cover_letter": {
      const value = fillLoomCover(c.coverTemplate, { domain: text(raw?.domain, 80), flow: text(raw?.flow, 80) }, c.profile.short_positioning, c.inputs.client_name);
      return { value, problems: [...coverProblems(raw, value), ...check(section, [text(raw?.domain, 80), text(raw?.flow, 80)], null), ...clientNameProblems(section, [text(raw?.domain, 80), text(raw?.flow, 80)], c.proof)] };
    }
    case "screening_answers": {
      const value = finishScreening(raw, c);
      const fresh = value.filter((a) => a.source === "new").map((a) => a.answer);
      return { value, problems: [...screeningProblems(value, c), ...check(section, fresh, proofFor(current.loom_script)), ...clientNameProblems(section, fresh, c.proof)] };
    }
    case "pre_record_checklist":
      return { value: finishChecklist(raw, current.loom_script ?? null, c.profile), problems: check(section, list(raw, 4, 160), proofFor(current.loom_script)) };
  }
}

/** What the script's choices mean for the analysis: no proof, weak proof, or picks the owner should check before saying them aloud. */
export function withScriptNotes(a: JobAnalysis, script: LoomScript): JobAnalysis {
  const notes: string[] = [];
  if (!script.proof) notes.push(`Nothing in your proof library is relevant, so the relevance bridge is the general line and there is no proof drop. ${script.proof_reason}`.trim());
  else if (script.proof.match === "partial") notes.push(`${script.proof.name} is only a partial match, not the same core task. ${script.proof_reason}`.trim());
  const unlisted = [...new Set(script.walkthrough.filter((w) => w.pick_level === "not_listed").flatMap((w) => w.pick_tools?.length ? w.pick_tools : [w.pick]))];
  if (unlisted.length) notes.push(`Script picks not on your tool lists, so check you're happy to say them: ${unlisted.join(", ")}.`);
  const auto = /^(Nothing in your proof library|.+ is only a partial match|Script picks not on your tool lists)/;
  return { ...a, missing: [...notes, ...a.missing.filter((m) => !auto.test(m) && !/\bproof\b/i.test(m))] };
}

/** Finishes a whole reply, in the order each part depends on the last. */
export function finishPitch(raw: any, c: PitchContext): { pitch: LoomPitch; problems: string[] } {
  const pitch: Partial<LoomPitch> = {};
  const problems: string[] = [];
  const reply: Record<Section, unknown> = {
    job_analysis: raw?.job_analysis, workflow_diagram: raw?.workflow_diagram, loom_script: raw?.loom_script, tool_flexibility_line: raw?.tool_flexibility,
    cover_letter: raw?.cover_letter, screening_answers: raw?.screening_answers, pre_record_checklist: raw?.pre_record_checklist,
  };
  for (const s of SECTIONS) {
    const r = finishSection(s, reply[s], pitch, c);
    (pitch as any)[s] = r.value;
    problems.push(...r.problems);
  }
  pitch.job_analysis = withScriptNotes(pitch.job_analysis!, pitch.loom_script!);
  return { pitch: pitch as LoomPitch, problems };
}

// ---------- The owner's edits ----------

/** The owner may write what they like in their own pitch: this only keeps the shape, and refuses contact details. */
export function cleanEdit(section: Section, raw: unknown, current: LoomPitch): { value?: unknown; error?: string } {
  if (containsContactDetails(allStrings(raw).join(" "))) return { error: "Leave email addresses and phone numbers out of the pitch." };
  switch (section) {
    case "tool_flexibility_line": case "cover_letter": {
      if (typeof raw !== "string" || !raw.trim()) return { error: "That section can't be empty." };
      return { value: raw.replace(/\r/g, "").trim().slice(0, 3000) };
    }
    case "pre_record_checklist": return { value: list(raw, 20, 300) };
    case "workflow_diagram": {
      const code = typeof (raw as any)?.mermaid === "string" ? (raw as any).mermaid.replace(/\r/g, "").slice(0, 8000) : "";
      if (!code.trim()) return { error: "The diagram can't be empty." };
      return { value: { ...current.workflow_diagram, mermaid: code } };
    }
    case "job_analysis": case "loom_script": case "screening_answers":
      if (!raw || typeof raw !== "object") return { error: "That could not be read." };
      return { value: raw };
  }
}

export function scriptToText(s: LoomScript, nodes: DiagramNode[], toolLine = ""): string {
  const name = (id: string | null | undefined) => nodes.find((n) => n.id === id)?.label ?? id ?? "";
  return s.beats.flatMap((b) => {
    const lines = [`${b.label.toUpperCase()} (about ${b.target_seconds}s)`, `Open with: ${b.opening_line}`, ...b.talking_points.map((t) => `- ${t}`)];
    if (b.key === "hook" && s.positioning_line) lines.splice(2, 0, `Then: ${s.name ? `I'm ${s.name}. ` : ""}${s.positioning_line}`);
    if (b.key === "walkthrough") for (const w of s.walkthrough) {
      lines.push("", `${name(w.node_id)}`, `  What happens: ${w.what_happens}`, `  Options: ${w.options.map((o) => `${o.name} (${o.note})`).join("; ")}`, `  My pick: ${w.pick}. ${w.pick_why}`, `  Backup: ${w.backup}`, `  Depends on: ${w.depends_on}`);
    }
    if (b.key === "tool_flexibility" && toolLine) lines.push(`Say: ${toolLine}`);
    if (b.key === "proof_drop") lines[0] += ` at step: ${name(b.node_id)}`;
    return [...lines, ""];
  }).join("\n").trim();
}

// ---------- Comparing Loom pitches with plain ones ----------

export type CompareRow = { pitch_mode: string; status: string; loom_url: string | null; loom_recorded_at: unknown };
export type ModeStats = { sent: number; viewed: number; replied: number; hired: number; replyRate: number | null };

/** A Loom pitch counts once it has a link. A plain proposal with a pitch pack Loom recorded fits neither group, so it is left out. */
export function comparePitches(rows: CompareRow[]): { loom: ModeStats; plain: ModeStats; enough: boolean } {
  const tally = (group: CompareRow[]): ModeStats => {
    const sent = group.filter((r) => r.status !== "Draft");
    const n = (...s: string[]) => sent.filter((r) => s.includes(r.status)).length;
    const replied = n("Replied", "Interview", "Won");
    return { sent: sent.length, viewed: n("Viewed", "Replied", "Interview", "Won"), replied, hired: n("Won"), replyRate: sent.length >= COMPARE_MIN_SENT ? Math.round((replied / sent.length) * 100) : null };
  };
  const loom = tally(rows.filter((r) => r.pitch_mode === "loom" && r.loom_url));
  const plain = tally(rows.filter((r) => r.pitch_mode === "plain" && !r.loom_recorded_at));
  return { loom, plain, enough: loom.sent >= COMPARE_MIN_SENT && plain.sent >= COMPARE_MIN_SENT };
}

// ---------- Seeding from portfolio/portfolio.md ----------

export type ParsedProof = { name: string; one_line: string; tools: string[]; results: string | null; notes: string | null };

/** Commas inside brackets belong to one tool ("Twilio SMS (switched off in demo mode, which is the default)"). */
export function splitTools(s: string): string[] {
  const out: string[] = [];
  let depth = 0, cur = "";
  for (const ch of s) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) { out.push(cur); cur = ""; } else cur += ch;
  }
  return [...out, cur].map((t) => t.replace(/\s*\([^)]*\)/g, "").replace(/\.$/, "").trim()).filter(Boolean);
}

/** Reads the "## " entries as written. Results that only say "demo" or "none claimed" stay blank: that field is for real numbers. */
export function parsePortfolio(md: string): ParsedProof[] {
  return md.replace(/<!--[\s\S]*?-->/g, "").split(/^## /m).slice(1).map((block) => {
    const [head, ...rest] = block.split("\n");
    const field = (k: string) => rest.find((l) => l.startsWith(`- ${k}:`))?.slice(k.length + 3).trim() ?? "";
    const result = field("Result");
    const extra = rest.filter((l) => l.startsWith("- ") && !/^- (Status|What it does|Tools|Result|Loom):/.test(l)).map((l) => l.slice(2).trim());
    return {
      name: head.split(":")[0].replace(/\s*\(demo\)\s*$/i, "").trim(),
      one_line: field("What it does"), tools: splitTools(field("Tools")),
      results: !result || /^(none claimed|demo only)/i.test(result) ? null : result,
      notes: [field("Status"), ...extra].filter(Boolean).join(" ") || null,
    };
  });
}
