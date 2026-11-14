import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { templateProblems } from "../lib/outreachTemplateMath.ts";

// Every niche template on disk must follow the outreach rules, so a hand edit that breaks them is caught.
const dir = new URL("../../prompts/outreach/", import.meta.url);
for (const f of readdirSync(dir).filter((f) => f.endsWith(".md"))) {
  test(`prompts/outreach/${f} follows the outreach rules`, () => assert.deepEqual(templateProblems(readFileSync(new URL(f, dir), "utf8")), []));
}

// Template kinds (docs/NICHE_FOCUS_PLAN.md, N5): LinkedIn-only for a seeding niche, none for an audience niche.
import { linkedinSections, sampleFill, templateKind } from "../lib/outreachTemplateMath.ts";

const NOTE_OK = `<!-- kind: linkedin -->
# Outreach: Example

## LinkedIn connection note

Hi {{first name}}, I work with developers on enquiries going cold. Happy to connect.
{{your name}}, {{your business}}. Reply "no" and I won't message again.

## LinkedIn follow-up (once, after they accept)

Thanks for connecting, {{first name}}. Worth a short chat?

{{your name}}, {{your business}}. Reply "no" and I won't message again.
`;

test("the kind is read from the marker; no marker means email", () => {
  assert.equal(templateKind(NOTE_OK), "linkedin");
  assert.equal(templateKind("<!-- kind: none -->\nNo outreach is drafted."), "none");
  assert.equal(templateKind("<!-- kind: sms -->"), "email");
  assert.equal(templateKind("# plain"), "email");
});

test("a LinkedIn-only template: a note and a follow-up, both with name and opt-out", () => {
  assert.deepEqual(templateProblems(NOTE_OK), []);
  assert.deepEqual(linkedinSections(NOTE_OK)?.followUp.startsWith("Thanks for connecting"), true);
  assert.equal(linkedinSections("## First email"), null);
});

test("a LinkedIn-only template refuses an email section, figures, links, a missing opt-out and an over-long note", () => {
  assert.match(templateProblems(NOTE_OK + "\n## First email\n\n**Subject:** Hi\n").join(" "), /no email sections/);
  assert.match(templateProblems(NOTE_OK.replace("enquiries going cold", "enquiries going cold, 3 a week")).join(" "), /states a figure/);
  assert.match(templateProblems(NOTE_OK.replace("Happy to connect.", "See example.com/x or https://example.com.")).join(" "), /contains a link/);
  assert.match(templateProblems(NOTE_OK.replace(`{{your name}}, {{your business}}. Reply "no" and I won't message again.\n\n## LinkedIn follow-up`, `{{your name}}, {{your business}}.\n\n## LinkedIn follow-up`)).join(" "), /connection note needs the opt-out/);
  const long = NOTE_OK.replace("Happy to connect.", "Happy to connect. " + "Plenty more words here. ".repeat(12));
  assert.match(templateProblems(long).join(" "), /LinkedIn allows 300/);
  assert.ok(sampleFill("{{first name}} {{your name}}").length > 20, "placeholders are counted at a realistic length");
});

test("a none template carries no outreach section and says so", () => {
  assert.deepEqual(templateProblems("<!-- kind: none -->\nNo outreach is drafted for this niche: content only."), []);
  assert.match(templateProblems("<!-- kind: none -->\nContent only.").join(" "), /should say/);
  assert.match(templateProblems("<!-- kind: none -->\nNo outreach.\n\n## LinkedIn connection note\n\nHi").join(" "), /no outreach sections/);
});

test("the four niche templates of the plan have the kinds it asks for", () => {
  const kind = (k) => templateKind(readFileSync(new URL(`${k}.md`, dir), "utf8"));
  assert.deepEqual(["dental", "aesthetics", "property_developers", "beauty"].map(kind), ["email", "email", "linkedin", "none"]);
  for (const k of ["dental", "aesthetics"]) {
    const md = readFileSync(new URL(`${k}.md`, dir), "utf8");
    const sections = md.split("## First email")[1].split("\n").filter((l) => !l.startsWith("## ")).join("\n");   // headings are fixed ("3-4 days later")
    assert.match(sections, /data processing agreement comes first/, `${k}: says a DPA comes first`);
    assert.doesNotMatch(sections, /[0-9£$€%]/, `${k}: no figures in the copy`);
  }
});
