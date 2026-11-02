import { withPositioning } from "./positioning";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { parse } from "yaml";
import { askStructured } from "./llm";
import { audienceText, fillNiche, parseContentConfig, type ContentConfig } from "./contentConfigMath";

const ROOT = path.resolve(process.cwd(), "..");
const S = { type: "string" } as const;
const prompt = (name: string) => readFile(path.join(ROOT, "prompts", name), "utf8");

/** The `content:` settings in config/niches.yaml (posts per week, idea limit, who the videos are for). */
export async function loadContentConfig(): Promise<ContentConfig> {
  const y = parse(await readFile(path.join(ROOT, "config/niches.yaml"), "utf8"));
  return parseContentConfig(y?.content, y?.defaults?.focus_niches);
}

/** prompts/video-ideas.md with {{NICHE}} filled from the content settings. Every content prompt starts from this guide. */
async function guide(): Promise<string> {
  return fillNiche(await withPositioning(await prompt("video-ideas.md")), audienceText(await loadContentConfig()));
}

export type Idea = { idea: string; format?: string; hook?: string };

export async function generateIdeas(audience: string | null, existing: string[]): Promise<Idea[]> {
  const task = await prompt("content-ideas.md");
  const text =
    `${await guide()}\n\n${audience ? `AUDIENCE FOR THIS BATCH: ${audience}\n\n` : ""}${task}\n\nEXISTING:\n${existing.map((e) => `- ${e}`).join("\n") || "(none)"}\n\nGenerate 20 ideas.`;
  const { ideas } = await askStructured<{ ideas: Idea[] }>(text, {
    type: "object", required: ["ideas"],
    properties: { ideas: { type: "array", items: { type: "object", required: ["idea", "format", "hook"], properties: { idea: S, format: S, hook: S } } } },
  }, "haiku", 6000);
  return (ideas ?? []).filter((i) => typeof i.idea === "string" && i.idea.trim()).slice(0, 20);
}

export type Script = { hooks: string[]; favourite_hook: string; script: string; on_screen_text: string[]; caption: string; keyword: string };

export async function writeScript(idea: string): Promise<Script> {
  const text = `${await guide()}\n\n${await prompt("video-script.md")}\n\nIDEA: ${idea}`;
  return askStructured<Script>(text, {
    type: "object", required: ["hooks", "favourite_hook", "script", "on_screen_text", "caption", "keyword"],
    properties: { hooks: { type: "array", items: S }, favourite_hook: S, script: S, on_screen_text: { type: "array", items: S }, caption: S, keyword: S },
  }, "sonnet", 2500);
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
