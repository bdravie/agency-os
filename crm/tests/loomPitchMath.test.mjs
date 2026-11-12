import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  buildMermaid, budgetNote, claimProblems, clientNameProblems, cleanEdit, pickToolsLevel, cleanLoomUrl, comparePitches, coverLength, diagramProblems, fillLoomCover, fillLoomLink, finishPitch, finishSection,
  isRecent, mermaidNodeIds, normaliseTool, parsePortfolio, pickLevel, sortTools, splitTools, toolLevel, toolLineProblems, walkthroughMismatch, withScriptNotes, COVER_MAX, GENERAL_LINE,
} from "../lib/loomPitchMath.ts";

const profile = {
  name: "Sam Tester", positioning_line: "I'm one of the foremost automation engineers on Upwork, with over 11 years of software development experience.",
  short_positioning: "have 11 years in software", strong_tools: ["Make.com", "n8n", "Google Drive"], familiar_tools: ["Dropbox", "Retell"],
  preferred_defaults: "Google Drive over Dropbox", portfolio_links: [], facts: ["Over 2 years building automations"],
};
const clinic = { id: 2, name: "Clinic Buddy", kind: "demo", one_line: "A CRM for dental clinics.", problem_solved: null, tools: [], results: null, link: null, tags: [], last_worked_on: null, notes: null };
const client = { id: 3, name: "TBG Website", kind: "client", one_line: "A ticketing website.", problem_solved: "Avoids fees.", tools: ["Stripe"], results: null, link: "https://example.com/tbg", tags: [], last_worked_on: "2026-10-20", notes: null };
const JOB = "Digital mail scanning. OCR, match to the client by ID, file into Google Drive or Dropbox. Must be GDPR compliant. We use Make.com. Budget: $100/hr.";
const ctx = (over = {}) => ({
  jobText: JOB, inputs: { budget: "", screening_questions: [], client_name: "", client_info: "" }, profile, proof: [clinic, client], bank: [],
  rates: { hourly_rate_gbp: 45, usd_to_gbp: 0.75 }, coverTemplate: "Hi{client_greeting}, I love {domain} work and {short_positioning}. Quick video showing how I'd build your {flow} custom: {{LOOM_URL}}", today: "2026-11-06", ...over,
});
const ids = ["S1", "S2", "S3", "S4", "S5"];
const step = (id) => ({ node_id: id, what_happens: "This step happens.", options: [{ name: "Make.com", note: "fits" }, { name: "n8n", note: "also fits" }], pick: "Make.com", pick_tools: ["Make.com"], pick_why: "my number one because they use it", backup: "n8n", depends_on: "their setup" });
const beat = (key, seconds, opening_line, talking_points = []) => ({ key, target_seconds: seconds, opening_line, talking_points });
const reply = (over = {}) => ({
  job_analysis: { core_need: "Scanned post filed to the right client", business_outcome: "A digital mail service that runs itself", tools_mentioned: ["Make.com", "Google Drive", "Dropbox"], budget: { amount: 100, currency: "USD", unit: "hourly" }, assumptions: ["They have a scanner"], open_questions: ["Which scanning software?"], flags: [], missing: [] },
  workflow_diagram: { nodes: ids.map((id, i) => ({ id, label: `Step ${"ABCDE"[i]}` })), edges: ids.slice(1).map((to, i) => ({ from: ids[i], to, label: null })) },
  loom_script: {
    proof_id: null, proof_reason: "Nothing here files documents.",
    beats: [
      beat("hook", 15, "I know you're looking for someone to file your scanned post."), beat("sketch", 20, "I sketched this out for you, and it isn't rocket science."),
      beat("walkthrough", 110, "Let's go through it."), beat("tool_flexibility", 15, "On tools."),
      beat("maintainability", 15, "My goal is systems that are easy to maintain.", ["A data processing agreement comes first."]),
      beat("extra_proof", 10, "Happy to show you other demos."), beat("long_term", 10, "I'm after a long-term working relationship."), beat("cta", 10, "Reply here, thanks for your time."),
    ],
    walkthrough: ids.map(step),
  },
  tool_flexibility: { line: "I'd use Make.com and Google Drive, but if you're set on Dropbox I can make that work.", strong_named: ["Make.com", "Google Drive"], flexible_named: ["Dropbox"] },
  cover_letter: { domain: "document automation", flow: "mail filing flow" },
  screening_answers: [], pre_record_checklist: ["The job post"],
  ...over,
});

