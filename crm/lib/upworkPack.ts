import { readFile } from "node:fs/promises";
import path from "node:path";
import { parse } from "yaml";
import { askStructured, upworkModel } from "./llm";
import { cleanDiagram, cleanName, fillCover, packProblems, type Pack } from "./upworkPackMath";

export type { Pack, LoomBeat } from "./upworkPackMath";

// The CRM runs from crm/, shared files live in the repo root.
const ROOT = path.resolve(process.cwd(), "..");

const str = { type: "string" } as const;
const SCHEMA = {
  type: "object" as const,
  properties: {
    client_name: { type: ["string", "null"] },
    system_title: str, what_they_asked: str, explanation: str,
    steps: { type: "array", items: str, minItems: 3, maxItems: 8 },
    diagram: str,
    loom: {
      type: "object",
      properties: {
        hook: str,
        show: { type: "array", minItems: 2, maxItems: 6, items: { type: "object", properties: { say: str, on_screen: str }, required: ["say", "on_screen"] } },
        close: str,
        prep: { type: "array", items: str, maxItems: 3 },
      },
      required: ["hook", "show", "close", "prep"],
    },
    data_note: { type: ["string", "null"] },
    fit_note: str,
  },
  required: ["client_name", "system_title", "what_they_asked", "explanation", "steps", "diagram", "loom", "data_note", "fit_note"],
};

const read = (file: string) => readFile(path.join(ROOT, file), "utf8");
const stripComments = (s: string) => s.replace(/<!--[\s\S]*?-->/g, "").trim();

/** Bullet lines from portfolio/about-me.md, or "" if the owner has not written any (the section is then left out). */
async function aboutMe(): Promise<string> {
  return stripComments(await read("portfolio/about-me.md").catch(() => "")).split("\n").filter((l) => l.trim().startsWith("- ")).join("\n");
}

export async function buildPack(jobText: string): Promise<Pack> {
  const [rules, template, about, offersYaml] = await Promise.all([
    read("prompts/upwork-pack.md"), read("prompts/upwork-cover-letter.md"), aboutMe(), read("config/offers.yaml"),
  ]);
  const offers = (parse(offersYaml)?.offers ?? []) as { name: string; outcome?: string }[];
  const prompt =
    `${rules}\n\nABOUT ME:\n${about || "(Nothing written yet. Do not describe any past work.)"}\n\n` +
    `OFFERS:\n${offers.map((o) => `- ${o.name}: ${o.outcome ?? ""}`).join("\n")}\n\nJOB POST:\n${jobText}`;
  const run = () => askStructured<Omit<Pack, "cover_letter">>(prompt, SCHEMA, upworkModel(), 3000);
  let r = await run();
  let bad = packProblems(r);
  if (bad.length) { r = await run(); bad = packProblems(r); }
  if (bad.length) throw new Error(`The AI reply was incomplete (${bad.join(", ")}). Try again.`);
  const sender = [process.env.SENDER_NAME, process.env.BUSINESS_NAME].filter(Boolean).join(", ");
  return {
    ...r,
    client_name: cleanName(r.client_name),
    diagram: cleanDiagram(r.diagram, r.steps),
    cover_letter: fillCover(template, r, about, sender, true),
  };
}
