// Seeds the Loom pitch's profile, proof library and answer bank. Insert-only: anything already there, including your edits in the CRM, is left alone.
// Proof comes from config/pitch-library.yaml and, word for word, from portfolio/portfolio.md.
// Usage (from crm/):  node --experimental-strip-types --no-warnings --env-file=../.env scripts/seedPitchLibrary.mts [--dry-run]
import { readFileSync } from "node:fs";
import { parse } from "yaml";
import { tx } from "../lib/db.ts";
import { parsePortfolio } from "../lib/loomPitchMath.ts";

const dry = process.argv.includes("--dry-run");
const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");
const y = parse(read("config/pitch-library.yaml"));
const labels: Record<string, { kind: string; tags: string[] }> = y.portfolio;

const fromPortfolio = parsePortfolio(read("portfolio/portfolio.md")).map((p) => {
  const key = Object.keys(labels).find((k) => p.name.startsWith(k));
  if (!key) throw new Error(`config/pitch-library.yaml has no label for the portfolio entry "${p.name}".`);
  return { ...p, ...labels[key] };
});
const proof: any[] = [...y.proof, ...fromPortfolio];

if (dry) {
  console.log(`${proof.length} proof items, ${y.answers.length} answers and 1 profile ready. Nothing written.`);
  for (const p of proof) console.log(`  ${p.name} [${p.kind}]`);
  process.exit(0);
}

const out = await tx(async (c) => {
  let items = 0, answers = 0;
  for (const p of proof) {
    const { rowCount } = await c.query(
      `INSERT INTO proof_items (name, kind, one_line, problem_solved, tools, results, link, tags, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (name) DO NOTHING`,
      [p.name, p.kind, p.one_line ?? null, p.problem_solved ?? null, p.tools ?? [], p.results ?? null, p.link ?? null, p.tags ?? [], p.notes ?? null]);
    items += rowCount ?? 0;
  }
  for (const a of y.answers) {
    const { rowCount } = await c.query(
      `INSERT INTO answer_bank (category, question, answer) SELECT $1,$2,$3 WHERE NOT EXISTS (SELECT 1 FROM answer_bank WHERE lower(question) = lower($2))`,
      [a.category, a.question, a.answer]);
    answers += rowCount ?? 0;
  }
  const f = y.profile;
  const { rowCount } = await c.query(
    `INSERT INTO pitch_profile (name, positioning_line, short_positioning, strong_tools, familiar_tools, preferred_defaults, portfolio_links, facts)
     VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8) ON CONFLICT (id) DO NOTHING`,
    [process.env.SENDER_NAME || null, f.positioning_line, f.short_positioning, f.strong_tools, f.familiar_tools, f.preferred_defaults, JSON.stringify(f.portfolio_links ?? []), f.facts]);
  return { items, answers, profile: rowCount ?? 0 };
});
console.log(`Added ${out.items} of ${proof.length} proof items, ${out.answers} of ${y.answers.length} answers, ${out.profile ? "the" : "no new"} profile. Anything already there was left alone.`);
process.exit(0);