test("tools: a domain ending is ignored but doubtful names stay unknown", () => {
  assert.equal(normaliseTool("Make.com"), "make");
  assert.equal(toolLevel("make", profile), "strong");
  assert.equal(toolLevel("Dropbox", profile), "familiar");
  assert.equal(toolLevel("Zapier", profile), "not_listed");
  assert.deepEqual(sortTools(["Make.com", "Make", "Dropbox", "Zapier"], profile), { known_well: ["Make.com"], less_experienced: ["Dropbox"], unknown: ["Zapier"] });
});
test("a pick can name a listed tool inside a longer phrase", () => {
  assert.equal(pickLevel("Make.com's OCR module", profile), "strong");
  assert.equal(pickLevel("Google Document AI", profile), "not_listed");
  assert.equal(pickLevel("make a script", profile), "not_listed");
});

test("the sample job finishes clean: no invented proof, GDPR flagged, sound diagram, honest line, short letter", () => {
  const { pitch, problems } = finishPitch(reply(), ctx());
  assert.deepEqual(problems, []);
  assert.deepEqual(pitch.job_analysis.tools, { known_well: ["Make.com", "Google Drive"], less_experienced: ["Dropbox"], unknown: [] });
  assert.ok(pitch.job_analysis.flags.some((f) => f.type === "personal_data" && /data processing agreement/i.test(f.note)));
  assert.equal(pitch.job_analysis.budget_note, "$100/hr is about £75/hr, at or above your £45/hr rate.");
  assert.equal(pitch.loom_script.proof, null);
  assert.equal(pitch.loom_script.beats.find((b) => b.key === "relevance_bridge").opening_line, GENERAL_LINE);
  assert.ok(!pitch.loom_script.beats.some((b) => b.key === "proof_drop"));
  assert.match(pitch.job_analysis.missing[0], /Nothing in your proof library is relevant/);
  assert.match(pitch.workflow_diagram.mermaid, /^flowchart LR\n {2}S1\["Step A"\]/);
  assert.ok(coverLength(pitch.cover_letter) <= COVER_MAX);
  assert.ok(pitch.cover_letter.includes("{{LOOM_URL}}"));
  assert.equal(pitch.pre_record_checklist[0], "This workflow diagram, on screen");
});

test("the positioning line is placed by code, word for word", () => {
  const { pitch } = finishPitch(reply(), ctx());
  assert.equal(pitch.loom_script.positioning_line, profile.positioning_line);
});
test("the AI repeating a boast outside the positioning line is refused", () => {
  const r = reply(); r.loom_script.beats[0].opening_line = "I'm one of the foremost engineers around.";
  assert.ok(finishPitch(r, ctx()).problems.some((p) => /boasts/.test(p)));
});

