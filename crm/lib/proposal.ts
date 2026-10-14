import { readFile } from "node:fs/promises";
import path from "node:path";
import { parse } from "yaml";
import { ask } from "./llm";

// The CRM runs from crm/, shared files live in the repo root. Mirrors src/agency/proposal.py.
const ROOT = path.resolve(process.cwd(), "..");
const MAX_WORDS = 145;
const NO_PORTFOLIO = "(No portfolio items yet. Do NOT mention any past project or Loom link.)";

async function portfolio(): Promise<string> {
  const text = (await readFile(path.join(ROOT, "portfolio/portfolio.md"), "utf8")).replace(/<!--[\s\S]*?-->/g, "").trim();
  return /^## /m.test(text) ? text : NO_PORTFOLIO;
}

export function parseFit(reply: string): [number, string] {
  const m = reply.match(/^\s*(\d{1,2})\s*\|\s*([\s\S]+)/);
  if (!m) return [1, `Could not parse score: ${reply.slice(0, 80)}`];
  return [Math.max(1, Math.min(10, Number(m[1]))), m[2].trim()];
}

export async function scoreFit(job: string): Promise<[number, string]> {
  const rubric = await readFile(path.join(ROOT, "prompts/proposal-fit.md"), "utf8");
  return parseFit(await ask(`${rubric}\n\nJOB POST:\n${job}`, "haiku", 100));
}

export async function draftProposal(job: string): Promise<string> {
  const style = await readFile(path.join(ROOT, "prompts/proposal.md"), "utf8");
  const offers = (parse(await readFile(path.join(ROOT, "config/offers.yaml"), "utf8"))?.offers ?? []) as { name: string; outcome?: string }[];
  const prompt =
    `${style}\n\nMY PORTFOLIO (the only projects you may mention):\n${await portfolio()}\n\n` +
    `MY OFFERS:\n${offers.map((o) => `- ${o.name}: ${o.outcome ?? ""}`).join("\n")}\n\nJOB POST:\n${job}\n\n` +
    "Write the proposal only, under 150 words. Never invent a project, client or result. " +
    "If there is no portfolio item, simply leave out the Loom line; do not mention that you have no portfolio.";
  let text = await ask(prompt, "sonnet", 600);
  if (text.split(/\s+/).length > MAX_WORDS) {
    text = await ask(`Shorten this to under ${MAX_WORDS} words, keeping the problem, approach, timeline and final question. Return only the proposal.\n\n${text}`, "sonnet", 600);
  }
  const sender = process.env.SENDER_NAME;
  return sender ? text.replace("[Your name]", sender) : text;
}
