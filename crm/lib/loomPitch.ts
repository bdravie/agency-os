// Writes a Loom pitch for one job. The AI drafts; loomPitchMath.ts sorts the tools, places the positioning, builds the diagram and the letter, and refuses anything unbacked.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { askStructured, upworkModel } from "./llm.ts";
import { withPositioning } from "./positioning.ts";
import { finishPitch, finishSection, isRecent, SECTIONS, withScriptNotes, type LoomPitch, type PitchContext, type Section } from "./loomPitchMath.ts";

const ROOT = path.resolve(process.cwd(), "..");
const read = (f: string) => readFile(path.join(ROOT, f), "utf8");

const str = { type: "string" } as const;
const strings = { type: "array", items: str } as const;

const ANALYSIS = {
  type: "object",
  properties: {
    core_need: str, business_outcome: str, tools_mentioned: strings,
    budget: { type: ["object", "null"], properties: { amount: { type: ["number", "null"] }, currency: { type: ["string", "null"] }, unit: { type: ["string", "null"], enum: ["hourly", "fixed", null] } } },
    assumptions: strings, open_questions: strings,
    flags: { type: "array", items: { type: "object", properties: { type: { type: "string", enum: ["personal_data", "vague_scope", "budget_mismatch", "other"] }, note: str }, required: ["type", "note"] } },
    missing: strings,
  },
  required: ["core_need", "business_outcome", "tools_mentioned", "budget", "assumptions", "open_questions", "flags", "missing"],
};
const DIAGRAM = {
  type: "object",
  properties: {
    nodes: { type: "array", minItems: 4, maxItems: 7, items: { type: "object", properties: { id: str, label: str }, required: ["id", "label"] } },
    edges: { type: "array", items: { type: "object", properties: { from: str, to: str, label: { type: ["string", "null"] } }, required: ["from", "to", "label"] } },
  },
  required: ["nodes", "edges"],
};
const SCRIPT = {
  type: "object",
  properties: {
    proof_id: { type: ["integer", "null"] }, proof_match: { type: ["string", "null"], enum: ["direct", "partial", null] }, proof_reason: str,
    beats: {
      type: "array",
      items: {
        type: "object",
        properties: {
          key: { type: "string", enum: ["hook", "relevance_bridge", "sketch", "walkthrough", "proof_drop", "tool_flexibility", "maintainability", "extra_proof", "long_term", "cta"] },
          target_seconds: { type: "integer" }, opening_line: str, talking_points: strings, node_id: { type: ["string", "null"] },
        },
        required: ["key", "target_seconds", "opening_line", "talking_points"],
      },
    },
    walkthrough: {
      type: "array",
      items: {
        type: "object",
        properties: {
          node_id: str, what_happens: str,
          options: { type: "array", minItems: 2, maxItems: 3, items: { type: "object", properties: { name: str, note: str }, required: ["name", "note"] } },
          pick: str, pick_tools: strings, pick_why: str, backup: str, depends_on: str,
        },
        required: ["node_id", "what_happens", "options", "pick", "pick_tools", "pick_why", "backup", "depends_on"],
      },
    },
  },
  required: ["proof_id", "proof_match", "proof_reason", "beats", "walkthrough"],
};
const TOOL_LINE = { type: "object", properties: { line: str, strong_named: strings, flexible_named: strings }, required: ["line", "strong_named", "flexible_named"] };
const COVER = { type: "object", properties: { domain: str, flow: str }, required: ["domain", "flow"] };
const SCREENING = {
  type: "array",
  items: { type: "object", properties: { source: { type: "string", enum: ["bank", "new", "needs_input"] }, bank_id: { type: ["integer", "null"] }, answer: str }, required: ["source", "bank_id", "answer"] },
};
const CHECKLIST = { type: "array", items: str, maxItems: 4 };

const ALL = {
  type: "object" as const,
  properties: { job_analysis: ANALYSIS, workflow_diagram: DIAGRAM, loom_script: SCRIPT, tool_flexibility: TOOL_LINE, cover_letter: COVER, screening_answers: SCREENING, pre_record_checklist: CHECKLIST },
  required: ["job_analysis", "workflow_diagram", "loom_script", "tool_flexibility", "cover_letter", "screening_answers", "pre_record_checklist"],
};

/** Each part as the model sees it when only that part is being rewritten. The diagram brings its walkthrough with it, since there is one entry per node. */
const PART_SCHEMA: Record<Section, Record<string, unknown>> = {
  job_analysis: { job_analysis: ANALYSIS }, workflow_diagram: { workflow_diagram: DIAGRAM, loom_script: SCRIPT }, loom_script: { loom_script: SCRIPT },
  tool_flexibility_line: { tool_flexibility: TOOL_LINE }, cover_letter: { cover_letter: COVER }, screening_answers: { screening_answers: SCREENING }, pre_record_checklist: { pre_record_checklist: CHECKLIST },
};
const PART_KEY: Record<Section, string> = {
  job_analysis: "job_analysis", workflow_diagram: "workflow_diagram", loom_script: "loom_script", tool_flexibility_line: "tool_flexibility",
  cover_letter: "cover_letter", screening_answers: "screening_answers", pre_record_checklist: "pre_record_checklist",
};