test("invented numbers, years and credentials are refused", () => {
  assert.ok(claimProblems("x", "It saves 40% of your time", "", "").some((p) => /number 40/.test(p)));
  assert.ok(claimProblems("x", "With five years in this", "", "").some((p) => /five years/.test(p)));
  assert.ok(claimProblems("x", "I'm Make certified", "", "").some((p) => /certified/.test(p)));
  assert.deepEqual(claimProblems("x", "Budget of $100 an hour", "budget: $100/hr", ""), []);
  assert.deepEqual(claimProblems("x", "n8n and S3 are fine", "", ""), []);
});
test("a claim of past work outside the proof beats is refused", () => {
  const r = reply(); r.loom_script.beats[1].talking_points = ["I built this same folder structure last year."];
  assert.ok(finishPitch(r, ctx()).problems.some((p) => /claims past work/.test(p)));
  const s = reply(); s.loom_script.walkthrough[0].pick_why = "I've worked on this before.";
  assert.ok(finishPitch(s, ctx()).problems.some((p) => /step S1 claims past work/.test(p)));
});
test("the diagram can't be described as already built", () => {
  const r = reply(); r.loom_script.beats[1].opening_line = "I sketched this out, and it's a working system.";
  assert.ok(finishPitch(r, ctx()).problems.some((p) => /already built/.test(p)));
  const s = reply(); s.loom_script.beats[1].opening_line = "Here's a plan for you.";
  assert.ok(finishPitch(s, ctx()).problems.some((p) => /must say it was sketched/.test(p)));
});
test("saying it is NOT built is fine, because that's the honest line", () => {
  const r = reply(); r.loom_script.beats[1].talking_points = ["It's a sketched plan, not a working system yet.", "Nothing is already built."];
  assert.deepEqual(finishPitch(r, ctx()).problems, []);
});
test("a true claim about a listed tool is fine beside a pick that isn't listed", () => {
  const opts = [{ name: "Google Cloud Vision", note: "good" }, { name: "Make.com", note: "fine" }];
  const r = reply(); Object.assign(r.loom_script.walkthrough[1], { options: opts, pick: "Google Cloud Vision", pick_tools: ["Google Cloud Vision"], backup: "Make.com", pick_why: "It reads scans well. It plugs into Google Drive, and I know Google Drive well." });
  assert.deepEqual(finishPitch(r, ctx()).problems, []);
});
test("compliance can't be promised", () => {
  const r = reply(); r.loom_script.beats[4].talking_points = ["It'll be GDPR compliant, and a data processing agreement comes first."];
  assert.ok(finishPitch(r, ctx()).problems.some((p) => /promises compliance/.test(p)));
  assert.deepEqual(claimProblems("x", "You said it must be GDPR compliant", "must be gdpr compliant", ""), []);
});
test("a flagged job must raise the data processing agreement aloud", () => {
  const r = reply(); r.loom_script.beats[4].talking_points = [];
  assert.ok(finishPitch(r, ctx()).problems.some((p) => /data processing agreement comes first/.test(p)));
});

const withProof = (id, bridge, drop) => { const r = reply(); r.loom_script.proof_id = id; r.loom_script.beats.splice(1, 0, beat("relevance_bridge", 5, bridge)); r.loom_script.beats.push({ ...beat("proof_drop", 5, drop), node_id: "S3" }); return r; };
test("a proof id must exist; a made-up one counts as no proof", () => {
  const { pitch } = finishPitch(withProof(99, "I built this.", "Same again."), ctx());
  assert.equal(pitch.loom_script.proof, null);
  assert.ok(!pitch.loom_script.beats.some((b) => b.key === "proof_drop"));
  assert.equal(pitch.loom_script.beats.find((b) => b.key === "relevance_bridge").opening_line, GENERAL_LINE);
});
test("a demo must be called a demo and named", () => {
  assert.ok(finishPitch(withProof(2, "I built Clinic Buddy.", "Same here."), ctx()).problems.some((p) => /must be called one/.test(p)));
  assert.ok(finishPitch(withProof(2, "I built a demo.", "Same here."), ctx()).problems.some((p) => /must name Clinic Buddy/.test(p)));
  assert.deepEqual(finishPitch(withProof(2, "I built a demo called Clinic Buddy.", "Same structure here."), ctx()).problems, []);
});
test("client work can only be claimed with a client item", () => {
  assert.ok(finishPitch(withProof(2, "I built a demo called Clinic Buddy for a client.", "Same."), ctx()).problems.some((p) => /client work/.test(p)));
  assert.deepEqual(finishPitch(withProof(3, "I built a ticketing website for a client.", "Same structure here."), ctx()).problems, []);
});
test("a real client is never named to a prospect, in any form", () => {
  assert.ok(finishPitch(withProof(3, "I built TBG Website for a client.", "Same structure here."), ctx()).problems.some((p) => /names a real client \(TBG Website\)/.test(p)));
  assert.ok(finishPitch(withProof(3, "I built something for a client.", "Same as at TBG."), ctx()).problems.some((p) => /names a real client/.test(p)));
  assert.ok(finishPitch(withProof(3, "I built a ticketing website.", "Same structure here."), ctx()).problems.some((p) => /must say "a client"/.test(p)));
  // Even when a different project is the proof, and in every part a prospect sees.
  const other = withProof(2, "A demo called Clinic Buddy.", "Same structure here."); other.loom_script.beats[0].talking_points = ["Like I did for tbg website"];
  assert.ok(finishPitch(other, ctx()).problems.some((p) => /names a real client/.test(p)));
  const tool = reply({ tool_flexibility: { line: "I'd use Make.com and Google Drive, as at TBG, but if you're set on Dropbox I can make that work.", strong_named: ["Make.com"], flexible_named: ["Dropbox"] } });
  assert.ok(finishPitch(tool, ctx()).problems.some((p) => /tool_flexibility_line: names a real client/.test(p)));
  assert.deepEqual(clientNameProblems("x", "attribute this to a stbg system", [client]), [], "only whole words count");
  assert.deepEqual(clientNameProblems("x", "Clinic Buddy is a demo", [clinic]), [], "a demo can be named");
  // The owner's own view may name it, with a reminder to keep it off screen.
  const { pitch } = finishPitch(withProof(3, "I built a ticketing website for a client.", "Same structure here."), ctx());
  assert.match(pitch.pre_record_checklist[1], /TBG Website, open locally, with its name and any real customer data kept off screen/);
});
test("'recently' needs a recent date on the proof item", () => {
  assert.ok(finishPitch(withProof(2, "I was recently building a demo, Clinic Buddy.", "Same."), ctx()).problems.some((p) => /no recent date/.test(p)));
  assert.deepEqual(finishPitch(withProof(3, "I was recently working on a website for a client.", "Same structure here."), ctx()).problems, []);
  assert.equal(isRecent("2026-10-20", "2026-11-06"), true);
  assert.equal(isRecent("2026-01-20", "2026-11-06"), false);
  assert.equal(isRecent(null, "2026-11-06"), false);
});
test("a proof drop must be tied to a diagram step", () => {
  const r = withProof(3, "I built a site for a client.", "Same."); r.loom_script.beats.at(-1).node_id = "S9";
  assert.ok(finishPitch(r, ctx()).problems.some((p) => /tied to a diagram step/.test(p)));
});
test("their job history can't be mentioned unless it was given", () => {
  const r = reply(); r.loom_script.beats[6].opening_line = "I noticed you've posted several jobs.";
  assert.ok(finishPitch(r, ctx()).problems.some((p) => /job history/.test(p)));
  assert.deepEqual(finishPitch(r, ctx({ inputs: { budget: "", screening_questions: [], client_name: "", client_info: "Has posted 12 jobs" } })).problems, []);
});

