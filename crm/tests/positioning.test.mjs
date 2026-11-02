import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { positioning, withPositioning } from "../lib/positioning.ts";

const PROMPTS = path.resolve(process.cwd(), "..", "prompts");

test("the positioning goes in front of a prompt", async () => {
  const out = await withPositioning("RULES HERE");
  assert.ok(out.startsWith(await positioning()));
  assert.ok(out.endsWith("RULES HERE"));
  assert.match(out, /result for the business/);
});
test("no prompt describes the consultant as an AI automation business (positioning.md names the phrase only to forbid it)", async () => {
  for (const f of (await readdir(PROMPTS)).filter((f) => f.endsWith(".md") && f !== "positioning.md")) {
    const text = await readFile(path.join(PROMPTS, f), "utf8");
    assert.doesNotMatch(text, /\bAI automation (consultant|agency|partner)\b|I build AI automations/i, f);
  }
});
