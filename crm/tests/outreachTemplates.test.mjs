import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { templateProblems } from "../lib/outreachTemplateMath.ts";

// Every niche template on disk must follow the outreach rules, so a hand edit that breaks them is caught.
const dir = new URL("../../prompts/outreach/", import.meta.url);
for (const f of readdirSync(dir).filter((f) => f.endsWith(".md"))) {
  test(`prompts/outreach/${f} follows the outreach rules`, () => assert.deepEqual(templateProblems(readFileSync(new URL(f, dir), "utf8")), []));
}