test("internal labels are refused and each step gets enough time", () => {
  const r = reply(); r.loom_script.beats[1].talking_points = ["Go through S1 to S5 in order"];
  assert.ok(finishPitch(r, ctx()).problems.some((p) => /internal label/.test(p)));
  const s = reply(); s.loom_script.beats[2].target_seconds = 60; s.loom_script.beats[0].target_seconds = 65;
  assert.ok(finishPitch(s, ctx()).problems.some((p) => /seconds per step/.test(p)));
});
test("backstage words and volunteered weaknesses are refused", () => {
  const r = reply(); r.loom_script.walkthrough[0].pick_why = "My number one because it's on my strong list.";
  assert.ok(finishPitch(r, ctx()).problems.some((p) => /aloud/.test(p)));
  const s = reply(); s.loom_script.beats[5].opening_line = "I don't have a public portfolio link to send.";
  assert.ok(finishPitch(s, ctx()).problems.some((p) => /something you lack/.test(p)));
});
test("gaps are reported once, by code", () => {
  const r = reply(); r.job_analysis.missing = ["No portfolio links to point to.", "No proof item does OCR.", "Name of the person posting", "Client's name is not given.", "Not stated how scans leave the scanner."];
  const { missing } = finishPitch(r, ctx()).pitch.job_analysis;
  assert.equal(missing.filter((m) => /portfolio/i.test(m)).length, 0, "work is shown locally, so no link is not a gap");
  assert.equal(missing.filter((m) => /proof/i.test(m)).length, 1);
  assert.ok(missing.includes("Not stated how scans leave the scanner."));
  assert.ok(!missing.some((m) => /name/i.test(m)), "a missing name weakens nothing");
});
test("a partial proof match is reported; the tool line replaces the beat's points", () => {
  const r = withProof(3, "One thing close to this is a website for a client.", "Same structure here."); r.loom_script.proof_match = "partial"; r.loom_script.proof_reason = "Shares custom workflows only.";
  r.loom_script.beats.find((b) => b.key === "tool_flexibility").talking_points = ["Say the line"];
  const { pitch, problems } = finishPitch(r, ctx());
  assert.deepEqual(problems, []);
  assert.match(pitch.job_analysis.missing[0], /TBG Website is only a partial match/);
  assert.deepEqual(pitch.loom_script.beats.find((b) => b.key === "tool_flexibility").talking_points, []);
  assert.equal(pitch.pre_record_checklist.filter((t) => /TBG Website/.test(t)).length, 1);
  const again = withScriptNotes(pitch.job_analysis, pitch.loom_script);
  assert.equal(again.missing.filter((m) => /partial match/.test(m)).length, 1, "notes aren't repeated when a section is rewritten");
});

