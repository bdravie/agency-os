import test from "node:test";
import assert from "node:assert/strict";
import { cleanDiagram, cleanName, fillCover, packProblems } from "../lib/upworkPackMath.ts";

const T = "Hi{client_greeting},\n\nYour post is about {what_they_asked}. Plan for your {system_title}{loom_line}.\n\n{explanation}\n\n{steps}\n\nAbout me:\n{about_me}\n\nBye\n{sender}";
const p = { client_name: "Peter", system_title: "Receipt Extraction System", what_they_asked: "pulling data out of receipts ", explanation: "It reads receipts.", steps: ["Watch inbox", "2) Extract"] };

test("only a plain first name is accepted", () => {
  assert.equal(cleanName("Peter"), "Peter");
  assert.equal(cleanName("Peter Smith"), null);
  assert.equal(cleanName("peter@example.com"), null);
  assert.equal(cleanName(null), null);
});
test("cover letter fills every blank and numbers the steps", () => {
  const out = fillCover(T, p, "- I build things", "Sam, Acme", true);
  assert.match(out, /^Hi Peter,/);
  assert.match(out, /Your post is about pulling data out of receipts\./);
  assert.match(out, /your Receipt Extraction System/);
  assert.match(out, /1\. Watch inbox\n2\. Extract/);
  assert.match(out, /short Loom/);
  assert.ok(!/[{}]/.test(out));
});
test("no name, no about-me: greeting and section are dropped, nothing is invented", () => {
  const out = fillCover(T, { ...p, client_name: null }, "", "Sam", false);
  assert.match(out, /^Hi,/);
  assert.ok(!out.includes("About me"));
  assert.ok(!out.includes("Loom"));
});
test("diagram: fences stripped, bad output replaced by a flowchart built from the steps", () => {
  assert.equal(cleanDiagram("```mermaid\nflowchart LR\n  A[x] --> B[y]\n```", []), "flowchart LR\n  A[x] --> B[y]");
  const d = cleanDiagram("not a diagram", ["One [a]", "Two"]);
  assert.match(d, /^flowchart LR\n  S0\[One a\]\n  S1\[Two\]\n  S0 --> S1$/);
});

const good = { system_title: "x", what_they_asked: "x", explanation: "x", diagram: "flowchart LR", fit_note: "x", steps: ["a", "b", "c"],
  loom: { hook: "h", close: "c", prep: [], show: [{ say: "s", on_screen: "o" }, { say: "s", on_screen: "o" }] } };
test("a complete reply has no problems", () => assert.deepEqual(packProblems(good), []));
test("a reply with leaked tool markup or beats outside loom is rejected", () => {
  assert.ok(packProblems({ ...good, loom: "\n<parameter name=\"hook\">You want", show: good.loom.show }).includes("loom"));
  assert.ok(packProblems({ ...good, loom: { ...good.loom, hook: "<parameter name=\"hook\">x" } }).includes("loom.hook"));
  assert.ok(packProblems({ ...good, steps: ["a"] }).includes("steps"));
});
