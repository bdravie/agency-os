// Fails the release build while placeholders remain, and checks every variant's copy against the positioning rules.
import { readFileSync, readdirSync } from "node:fs";
const dir = new URL("../src/content/", import.meta.url);
const soft = process.argv.includes("--soft");
const problems = [];

const site = JSON.parse(readFileSync(new URL("site.json", dir), "utf8"));
for (const [k, v] of Object.entries(site)) if (!k.startsWith("_") && typeof v === "string" && v.includes("CHANGE ME")) problems.push(`site.json: ${k} still says CHANGE ME`);

for (const f of readdirSync(dir).filter((f) => /^[a-z]\.json$/.test(f))) {
  const v = JSON.parse(readFileSync(new URL(f, dir), "utf8"));
  const text = JSON.stringify([v.headline, v.sub, v.cta, v.closing, v.changes]);
  if (!v.closing || !v.changes?.title || v.changes?.cards?.length !== 3) problems.push(`${f}: needs a closing line and a changes block with a title and exactly 3 cards`);
  if (/\bAI[- ]automation\b|\bAI consultant\b|\bLLM\b|\bpipeline\b|\bworkflow\b/i.test(text)) problems.push(`${f}: copy breaks prompts/positioning.md (leads with technology)`);
  if (/\d+\s?%|£\s?\d|\b\d+x\b/.test(text)) problems.push(`${f}: copy contains a figure; only use figures that are true and supplied`);
}

if (problems.length) {
  console.log((soft ? "Warnings:\n" : "Not ready to release:\n") + problems.map((p) => " - " + p).join("\n"));
  if (!soft) process.exit(1);
} else console.log("Content check passed.");