test("script time must fit and the walkthrough must match the diagram", () => {
  const r = reply(); r.loom_script.beats[2].target_seconds = 500;
  assert.ok(finishPitch(r, ctx()).problems.some((p) => /totals/.test(p)));
  const s = reply(); s.loom_script.walkthrough.pop();
  assert.ok(finishPitch(s, ctx()).problems.some((p) => /one entry per diagram step/.test(p)));
  const t = reply(); t.loom_script.walkthrough[0].backup = "Make.com";
  assert.ok(finishPitch(t, ctx()).problems.some((p) => /backup must be a different/.test(p)));
  const u = reply(); Object.assign(u.loom_script.walkthrough[0], { pick: "Make.com scenario", backup: "An n8n workflow, if Make can't cope" });
  assert.deepEqual(finishPitch(u, ctx()).problems, [], "wording may differ a little");
  const v = reply(); v.loom_script.walkthrough[0].pick = "Something else entirely";
  assert.ok(finishPitch(v, ctx()).problems.some((p) => /pick is not one of its options/.test(p)));
});
test("a pick not on the lists is allowed but may not imply experience, and is reported", () => {
  const opts = [{ name: "Google Document AI", note: "good" }, { name: "Make.com", note: "fine" }];
  const r = reply(); Object.assign(r.loom_script.walkthrough[1], { options: opts, pick: "Google Document AI", pick_tools: ["Google Document AI"], backup: "Make.com", pick_why: "it reads scanned post well" });
  const ok = finishPitch(r, ctx());
  assert.deepEqual(ok.problems, []);
  assert.equal(ok.pitch.loom_script.walkthrough[1].pick_level, "not_listed");
  assert.ok(ok.pitch.job_analysis.missing.some((m) => /Google Document AI/.test(m)));
  const s = reply(); Object.assign(s.loom_script.walkthrough[1], { options: opts, pick: "Google Document AI", pick_tools: ["Google Document AI"], backup: "Make.com", pick_why: "I've used it a lot" });
  assert.ok(finishPitch(s, ctx()).problems.some((p) => /implies experience/.test(p)));
});

test("a pick is only as strong as its weakest product, and an approach isn't a product", () => {
  assert.equal(pickToolsLevel("An alert email", [], profile), "general");
  assert.equal(pickToolsLevel("A watched folder in Google Drive", [], profile), "strong");
  assert.equal(pickToolsLevel("Make.com plus Dropbox", ["Make.com", "Dropbox"], profile), "familiar");
  assert.equal(pickToolsLevel("Make.com plus Airtable", ["Make.com", "Airtable"], profile), "not_listed");
  const r = reply(); Object.assign(r.loom_script.walkthrough[2], { options: [{ name: "An alert email", note: "" }, { name: "n8n", note: "" }], pick: "An alert email", pick_tools: [], backup: "n8n" });
  assert.ok(!finishPitch(r, ctx()).pitch.job_analysis.missing.some((m) => /alert email/.test(m)));
});

test("the tool line can't claim a tool off the strong list", () => {
  const tools = { known_well: ["Make.com"], less_experienced: ["Dropbox"], unknown: ["Zapier"] };
  const good = { line: "I'd go with Make.com, but if you're set on Dropbox I can make that work.", strong_named: ["Make.com"] };
  assert.deepEqual(toolLineProblems(good, tools, profile), []);
  assert.ok(toolLineProblems({ line: "I know Make.com and Dropbox really well.", strong_named: ["Make.com"] }, tools, profile).some((p) => /claims strength in Dropbox/.test(p)));
  assert.ok(toolLineProblems({ ...good, strong_named: ["Dropbox"] }, tools, profile).some((p) => /not on your strong list/.test(p)));
  assert.ok(toolLineProblems({ line: "I'd go with Make.com.", strong_named: ["Make.com"] }, tools, profile).some((p) => /must cover Dropbox/.test(p)));
  assert.ok(toolLineProblems({ line: "Make.com, Dropbox or Zapier all work for me.", strong_named: ["Make.com"] }, tools, profile).some((p) => /names Zapier/.test(p)));
  assert.ok(toolLineProblems({ line: "One. Two. Three. Make.com and Dropbox.", strong_named: [] }, { known_well: [], less_experienced: [], unknown: [] }, profile).some((p) => /one or two sentences/.test(p)));
});