/** The data blocks. Only filled-in proof reaches the model, and each item says whether "recently" is true of it. */
function dataBlocks(c: PitchContext): string {
  const { profile: p, inputs: i } = c;
  const proof = c.proof.map((x) => [
    `[id ${x.id}] ${x.name} (kind: ${x.kind}; recent_ok: ${isRecent(x.last_worked_on, c.today) ? "yes" : "no"}${x.kind === "client" ? '; confidential: say "a client", never this name' : ""})`,
    `  What it is: ${x.one_line}`, x.problem_solved && `  Problem solved: ${x.problem_solved}`, x.tools.length && `  Tools: ${x.tools.join(", ")}`,
    x.results && `  Results: ${x.results}`, x.tags.length && `  Tags: ${x.tags.join(", ")}`, x.notes && `  Notes: ${x.notes}`,
  ].filter(Boolean).join("\n")).join("\n");
  const screening = i.screening_questions.length ? i.screening_questions.map((q, n) => `${n + 1}. ${q}`).join("\n") : "(none)";
  return [
    `JOB POST:\n${c.jobText}`,
    `CLIENT INFO:\nFirst name: ${i.client_name || "(not given)"}\nBudget typed in: ${i.budget || "(not given)"}\nOther info: ${i.client_info || "(none given)"}\nScreening questions:\n${screening}`,
    `PROFILE:\nName: ${p.name || "(not set)"}\nPreferred defaults: ${p.preferred_defaults || "(none)"}\nPortfolio links: ${p.portfolio_links.map((l) => l.label).join(", ") || "(none)"}\nFacts you may use:\n${p.facts.map((f) => `- ${f}`).join("\n") || "(none)"}`,
    `TOOL LISTS:\nStrong: ${p.strong_tools.join(", ") || "(none)"}\nFamiliar (less experienced): ${p.familiar_tools.join(", ") || "(none)"}`,
    `PROOF LIBRARY:\n${proof || "(empty: return proof_id null)"}`,
    `ANSWER BANK:\n${c.bank.map((b) => `[bank_id ${b.id}] (${b.category}) ${b.question}\n  ${b.answer}`).join("\n") || "(empty)"}`,
  ].join("\n\n");
}

/** The retry shows the refused draft, so a fix changes only what was wrong instead of writing something new with new problems. */
const refusal = (problems: string[], draft: unknown) => `\n\nYour last reply was refused for these reasons:\n${problems.map((p) => `- ${p}`).join("\n")}\n\nHere it is. Change only what is needed to fix those, keep everything else word for word, and send the whole result again:\n${JSON.stringify(draft)}`;
const failed = (problems: string[]) => new Error(`The AI's reply didn't pass the checks twice, so nothing was saved: ${problems.slice(0, 4).join("; ")}. Try again.`);

/** The whole pitch: one call, checked in code, with one retry that says what was wrong. */
export async function buildLoomPitch(c: PitchContext): Promise<LoomPitch> {
  const prompt = `${await withPositioning(await read("prompts/loom-pitch.md"))}\n\n${dataBlocks(c)}`;
  const ask = (extra = "") => askStructured<any>(prompt + extra, ALL, upworkModel(), 12000);
  const raw = await ask();
  let r = finishPitch(raw, c);
  if (r.problems.length) r = finishPitch(await ask(refusal(r.problems, raw)), c);
  if (r.problems.length) throw failed(r.problems);
  return r.pitch;
}

/** One section again, leaving the others (and the owner's edits to them) alone. Redoing the diagram also redoes the script, because the walkthrough follows its nodes. */
export async function rewriteSection(c: PitchContext, current: LoomPitch, section: Section): Promise<Partial<LoomPitch>> {
  const parts = section === "workflow_diagram" ? (["workflow_diagram", "loom_script"] as const) : [section];
  const schema = { type: "object" as const, properties: PART_SCHEMA[section], required: parts.map((s) => PART_KEY[s]) };
  const others = Object.fromEntries(SECTIONS.filter((s) => !(parts as readonly Section[]).includes(s)).map((s) => [s, current[s]]));
  const prompt = `${await withPositioning(await read("prompts/loom-pitch.md"))}\n\n${dataBlocks(c)}\n\n${await read("prompts/loom-pitch-section.md")}\n\nREWRITE: ${parts.join(" and ")}\n\nCURRENT PITCH:\n${JSON.stringify(others)}`;
  const finish = (raw: any) => {
    const merged: Partial<LoomPitch> = { ...current }, out: Partial<LoomPitch> = {}, problems: string[] = [];
    for (const s of parts) {
      const res = finishSection(s, raw?.[PART_KEY[s]], merged, c);
      (merged as any)[s] = res.value; (out as any)[s] = res.value;
      problems.push(...res.problems);
    }
    return { out, problems };
  };
  const ask = (extra = "") => askStructured<any>(prompt + extra, schema, upworkModel(), section === "workflow_diagram" || section === "loom_script" ? 9000 : 3000);
  const raw = await ask();
  let r = finish(raw);
  if (r.problems.length) r = finish(await ask(refusal(r.problems, raw)));
  if (r.problems.length) throw failed(r.problems);
  const script = r.out.loom_script ?? current.loom_script, analysis = r.out.job_analysis ?? current.job_analysis;
  if (script && analysis && (r.out.loom_script || r.out.job_analysis)) r.out.job_analysis = withScriptNotes(analysis, script);
  return r.out;
}
