import { readFile } from "node:fs/promises";
import path from "node:path";
import { parse } from "yaml";
import { ask, outreachModel } from "./llm";
import { templateProblems } from "./outreachTemplateMath.ts";

const ROOT = path.resolve(process.cwd(), "..");

/** Asks the AI for a niche's three outreach messages, checks them against the outreach rules, and retries once with the problems listed. Saves nothing. */
export async function draftNicheMarkdown(label: string, pitch: string | null): Promise<{ md: string; problems: string[] }> {
  const rules = await readFile(path.join(ROOT, "prompts/outreach-niche-writer.md"), "utf8");
  const offers = (parse(await readFile(path.join(ROOT, "config/offers.yaml"), "utf8"))?.offers ?? []) as { name: string; outcome?: string }[];
  const prompt = `${rules}\n\nNICHE: ${label}\nHOW THE CONSULTANT USUALLY PITCHES IT: ${pitch ?? "(not written down: choose a safe business-totals pitch)"}\nOFFER CATALOGUE:\n${offers.map((o) => `- ${o.name}: ${o.outcome ?? ""}`).join("\n")}`;
  let md = "", problems: string[] = [];
  for (let attempt = 0; attempt < 2; attempt++) {
    md = (await ask(attempt === 0 ? prompt : `${prompt}\n\nYour last answer had these problems, fix them and output the whole Markdown again:\n- ${problems.join("\n- ")}`, outreachModel(), 6000))
      .replace(/^```(?:markdown|md)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
    problems = templateProblems(md);
    if (problems.length === 0) break;
  }
  return { md, problems };
}