test("the cover letter is counted with a real link, not the placeholder", () => {
  const letter = fillLoomCover(ctx().coverTemplate, { domain: "document automation", flow: "mail filing flow" }, "have 11 years in software", "");
  assert.equal(letter, "Hi, I love document automation work and have 11 years in software. Quick video showing how I'd build your mail filing flow custom: {{LOOM_URL}}");
  assert.equal(coverLength(letter), letter.length - "{{LOOM_URL}}".length + 59);
  const url = "https://www.loom.com/share/abc12345";
  assert.equal(fillLoomLink(letter, url).endsWith(url), true);
  assert.equal(coverLength(letter, url), fillLoomLink(letter, url).length);
  assert.ok(fillLoomCover(ctx().coverTemplate, { domain: "x", flow: "y" }, "", "Maria").startsWith("Hi Maria, I love x work and build these kinds of systems."));
});
test("an over-long cover letter blank is refused", () => {
  const r = reply({ cover_letter: { domain: "a much longer description of the domain", flow: "mail flow" } });
  assert.ok(finishPitch(r, ctx()).problems.some((p) => /domain must be/.test(p)));
});
test("only real Loom share links are accepted, without their query string", () => {
  assert.equal(cleanLoomUrl("https://www.loom.com/share/abcdef1234567890?sid=xyz"), "https://www.loom.com/share/abcdef1234567890");
  assert.equal(cleanLoomUrl("https://loom.com/share/abcdef12/"), "https://www.loom.com/share/abcdef12");
  for (const bad of ["http://www.loom.com/share/abcdef12", "https://evil.com/share/abcdef12", "https://www.loom.com/other/abcdef12", "nonsense", ""]) assert.equal(cleanLoomUrl(bad), null, bad);
});

test("screening answers use the bank word for word; nothing is guessed", () => {
  const c = ctx({ inputs: { budget: "", screening_questions: ["Certifications?", "Your tone?", "Favourite project?"], client_name: "", client_info: "" }, bank: [{ id: 7, category: "certifications", question: "Certs?", answer: "An Adobe XD certificate." }] });
  const r = reply({ screening_answers: [{ source: "bank", bank_id: 7, answer: "AI rewrote this" }, { source: "new", answer: "Casual and plain." }, { source: "needs_input", answer: "" }] });
  const { pitch, problems } = finishPitch(r, c);
  assert.deepEqual(problems, []);
  assert.equal(pitch.screening_answers[0].answer, "An Adobe XD certificate.");
  assert.equal(pitch.screening_answers[1].source, "new");
  assert.equal(pitch.screening_answers[2].source, "needs_input");
  const bad = reply({ screening_answers: [{ source: "new", answer: "I built a Certified thing for a bank." }] });
  assert.ok(finishPitch(bad, c).problems.some((p) => /claims past work/.test(p)));
});
test("a bank id that doesn't exist becomes needs-input", () => {
  const c = ctx({ inputs: { budget: "", screening_questions: ["Q?"], client_name: "", client_info: "" } });
  assert.equal(finishPitch(reply({ screening_answers: [{ source: "bank", bank_id: 99, answer: "x" }] }), c).pitch.screening_answers[0].source, "needs_input");
});

test("budget: compared in pounds; below your rate is flagged", () => {
  const rates = { hourly_rate_gbp: 45, usd_to_gbp: 0.75 };
  assert.equal(budgetNote({ amount: 30, currency: "USD", unit: "hourly" }, rates).flag.type, "budget_mismatch");
  assert.equal(budgetNote({ amount: 60, currency: "GBP", unit: "hourly" }, rates).flag, null);
  assert.match(budgetNote({ amount: 500, currency: "USD", unit: "fixed" }, rates).note, /Plan and price/);
  assert.match(budgetNote({ amount: 50, currency: "EUR", unit: "hourly" }, rates).note, /Could not compare/);
  assert.deepEqual(budgetNote({ amount: null }, rates), { note: null, flag: null });
});
test("only the owner's facts count: a job flag can't be lost if the AI forgets it", () => {
  const r = reply(); r.job_analysis.flags = [];
  assert.ok(finishPitch(r, ctx()).pitch.job_analysis.flags.some((f) => f.type === "personal_data"));
  const c = ctx({ jobText: "Build a dashboard of our sales totals from a spreadsheet." });
  assert.ok(!finishPitch(reply({ job_analysis: { ...r.job_analysis, budget: null } }), c).pitch.job_analysis.flags.length);
});

