// Fails the release build while placeholders remain, and checks every variant's copy against the positioning rules.
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { parse } from "yaml";
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

// Blog posts (src/blog/*.md): each needs a title, a description short enough for search results, a real date and a known niche.
// The title and description follow the same positioning rules as the landing page; the body is only checked for placeholders.
const blog = new URL("../src/blog/", import.meta.url);
for (const f of existsSync(blog) ? readdirSync(blog).filter((f) => f.endsWith(".md") && !f.startsWith("_") && !f.startsWith(".")) : []) {
  const raw = readFileSync(new URL(f, blog), "utf8");
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!/^[a-z0-9-]+\.md$/.test(f)) problems.push(`blog/${f}: the file name is the address, so use lowercase letters, digits and hyphens only`);
  if (!m) { problems.push(`blog/${f}: needs front matter (see src/blog/_template.md)`); continue; }
  let fm = {};
  try { fm = parse(m[1]) ?? {}; } catch { problems.push(`blog/${f}: the front matter is not valid`); continue; }
  if (fm.draft) continue;
  const title = String(fm.title ?? "").trim(), desc = String(fm.description ?? "").trim();
  if (!title) problems.push(`blog/${f}: needs a title`);
  if (title.length > 70) problems.push(`blog/${f}: the title is over 70 characters, so search results will cut it off`);
  if (!desc) problems.push(`blog/${f}: needs a description`);
  if (desc.length > 160) problems.push(`blog/${f}: the description is over 160 characters`);
  if (Number.isNaN(new Date(fm.date).getTime()) || !fm.date) problems.push(`blog/${f}: needs a date like 2026-12-01`);
  if (fm.niche && !["dental", "aesthetics", "clinics"].includes(fm.niche)) problems.push(`blog/${f}: niche must be dental, aesthetics or clinics`);
  const head = title + " " + desc;
  if (/\bAI[- ]automation\b|\bAI consultant\b|\bLLM\b|\bpipeline\b|\bworkflow\b/i.test(head)) problems.push(`blog/${f}: the title or description leads with technology (prompts/positioning.md)`);
  if (/\d+\s?%|£\s?\d|\b\d+x\b/.test(head)) problems.push(`blog/${f}: the title or description contains a figure; only use figures that are true and supplied`);
  if (raw.includes("CHANGE ME")) problems.push(`blog/${f}: still says CHANGE ME`);
}

if (problems.length) {
  console.log((soft ? "Warnings:\n" : "Not ready to release:\n") + problems.map((p) => " - " + p).join("\n"));
  if (!soft) process.exit(1);
} else console.log("Content check passed.");
