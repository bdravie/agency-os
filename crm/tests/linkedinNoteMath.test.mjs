import test from "node:test";
import assert from "node:assert/strict";
import { NOTE_MAX, NOTE_OPT_OUT, assembleNote, bodyBudget, noteProblems, noteWarnings, stripFrame } from "../lib/linkedinNoteMath.ts";

const who = { firstName: "Sam", sender: "Alex Example", business: "Example Systems" };

test("code adds the greeting, real name, business name and opt-out line", () => {
  const n = assembleNote("I work with practices on missed calls. Happy to connect.", who);
  assert.ok(n.startsWith("Hi Sam, I work with"));
  assert.ok(n.endsWith(`Alex Example, Example Systems. ${NOTE_OPT_OUT}`));
  assert.ok(assembleNote("x", { ...who, firstName: null }).startsWith("Hi there, x"));
});

test("the budget keeps the whole note within LinkedIn's limit", () => {
  const b = bodyBudget(who);
  assert.ok(b > 150 && b < NOTE_MAX);
  assert.ok(assembleNote("a".repeat(b), who).length <= NOTE_MAX);
  assert.deepEqual(noteProblems("a".repeat(b), b), []);
  assert.match(noteProblems("a".repeat(b + 1), b).join(" "), /characters/);
});

test("figures, links, contact details and @ names are refused in the AI's text", () => {
  const p = (s) => noteProblems(s, 250).join(" ");
  assert.match(p("We cut missed calls by 40%."), /figure/);
  assert.match(p("See example.com for more."), /link/);
  assert.match(p("Email me at alex@example.com"), /email/);
  assert.match(p("Thanks to @someone"), /@-mentions/);
  assert.match(p("  "), /empty/);
  assert.deepEqual(noteProblems("I work with practices on missed calls and late replies. Happy to connect.", 250), []);
});

test("a greeting, sign-off or opt-out the model added is taken out", () => {
  assert.equal(stripFrame("Hi Sam,\nI work with practices.\n- Alex\nReply 'no' and I won't message again."), "I work with practices.");
});

test("warnings: over the free limit, over the limit, opt-out removed", () => {
  assert.match(noteWarnings(`${"a".repeat(220)} ${NOTE_OPT_OUT}`).join(" "), /free LinkedIn account/);
  assert.match(noteWarnings(`${"a".repeat(300)} ${NOTE_OPT_OUT}`).join(" "), /LinkedIn allows 300/);
  assert.match(noteWarnings("Hi Sam, short.").join(" "), /opt-out line is missing/);
});