test("diagram rules: 4 to 7 steps, joined up, and quoted labels that can't break Mermaid", () => {
  const nodes = (n) => Array.from({ length: n }, (_, i) => ({ id: `S${i + 1}`, label: "A" }));
  const edges = (n) => Array.from({ length: n - 1 }, (_, i) => ({ from: `S${i + 1}`, to: `S${i + 2}`, label: null }));
  assert.deepEqual(diagramProblems({ nodes: nodes(5), edges: edges(5), mermaid: "" }), []);
  assert.ok(diagramProblems({ nodes: nodes(3), edges: edges(3), mermaid: "" }).length);
  assert.ok(diagramProblems({ nodes: nodes(8), edges: edges(8), mermaid: "" }).length);
  assert.ok(diagramProblems({ nodes: nodes(5), edges: edges(4), mermaid: "" }).some((p) => /not joined/.test(p)));
  assert.ok(diagramProblems({ nodes: [{ id: "end", label: "A" }, ...nodes(4)], edges: [{ from: "end", to: "S1", label: null }, ...edges(4)], mermaid: "" }).some((p) => /unique/.test(p)));
  const r = finishSection("workflow_diagram", { nodes: [{ id: "S1", label: 'Read "it" [now]' }, { id: "S2", label: "B" }], edges: [{ from: "S1", to: "S2", label: "No match" }] }, {}, ctx());
  assert.equal(r.value.mermaid, 'flowchart LR\n  S1["Read it now"]\n  S2["B"]\n  S1 -->|"No match"| S2');
  assert.equal(buildMermaid([{ id: "A", label: "x" }], []), 'flowchart LR\n  A["x"]');
});
test("an edited diagram that no longer matches the walkthrough is noticed", () => {
  assert.deepEqual(mermaidNodeIds('flowchart LR\n  S1["A"] --> S2["B"]\n  S2 --> S3{C}'), ["S1", "S2", "S3"]);
  assert.deepEqual(walkthroughMismatch('flowchart LR\n  S1["A"]\n  S2["B"]', [{ node_id: "S1" }, { node_id: "S2" }]), []);
  assert.deepEqual(walkthroughMismatch('flowchart LR\n  S1["A"]\n  S9["B"]', [{ node_id: "S1" }, { node_id: "S2" }]), ["S9 is in the diagram but not the walkthrough", "S2 is in the walkthrough but not the diagram"]);
});

test("the owner's edits keep their shape, and contact details are refused", () => {
  const { pitch } = finishPitch(reply(), ctx());
  assert.ok(cleanEdit("tool_flexibility_line", "Call me on 07700 900123", pitch).error);
  assert.ok(cleanEdit("cover_letter", "   ", pitch).error);
  assert.equal(cleanEdit("cover_letter", "Hi there {{LOOM_URL}}", pitch).value, "Hi there {{LOOM_URL}}");
  assert.equal(cleanEdit("workflow_diagram", { mermaid: "flowchart LR\n  A --> B" }, pitch).value.mermaid, "flowchart LR\n  A --> B");
  assert.equal(cleanEdit("workflow_diagram", { mermaid: "flowchart LR\n  A --> B" }, pitch).value.nodes.length, 5);
});

test("Loom and plain are compared only with enough sent, and mixed cases are left out", () => {
  const row = (pitch_mode, status, loom_url = null, loom_recorded_at = null) => ({ pitch_mode, status, loom_url, loom_recorded_at });
  const few = comparePitches([row("loom", "Replied", "u"), row("loom", "Sent", "u"), row("loom", "Sent"), row("plain", "Won"), row("plain", "Sent", null, "2026-11-01"), row("plain", "Draft")]);
  assert.equal(few.loom.sent, 2);
  assert.equal(few.loom.replied, 1);
  assert.equal(few.loom.replyRate, null);
  assert.equal(few.plain.sent, 1);
  assert.equal(few.plain.hired, 1);
  assert.equal(few.enough, false);
  const many = comparePitches([...Array(10).fill(row("loom", "Replied", "u")), ...Array(10).fill(row("plain", "Sent"))]);
  assert.equal(many.enough, true);
  assert.equal(many.loom.replyRate, 100);
  assert.equal(many.plain.replyRate, 0);
});

