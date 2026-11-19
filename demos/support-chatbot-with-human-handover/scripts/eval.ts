// npm run eval: runs the 15 made-up test questions through the same code as the chat and checks each one
// against its expected article (or "not sure" for the questions the help pages do not cover).
//   --search-only   only the keyword search, no Claude call (free)
//   --fresh         ignore cached Claude replies
// The run uses its own temporary data folder, so it never adds rows to the staff page.
import "./env.ts";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "support-eval-"));
process.env.SUPPORT_DEMO_DATA = scratch;

const args = new Set(process.argv.slice(2));
const { sampleArticles } = await import("../lib/store.ts");
const { search, relevant, MIN_SCORE } = await import("../lib/search.ts");
const { answerQuestion } = await import("../lib/answer.ts");
const { MODEL, hasKey } = await import("../lib/claude.ts");

type Q = { q: string; expect: string | null };
const questions = (JSON.parse(fs.readFileSync("sample-data/test-questions.json", "utf8")) as { questions: Q[] }).questions;
const articles = sampleArticles();

let pass = 0;
let inTok = 0;
let outTok = 0;
let calls = 0;
let fromCache = 0;
const rows: string[] = [];

for (const [i, { q, expect }] of questions.entries()) {
  const matches = search(q, articles);
  const top = matches[0];
  const picked = relevant(matches).map((m) => m.article.id);
  let got: string | null;
  let detail: string;

  if (args.has("--search-only")) {
    got = picked[0] ?? null;
    detail = top ? `top ${top.article.id} ${top.score} [${top.matched.join(" ")}]; sent: ${picked.join(", ") || "nothing"}` : "no match";
  } else {
    const r = await answerQuestion(q, [], articles, { fresh: args.has("--fresh") });
    if (r.usage) {
      calls += 1;
      if (r.cached) fromCache += 1;
      inTok += r.usage.input_tokens;
      outTok += r.usage.output_tokens;
    }
    got = r.reply.kind === "answer" ? r.reply.sources[0].id : null;
    detail = r.reply.kind === "answer"
      ? `${r.reply.text}  [source: ${r.reply.sources.map((s) => s.id).join(", ")}]`
      : `NOT SURE (${r.reply.kind === "not_sure" ? r.reply.reason : r.reply.kind})${r.problem ? `: ${r.problem}` : ""}${top ? `; closest ${top.article.id} ${top.score}` : ""}`;
  }

  // Search only: an in-scope question passes if its article is among those sent; out-of-scope ones are Claude's call.
  const ok = args.has("--search-only") ? (expect === null ? true : picked.includes(expect)) : got === expect;
  if (ok) pass += 1;
  rows.push(`${ok ? "PASS" : "FAIL"} ${String(i + 1).padStart(2)}. ${q}\n        expected: ${expect ?? "not sure"}\n        got:      ${detail}`);
}

console.log(rows.join("\n"));
console.log("");
console.log(`${pass} of ${questions.length} as expected${args.has("--search-only") ? ` (search only, threshold ${MIN_SCORE})` : ""}.`);
if (!args.has("--search-only")) {
  console.log(hasKey() ? `Model ${MODEL}: ${calls} Claude calls (${fromCache} from cache), ${inTok} tokens in, ${outTok} out (as billed the first time).` : "No API key: offline mode, closest article shown.");
  // Haiku 5.5 list price: $0.10 per million input tokens, $0.50 per million output tokens.
  if (calls) {
    const usd = (inTok * 0.1 + outTok * 0.5) / 1e6;
    console.log(`At Haiku 5.5 list price: about $${usd.toFixed(5)} for the run, $${(usd / calls).toFixed(6)} per answered question.`);
  }
}
fs.rmSync(scratch, { recursive: true, force: true });
