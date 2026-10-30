import test from "node:test";
import assert from "node:assert/strict";
import { offerGroup, starterTemplate, templateKey, templateProblems, isStarter } from "../lib/outreachTemplateMath.ts";

test("a niche key becomes a safe file name, or nothing", () => {
  assert.equal(templateKey("HVAC"), "hvac");
  assert.equal(templateKey(" Estate Agent "), "estate_agent");
  assert.equal(templateKey("pest_control"), "pest_control");
  for (const bad of ["../etc/passwd", "a/b", "", null, undefined, "x", "ab.md", "1abc"]) assert.equal(templateKey(bad), null, String(bad));
});
test("the offer group comes from the comment in the file", () => {
  assert.equal(offerGroup("<!-- offer: home_services -->\n# x"), "home_services");
  assert.equal(offerGroup("# no comment"), null);
});
test("a starter template is valid, marked as a starter, and uses the niche and offer", () => {
  const md = starterTemplate("Dental practices", "Automated appointment reminders");
  assert.deepEqual(templateProblems(md), []);
  assert.equal(isStarter(md), true);
  assert.match(md, /help dental practices businesses with automated appointment reminders/);
  assert.deepEqual(templateProblems(starterTemplate("Estate agent", null)), []);
});
test("unsafe or unusable templates are caught", () => {
  const ok = starterTemplate("Dental", null);
  assert.ok(templateProblems(ok.replace(/Reply "no" and I won't email again\./, "Thanks.")).some((p) => /opt-out/.test(p)));
  assert.ok(templateProblems(ok.replace("## First email", "## Intro")).some((p) => /missing/.test(p)));
  assert.ok(templateProblems(ok.replace("**Subject:** A quick idea", "**Subject:** " + "x".repeat(31))).some((p) => /subject/.test(p)));
  assert.ok(templateProblems(ok.replace("Hi {{company}} team,", "Hi {{agency}} team,")).some((p) => /\{\{agency\}\}/.test(p)));
  assert.ok(templateProblems(ok.replace(/\{\{your business\}\}/g, "")).some((p) => /your business/.test(p)));
  assert.ok(templateProblems(ok.replace("Would 15 minutes", "word ".repeat(120) + "Would 15 minutes")).some((p) => /under 100/.test(p)));
});
