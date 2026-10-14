import { readFile } from "node:fs/promises";
import path from "node:path";
import { ask } from "./llm";

const ROOT = path.resolve(process.cwd(), "..");
const prompt = (name: string) => readFile(path.join(ROOT, "prompts", name), "utf8");

/** Pull the first JSON value out of a model reply (tolerates code fences and stray prose). */
export function extractJson<T>(reply: string): T {
  const text = reply.replace(/```(?:json)?/g, "");
  const start = text.search(/[\[{]/);
  const end = Math.max(text.lastIndexOf("]"), text.lastIndexOf("}"));
  if (start < 0 || end <= start) throw new Error("The AI reply had no JSON in it. Try again.");
  const body = text.slice(start, end + 1);
  try {
    return JSON.parse(body) as T;
  } catch (err) {
    // A reply cut off mid-array: keep the complete elements and close the array.
    if (text[start] === "[") {
      for (let cut = body.lastIndexOf("}"); cut > 0; cut = body.lastIndexOf("}", cut - 1)) {
        try { return JSON.parse(body.slice(0, cut + 1) + "]") as T; } catch {}
      }
    }
    throw err;
  }
}

export type Idea = { idea: string; format?: string; hook?: string };

export async function generateIdeas(audience: string | null, existing: string[]): Promise<Idea[]> {
  const guide = await prompt("video-ideas.md");
  const task = await prompt("content-ideas.md");
  const text =
    `${guide}\n\n${audience ? `AUDIENCE FOR THIS BATCH: ${audience}\n\n` : ""}${task}\n\nEXISTING:\n${existing.map((e) => `- ${e}`).join("\n") || "(none)"}\n\nGenerate 20 ideas.`;
  const ideas = extractJson<Idea[]>(await ask(text, "haiku", 6000));
  return ideas.filter((i) => typeof i.idea === "string" && i.idea.trim()).slice(0, 20);
}

export type Script = { hooks: string[]; favourite_hook: string; script: string; on_screen_text: string[]; caption: string; keyword: string };

export async function writeScript(idea: string): Promise<Script> {
  const text = `${await prompt("video-ideas.md")}\n\n${await prompt("video-script.md")}\n\nIDEA: ${idea}`;
  return extractJson<Script>(await ask(text, "sonnet", 1800));
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
  const text = `${await prompt("video-ideas.md")}\n\n${await prompt("repurpose.md")}\n\nTRANSCRIPT:\n${transcript.slice(0, 30000)}`;
  return extractJson<Repurposed>(await ask(text, "sonnet", 4500));
}