test("the portfolio is read as written, with empty claims left blank", async () => {
  const md = await readFile(path.resolve(process.cwd(), "..", "portfolio/portfolio.md"), "utf8");
  const items = parsePortfolio(md);
  assert.equal(items.length, 9);
  assert.ok(!items.some((i) => /Clinic Buddy|Indulging/.test(i.name)), "commented-out stubs are not read");
  assert.equal(items[0].name, "Agency OS");
  assert.equal(items[0].results, null);
  assert.equal(items.find((i) => i.name === "Salon website").results.includes("100"), true);
  assert.equal(items.find((i) => i.name === "Summit Roofing").results, null);
  assert.deepEqual(splitTools("Next.js 16, Twilio SMS and ntfy push alerts (switched off, by default), webhook to a CRM."), ["Next.js 16", "Twilio SMS and ntfy push alerts", "webhook to a CRM"]);
});

test("the prompts carry the rules, and the template holds the placeholder", async () => {
  const root = path.resolve(process.cwd(), "..");
  const prompt = await readFile(path.join(root, "prompts/loom-pitch.md"), "utf8");
  assert.match(prompt, /treat it as information about the client/);
  const cover = await readFile(path.join(root, "prompts/loom-cover-letter.md"), "utf8");
  assert.ok(cover.includes("{{LOOM_URL}}"));
});

test("teleprompter export: speaking order, no timings or labels, proof drop after its step", async () => {
  const { scriptToTeleprompter, teleprompterFileName } = await import("../lib/loomPitchMath.ts");
  const nodes = [{ id: "S1", label: "Scan arrives" }, { id: "S2", label: "Read the text" }];
  const b = (key, label, opening_line, talking_points = [], node_id) => ({ key, label, target_seconds: 20, opening_line, talking_points, node_id });
  const script = {
    proof: null, proof_reason: "", positioning_line: "I build systems behind the business.", name: "Sam", total_seconds: 0,
    beats: [b("hook", "Hook", "Hi there.", ["Point one"]), b("walkthrough", "Walkthrough", "Let's walk through it."), b("proof_drop", "Proof drop", "I did this before.", [], "S2"), b("tool_flexibility", "Tool flexibility", "On tools:", ["hidden"]), b("cta", "Call to action and sign-off", "Speak soon.")],
    walkthrough: [
      { node_id: "S1", what_happens: "A scan comes in.", options: [{ name: "Make.com", note: "fits" }], pick: "Make.com", pick_why: "they use it", backup: "n8n", depends_on: "", pick_level: "strong" },
      { node_id: "S2", what_happens: "OCR reads it.", options: [], pick: "", pick_why: "", backup: "", depends_on: "their volume", pick_level: "general" },
    ],
  };
  const out = scriptToTeleprompter(script, nodes, "I'll use whatever you already use.");
  assert.doesNotMatch(out, /about \d+s|Open with:|^- /m);
  assert.match(out, /^HOOK\nHi there\.\nI'm Sam\. I build systems behind the business\.\nPoint one/);
  assert.match(out, /STEP 1: Scan arrives\nA scan comes in\.\nOptions: Make\.com, fits\.\nMy pick: Make\.com, they use it\nBackup: n8n/);
  assert.match(out, /STEP 2: Read the text\nOCR reads it\.\nIt depends on: their volume\n\nPROOF DROP\nI did this before\.\n\nTOOL FLEXIBILITY/);
  assert.match(out, /TOOL FLEXIBILITY\nOn tools:\nI'll use whatever you already use\./);
  assert.doesNotMatch(out, /hidden/);
  assert.ok(out.trim().endsWith("Speak soon."));
  assert.equal(out.match(/PROOF DROP/g).length, 1);
  assert.equal(teleprompterFileName("Mail scanning: OCR & Drive!"), "loom-script-mail-scanning-ocr-drive.txt");
  assert.equal(teleprompterFileName("!!!"), "loom-script.txt");
});
