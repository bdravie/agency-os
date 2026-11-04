// Turns ../config/experiments.yaml into shared/experiments.json for the edge code, and refuses a config the site cannot serve.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { parse } from "yaml";

const cfg = parse(readFileSync(new URL("../../config/experiments.yaml", import.meta.url), "utf8"));
const problems = [];
const list = Array.isArray(cfg?.experiments) ? cfg.experiments : [];
if (list.filter((e) => e.status === "running").length > 1) problems.push("Only one experiment may be running at a time.");

for (const e of list) {
  if (!/^[a-z0-9-]+$/.test(String(e.id ?? ""))) problems.push(`Experiment id "${e.id}" must be lowercase letters, digits and hyphens.`);
  if (!["running", "paused", "finished"].includes(e.status)) problems.push(`${e.id}: status must be running, paused or finished.`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(e.started ?? ""))) problems.push(`${e.id}: started must be a date like 2026-11-10.`);
  if (!Array.isArray(e.variants) || e.variants.length < 2) problems.push(`${e.id}: needs at least two variants.`);
  for (const v of e.variants ?? []) {
    if (!/^[a-z]$/.test(String(v.id))) problems.push(`${e.id}: variant id "${v.id}" must be one lowercase letter.`);
    if (!(Number(v.weight) > 0)) problems.push(`${e.id}: variant ${v.id} needs a weight above 0.`);
    if (!existsSync(new URL(`../src/content/${v.id}.json`, import.meta.url))) problems.push(`${e.id}: src/content/${v.id}.json is missing.`);
  }
}
if (problems.length) { console.error("config/experiments.yaml is not usable:\n - " + problems.join("\n - ")); process.exit(1); }

const out = { experiments: list.map((e) => ({ id: e.id, status: e.status, started: String(e.started), variants: e.variants.map((v) => ({ id: v.id, weight: Number(v.weight) })) })) };
writeFileSync(new URL("../shared/experiments.json", import.meta.url), JSON.stringify(out, null, 2) + "\n");
console.log(`Experiments: ${out.experiments.map((e) => `${e.id} (${e.status})`).join(", ") || "none"}`);
