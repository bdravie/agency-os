import { withPositioning } from "./positioning";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { parse } from "yaml";
import { askStructured } from "./llm";
import { audienceText, fillNiche, parseContentConfig, type ContentConfig } from "./contentConfigMath";
import { cleanHooks } from "./filmMath";
import { activeNiches, buildNicheTable } from "./nicheStatus";
import { freshProblems, staleHook, type FreshRules } from "./freshnessMath";

function getRoot(): string {
  if (existsSync(path.join(process.cwd(), "prompts"))) return process.cwd();
  const parent = path.resolve(process.cwd(), "..");
  if (existsSync(path.join(parent, "prompts"))) return parent;
  return process.cwd();
}

const S = { type: "string" } as const;
const prompt = (name: string) => readFile(path.join(getRoot(), "prompts", name), "utf8");

/** The `content:` settings in config/niches.yaml (posts per week, idea limit, who the videos are for). */
export async function loadContentConfig(): Promise<ContentConfig> {
  const y = parse(await readFile(path.join(getRoot(), "config/niches.yaml"), "utf8"));
  // With no content_niche set, the first active niche is used (the focus list now comes from each niche's status).
  return parseContentConfig(y?.content, activeNiches(buildNicheTable(y?.niches)), y?.niches);
}

/** prompts/video-ideas.md with {{NICHE}} filled from the content settings. Every content prompt starts from this guide. */
/** `audience` overrides the wording for one batch, for example one niche. */
export async function guide(audience?: string): Promise<string> {
  return fillNiche(await withPositioning(await prompt("video-ideas.md")), audience ?? audienceText(await loadContentConfig()));
}

export const CTA_TYPES = ["comment", "follow", "save", "dm"] as const;
export type Script = { hooks: string[]; favourite_hook: string; script: string; on_screen_text: string[]; caption: string; keyword: string; cta_type?: string; cta_line?: string };

/**
 * `evidence` is the WHAT HAS WORKED block (your best hooks and outlier structures, built and scrubbed in code by scriptItem.ts).
 * `fresh` (from freshness.ts) turns on the freshness check: a script, caption or favourite hook with a stock phrase or wording from an earlier post
 * is sent back with what was found, twice at most, and then refused.
 */
export async function writeScript(idea: string, notes?: string | null, evidence?: string | null, fresh?: { block: string; rules: FreshRules } | null): Promise<Script> {
  const notesBlock = notes && notes.trim()
    ? `\n\nROUGH NOTES / TRANSCRIPT TO REWRITE INTO SCRIPT:\n${notes.trim()}\n\nRewrite the rough notes above into the polished, high-performing 30-45 second spoken video script. Keep all the core insights, facts, and examples from the notes, but structure them into a tight spoken narrative.`
    : "";
  const evidenceBlock = evidence && evidence.trim() ? `\n\nWHAT HAS WORKED:\n${evidence.trim()}` : "";
  const text = `${await guide()}\n\n${await prompt("video-script.md")}${fresh ? `\n\n${fresh.block}` : ""}${evidenceBlock}\n\nIDEA: ${idea}${notesBlock}`;
  let problems: string[] = [];
  const found = new Set<string>();   // every problem so far, so a retry does not fix one and bring back another
  for (let attempt = 0; attempt < 3; attempt++) {
    const s = await askOnce(attempt === 0 ? text : `${text}\n\nYour earlier answers had these problems. Fix all of them and answer again in full:\n- ${[...found].join("\n- ")}`, fresh?.rules);
    problems = fresh ? freshProblems([{ name: "script", text: s.script }, { name: "caption", text: s.caption }, { name: "favourite hook", text: s.favourite_hook, hook: true }], fresh.rules) : [];
    if (!problems.length) return s;
    problems.forEach((p) => found.add(p));
  }
  throw new Error(`The AI's script did not pass the freshness checks, so nothing was saved: ${problems.join("; ")}. Try again, or write it yourself.`);
}

/** Room for the angle, five hooks, the script, the shot list and the caption, plus anything the model writes before it submits. 2,500 was cut off once the angle was added (15 Nov 2026). It is a ceiling, not a spend: only what is written is paid for. */
const SCRIPT_MAX_TOKENS = 5000;

async function askOnce(text: string, rules?: FreshRules): Promise<Script> {
  const s = await askStructured<Script>(text, {
    type: "object", required: ["expected_take", "angle", "hooks", "favourite_hook", "script", "on_screen_text", "cta_type", "cta_line", "caption", "keyword"],
    properties: { expected_take: S, angle: S, hooks: { type: "array", items: S }, favourite_hook: S, script: S, on_screen_text: { type: "array", items: S }, cta_type: { type: "string", enum: [...CTA_TYPES] }, cta_line: S, caption: S, keyword: S },
  }, "sonnet", SCRIPT_MAX_TOKENS);
  // Stock openers, over-long hooks and (with the freshness rules) hooks that use a stock phrase or open like an earlier post are dropped in code, so a weak favourite cannot become hook A.
  const h = cleanHooks(s.hooks ?? [], s.favourite_hook ?? "", rules ? (hook) => staleHook(hook, rules) : undefined);
  // Only a "comment" or "dm" call to action has a word for viewers to send.
  const keyword = s.cta_type === "follow" || s.cta_type === "save" ? "" : s.keyword;
  return { ...s, hooks: h.hooks, favourite_hook: h.favourite, keyword };
}

export function formatScript(s: Script): string {
  return [
    "HOOK OPTIONS", ...s.hooks.map((h, i) => `${i + 1}. ${h}`), "",
    "SCRIPT", s.script, "",
    "ON-SCREEN TEXT / SCREEN RECORDING", ...s.on_screen_text.map((t) => `- ${t}`),
  ].join("\n");
}

export type Repurposed = {
  short_videos: { idea: string; script: string; caption: string; keyword: string }[];
  linkedin_posts: { idea: string; text: string }[];
  newsletter: { idea: string; text: string };
};

export async function repurpose(transcript: string): Promise<Repurposed> {
  const text = `${await guide()}\n\n${await prompt("repurpose.md")}\n\nTRANSCRIPT:\n${transcript.slice(0, 30000)}`;
  return askStructured<Repurposed>(text, {
    type: "object", required: ["short_videos", "linkedin_posts", "newsletter"],
    properties: {
      short_videos: { type: "array", items: { type: "object", required: ["idea", "script", "caption", "keyword"], properties: { idea: S, script: S, caption: S, keyword: S } } },
      linkedin_posts: { type: "array", items: { type: "object", required: ["idea", "text"], properties: { idea: S, text: S } } },
      newsletter: { type: "object", required: ["idea", "text"], properties: { idea: S, text: S } },
    },
  }, "sonnet", 7000);
}
