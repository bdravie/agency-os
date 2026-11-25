import test from "node:test";
import assert from "node:assert/strict";
import {
  applicationText, caseStudyOf, chosenPain, cleanDemoEdit, cleanPainsEdit, cleanPicked, cleanPlanEdit, eligibleCases, finishDemo, finishMatches, finishPains, finishPlan,
  HEADING_OWN, HEADING_PATTERN, lineProblems, money, painBasis, planMermaid, quoteFor, quoteInPost, rankCandidates, settleDemo, stepStates, toolsToCheck, unbackedNumbers,
} from "../lib/buildPlanMath.ts";
import { DEFAULT_RATES } from "../lib/proposalPlanMath.ts";
import { parseWorkflow } from "../lib/workflowParse.ts";

const JOB = `We run a lettings agency with 3 branches. Every week our team spends hours copying new enquiries from Rightmove emails into our CRM by hand,
and we lose leads because nobody replies until the next day. We also chase 40 landlords a month for safety certificates on a spreadsheet. Budget is $800.`;

const rawPains = (o = {}) => ({
  pains: [
    { pain: "Leads go cold because nobody replies until the next day", quote: "we lose leads because nobody replies until the next day", cost: "money", why: "Each lost enquiry is a let they do not win.", search: ["Lead auto reply email", "enquiry to CRM", "lead auto reply email"] },
    { pain: "Hours a week copying enquiries into the CRM", quote: "Every week our team spends hours copying new enquiries", cost: "time", why: "Staff time across 3 branches.", search: ["email to crm"] },
    { pain: "Invented one", quote: "this sentence is not in the post at all", cost: "time", why: "" },
    { pain: "Chasing 40 landlords for certificates", quote: "chase 40 landlords a month for safety certificates", cost: "weird", why: "" },
  ], ...o,
});

test("a quote counts only if it is in the job post, whatever the case, spacing or punctuation", () => {
  assert.ok(quoteInPost("We lose leads because  nobody replies, until the next day!", JOB));
  assert.ok(quoteInPost("copying new enquiries from Rightmove emails into our CRM by hand, and we lose leads", JOB));   // across a line break
  assert.ok(!quoteInPost("we lose customers because nobody replies", JOB));
  assert.ok(!quoteInPost("lose leads", JOB));                                                                          // too short to prove anything
});

test("pain points keep the AI's ranking, drop any without a real quote, and commit to the first", () => {
  const { step, problems } = finishPains(rawPains(), JOB);
  assert.deepEqual(problems, []);
  assert.deepEqual(step.pains.map((p) => [p.id, p.cost]), [["p1", "money"], ["p2", "time"], ["p3", "both"]]);
  assert.equal(step.chosen, "p1");
  assert.deepEqual(step.search, ["lead auto reply email", "enquiry to crm"]);
  assert.equal(step.data_note, null);
  assert.match(finishPains(rawPains(), `${JOB} We hold tenants' personal data.`).step.data_note, /data processing agreement/);
});

test("pain points are refused with nothing quoted, a made-up number or a story about past clients", () => {
  assert.match(finishPains({ pains: [{ pain: "Slow replies", quote: "not in the post you see", cost: "time", why: "" }] }, JOB).problems[0], /word for word/);
  assert.match(finishPains({ pains: [] }, JOB).problems[0], /no pain points/);
  assert.match(finishPains(rawPains({ pains: [{ ...rawPains().pains[0], why: "Probably 25 lost lets a month." }] }), JOB).problems[0], /number that is not in the job post \(25\)/);
  assert.match(finishPains(rawPains({ pains: [{ ...rawPains().pains[0], why: "A previous client had the same issue." }] }), JOB).problems[0], /past client work/);
  assert.deepEqual(finishPains(rawPains({ pains: [{ ...rawPains().pains[0], search: [] }] }), JOB).step.search, ["leads cold because nobody"]);
  assert.deepEqual(unbackedNumbers("3 branches, 40 landlords, 7 days", JOB), ["7"]);
});

test("the owner's edit can reword, add and re-pick; quotes stay the post's own and contact details are refused", () => {
  const current = finishPains(rawPains(), JOB).step;
  const { value } = cleanPainsEdit({ chosen: "p2", search: ["rightmove crm"], pains: [{ id: "p1", pain: "Slow replies lose lets", quote: "typed over", cost: "money", why: "" }, { id: "p2", pain: "Copying by hand", cost: "time", why: "" }, { pain: "My own idea: 50 hours a month", cost: "time", why: "" }] }, current);
  assert.equal(value.chosen, "p2");
  assert.deepEqual(value.search, ["rightmove crm"]);                                   // typed search words win
  assert.deepEqual(cleanPainsEdit({ chosen: "p2", search: current.search, pains: current.pains }, current).value.search, ["email to crm"]);   // another angle brings its own
  assert.deepEqual(cleanPainsEdit({ chosen: "p1", search: [], pains: current.pains }, current).value.search, current.search);
  assert.equal(value.pains[0].quote, current.pains[0].quote);
  assert.deepEqual(value.pains.map((p) => p.id), ["p1", "p2", "own3"]);
  assert.equal(value.pains[2].quote, "");
  assert.equal(chosenPain({ pains: value }).pain, "Copying by hand");
  assert.equal(painBasis({ pains: value }), "copying by hand");
  assert.match(cleanPainsEdit({ pains: [{ id: "p1", pain: "Call 07700 900123", cost: "time" }] }, current).error, /email addresses and phone numbers/);
  assert.match(cleanPainsEdit({ pains: [] }, current).error, /at least one/);
  assert.equal(cleanPainsEdit({ chosen: "nope", pains: [{ id: "p2", pain: "Copying by hand" }] }, current).value.chosen, "p2");
});

const CANDS = [
  { ref: "n8n:1", source: "n8n", name: "Summarise RSS feeds with OpenAI", summary: "News digest.", apps: ["OpenAI"], url: "https://n8n.io/workflows/1" },
  { ref: "n8n:2", source: "n8n", name: "Auto reply to new lead emails with Gmail", summary: "Replies to an enquiry within a minute.", apps: ["Gmail", "HubSpot"], url: "https://n8n.io/workflows/2" },
  { ref: "lib:7", source: "library", name: "Enquiry to CRM and reply", summary: "Stops leads going cold.", apps: ["Gmail"], url: null },
  { ref: "n8n:3", source: "n8n", name: "Post to Slack", summary: "", apps: [], url: "https://n8n.io/workflows/3" },
];

test("candidates are ranked by shared words, with the owner's own workflows given a head start", () => {
  const ranked = rankCandidates(CANDS, "leads go cold because nobody replies to a new enquiry email");
  assert.deepEqual(ranked.map((c) => c.ref).slice(0, 2), ["lib:7", "n8n:2"]);
  assert.equal(rankCandidates(CANDS, "enquiry", 2).length, 2);
});

test("the top 3 can only be workflows that were found; a reason with a figure or a claim becomes a plain one; gaps are topped up", () => {
  const m = finishMatches({ picks: [{ ref: "n8n:2", reason: "Replies to the enquiry while they are still looking." }, { ref: "n8n:99", reason: "made up" }, { ref: "lib:7", reason: "Cuts response time by 80%." }, { ref: "n8n:2", reason: "again" }] }, CANDS);
  assert.deepEqual(m.map((x) => x.ref), ["n8n:2", "lib:7", "n8n:1"]);
  assert.equal(m[0].reason, "Replies to the enquiry while they are still looking.");
  assert.equal(m[1].reason, "From your own library. Uses Gmail.");                   // the plain reason says whose it is
  assert.equal(m[2].reason, "Uses OpenAI.");
  assert.deepEqual(finishMatches(null, CANDS.slice(3)).map((x) => x.reason), ["Closest by name."]);
  assert.deepEqual(finishMatches({ picks: [] }, []), []);
});

const node = (name, type, x) => ({ name, type: `n8n-nodes-base.${type}`, position: [x, 0], parameters: {} });
const link = (...to) => ({ main: to.map((t) => [{ node: t, type: "main", index: 0 }]) });
const WF = parseWorkflow({ name: "Reply to new enquiries", nodes: [node("New enquiry email", "gmailTrigger", 0), node("Is it a real lead?", "if", 100), node("Add to HubSpot", "hubspot", 200), node("Send reply in 5 minutes", "gmail", 300)],
  connections: { "New enquiry email": link("Is it a real lead?"), "Is it a real lead?": link("Add to HubSpot"), "Add to HubSpot": link("Send reply in 5 minutes") } }).workflow;
const picked = (o = {}) => ({ ref: "n8n:2", source: "n8n", own: false, name: "Auto reply to new lead emails", url: "https://n8n.io/workflows/2", workflow: WF, ...o });
const PROOF = [
  { id: 1, name: "Harbour Lettings", kind: "client", client_type: "A lettings agency", one_line: "An enquiry inbox for Harbour Lettings that replies and files each lead.", problem_solved: "Harbour Lettings lost enquiries overnight.", results: "Replies now go out the same hour.", tags: ["lettings"], tools: ["n8n"] },
  { id: 2, name: "Reels engine", kind: "own_business", client_type: null, one_line: "My own content pipeline from idea to post.", problem_solved: "Posting took a day a week.", results: null, tags: [], tools: [] },
  { id: 3, name: "Missed call demo", kind: "demo", one_line: "A demo of missed-call text back.", problem_solved: "Missed calls are lost bookings.", results: null, tags: [], tools: [] },
  { id: 4, name: "Half filled", kind: "client", one_line: "Something for a client.", problem_solved: null, results: null, tags: [], tools: [] },
];

test("only real work with the problem written down is a case study; demos never are", () => {
  assert.deepEqual(eligibleCases(PROOF).map((p) => p.id), [1, 2]);
});

test("a case study is the owner's own words, with the client's name swapped out and nothing added", () => {
  const c = caseStudyOf(PROOF[0]);
  assert.deepEqual(c, { proof_id: 1, client_type: "A lettings agency", problem: "The client lost enquiries overnight.", built: "An enquiry inbox for the client that replies and files each lead.", results: "Replies now go out the same hour." });
  assert.deepEqual(caseStudyOf(PROOF[1]), { proof_id: 2, client_type: "My own business", problem: "Posting took a day a week.", built: "My own content pipeline from idea to post.", results: null });
  assert.equal(caseStudyOf({ ...PROOF[0], client_type: "" }).client_type, "A client");
});

const rawDemo = (o = {}) => ({
  summary: "Catches each new enquiry and replies while the person is still looking.",
  walkthrough: [{ id: "s1", text: "A new enquiry email arrives in the shared inbox." }, { id: "s2", text: "It checks whether the email is a real enquiry." }, { id: "s4", text: "It sends a reply in 5 minutes." }, { id: "s9", text: "Not a step." }],
  case_id: 1, case_reason: "Same problem: enquiries going unanswered.", ...o,
});

test("the demo has one line per step in the workflow's order, code-written where the AI gave none, and the heading follows where it came from", () => {
  const { step, problems } = finishDemo(rawDemo(), picked(), eligibleCases(PROOF), "leads go cold");
  assert.deepEqual(problems, []);
  assert.deepEqual(step.walkthrough.map((w) => w.id), ["s1", "s2", "s3", "s4"]);
  assert.equal(step.walkthrough[2].text, "Add to HubSpot: uses HubSpot.");
  assert.equal(step.walkthrough[3].text, "It sends a reply in 5 minutes.");            // 5 is in the step's own name
  assert.equal(step.heading, HEADING_PATTERN);
  assert.equal(finishDemo(rawDemo(), picked({ own: true, source: "library", ref: "lib:7" }), [], "x").step.heading, HEADING_OWN);
  assert.match(step.mermaid, /^flowchart LR/);
  assert.equal(step.case_study.proof_id, 1);
  assert.equal(step.ref, "n8n:2");
});

test("a case study can only be one from the table: an unknown id or a demo means no client story", () => {
  assert.equal(finishDemo(rawDemo({ case_id: 3 }), picked(), eligibleCases(PROOF), "x").step.case_study, null);
  assert.equal(finishDemo(rawDemo({ case_id: null }), picked(), eligibleCases(PROOF), "x").step.case_study, null);
  assert.equal(finishDemo(rawDemo({ case_id: 99, case_reason: "why" }), picked(), eligibleCases(PROOF), "x").step.case_reason, "");
});

test("a line with a figure, a number of its own, a client claim or contact details is caught, and replaced by code if it comes back again", () => {
  assert.deepEqual(lineProblems("Saves the team 10 hours a week"), ["a number"]);
  assert.deepEqual(lineProblems("Lifts replies by 40%"), ["a figure or a guarantee", "a number"]);
  assert.deepEqual(lineProblems("I built this for a client last year"), ["a claim about client work"]);
  assert.deepEqual(lineProblems("Guaranteed to reply"), ["a figure or a guarantee"]);
  assert.deepEqual(lineProblems("Emails the client their invoice"), []);
  const r = finishDemo(rawDemo({ summary: "Cuts response time by 80%.", walkthrough: [{ id: "s1", text: "Saved another client 12 hours a week." }] }), picked(), [], "x");
  assert.deepEqual(r.bad, ["s1", "summary"]);
  assert.equal(r.problems.length, 2);
  const settled = settleDemo(r.step, picked(), r.bad);
  assert.equal(settled.walkthrough[0].text, "New enquiry email: starts the workflow, uses Gmail.");
  assert.equal(settled.summary, "Auto reply to new lead emails");
  assert.match(settled.notes[0], /1 walkthrough line was written by code/);
  assert.equal(settleDemo(r.step, picked(), []), r.step);
});

test("the owner's edit to the demo keeps their wording, lets them swap or drop the case study, and refuses contact details", () => {
  const current = finishDemo(rawDemo(), picked(), eligibleCases(PROOF), "x").step;
  const { value } = cleanDemoEdit({ heading: "How I handle this", walkthrough: [{ id: "s1", text: "Saved a client 10 hours (my real number)." }], case_id: 2 }, current, picked(), eligibleCases(PROOF));
  assert.equal(value.heading, "How I handle this");
  assert.equal(value.walkthrough[0].text, "Saved a client 10 hours (my real number).");
  assert.equal(value.walkthrough[1].text, current.walkthrough[1].text);
  assert.equal(value.case_study.proof_id, 2);
  assert.equal(value.case_reason, "");
  assert.equal(cleanDemoEdit({ case_id: null }, current, picked(), eligibleCases(PROOF)).value.case_study, null);
  assert.equal(cleanDemoEdit({ case_id: 1 }, current, picked(), eligibleCases(PROOF)).value.case_reason, current.case_reason);
  assert.equal(cleanDemoEdit({ case_id: 3 }, current, picked(), eligibleCases(PROOF)).value.case_study, null);
  assert.match(cleanDemoEdit({ summary: "Email me on jane@example.com" }, current, picked(), []).error, /email addresses/);
});

const rawPlan = (o = {}) => ({
  flow: [
    { label: "Rightmove enquiry arrives", detail: "A new Rightmove enquiry email lands in your shared inbox.", tool: "Gmail" },
    { label: "Read the enquiry", detail: "The enquiry is read and the property and contact preference are pulled out.", tool: null },
    { label: "Add to your CRM", detail: "A lead record is created in your CRM for the right one of your 3 branches.", tool: "Your CRM" },
    { label: "Reply straight away", detail: "The enquirer gets a reply the same hour, in your wording.", tool: "Gmail" },
    { label: "Tell the branch", detail: "The branch sees the new lead with what to do next.", tool: null },
  ],
  branches: [{ from: 2, to: 5, label: "Not an enquiry" }, { from: 1, to: 2, label: "dup" }, { from: 9, to: 1, label: "bad" }],
  outcomes: ["A lead record in your CRM for every enquiry", "A weekly list of enquiries and how fast each was answered"],
  access: ["Access to the shared enquiries inbox", "An API key or login for your CRM"],
  milestones: [
    { name: "Enquiry capture", delivers: ["Enquiries read and filed in the CRM"], ease: "medium", hours_low: 4, hours_high: 6 },
    { name: "Replies and branch alerts", delivers: ["Reply template in your wording"], ease: "hard", hours_low: 3, hours_high: 5 },
  ],
  assumptions: ["Your CRM has an API"], ...o,
});

test("the tailored plan is finished in code: a diagram that draws, branches that exist, and no price, promise, made-up number or client story", () => {
  const { step, problems } = finishPlan(rawPlan(), JOB, "leads go cold", "n8n:2");
  assert.deepEqual(problems, []);
  assert.equal(step.flow.length, 5);
  assert.deepEqual(step.branches, [{ from: 2, to: 5, label: "Not an enquiry" }, { from: 1, to: 2, label: "dup" }]);
  assert.match(step.mermaid, /S1\["Rightmove enquiry arrives"\]/);
  assert.match(step.mermaid, /S2 -->\|"Not an enquiry"\| S5/);
  assert.equal(step.mermaid.match(/S1 -->/g).length, 1);                        // a branch that only repeats the next step adds no second arrow
  assert.equal(step.basis, "leads go cold");
  const bad = (o) => finishPlan(rawPlan(o), JOB, "x", "").problems.join(" | ");
  assert.match(bad({ outcomes: ["Replies within 2 minutes", "A dashboard"] }), /number that is not in the job post \(2\)/);
  assert.match(bad({ assumptions: ["Fixed price of £500"] }), /price, a percentage or a guarantee/);
  assert.match(bad({ access: ["Like I did for a previous client"] }), /past client work/);
  assert.match(bad({ flow: rawPlan().flow.slice(0, 2) }), /needs 4 to 9/);
  assert.match(bad({ milestones: [] }), /at least 2 milestones/);
  assert.match(finishPlan(rawPlan(), `${JOB} It includes patient records.`, "x", "").step.data_note, /data processing agreement/);
});

test("a tool in the plan is flagged only when it is in neither the job post nor the owner's tool lists", () => {
  const flow = [{ label: "a", detail: "b", tool: "Rightmove" }, { label: "a", detail: "b", tool: "n8n" }, { label: "a", detail: "b", tool: "Zapier" }, { label: "a", detail: "b", tool: "Your CRM" }, { label: "a", detail: "b", tool: null }, { label: "a", detail: "b", tool: "Make.com" }];
  assert.deepEqual(toolsToCheck(flow, JOB, { strong_tools: ["n8n"], familiar_tools: ["Make"] }), ["Zapier"]);
});

test("the timeline is whole working days in order, and the milestone prices add up to the fixed price exactly", () => {
  const q = quoteFor(rawPlan().milestones, DEFAULT_RATES);
  // 5h x £45 = £225; 4h x £45 x 1.25 = £225; +15% = £517.50, rounded up to £520
  assert.equal(q.total, 520);
  assert.deepEqual(q.lines.map((l) => [l.days, l.from_day, l.to_day, l.price]), [[1, 1, 1, 260], [1, 2, 2, 260]]);
  assert.equal(q.days, 2);
  const uneven = quoteFor([{ name: "A", delivers: [], ease: "easy", hours_low: 1, hours_high: 1 }, { name: "B", delivers: [], ease: "easy", hours_low: 13, hours_high: 13 }, { name: "C", delivers: [], ease: "hard", hours_low: 7, hours_high: 7 }], DEFAULT_RATES);
  assert.equal(uneven.lines.reduce((s, l) => s + l.price, 0), uneven.total);
  assert.deepEqual(uneven.lines.map((l) => [l.from_day, l.to_day]), [[1, 1], [2, 4], [5, 6]]);
  const tiny = quoteFor([{ name: "A", delivers: [], ease: "easy", hours_low: 0.5, hours_high: 0.5 }], DEFAULT_RATES);
  assert.equal(tiny.total, DEFAULT_RATES.min_project_gbp);                       // never below the minimum project price
  assert.equal(tiny.lines[0].price, DEFAULT_RATES.min_project_gbp);
  assert.equal(money(520, "GBP", 0.75), "£520");
  assert.equal(money(520, "USD", 0.75), "$695");
  assert.equal(money(1520, "USD", null), "£1,520");                              // no saved rate, so it stays in pounds
});

test("the owner's edit to the plan keeps their numbers and rebuilds the diagram unless they typed their own", () => {
  const current = finishPlan(rawPlan(), JOB, "x", "").step;
  const { value } = cleanPlanEdit({ ...rawPlan({ outcomes: ["Replies within 2 minutes"] }), mermaid: "" }, current);
  assert.deepEqual(value.outcomes, ["Replies within 2 minutes"]);
  assert.equal(value.mermaid, planMermaid(value.flow, value.branches));
  assert.equal(cleanPlanEdit({ ...rawPlan(), mermaid: "flowchart TD\n  A --> B" }, current).value.mermaid, "flowchart TD\n  A --> B");
  assert.match(cleanPlanEdit(rawPlan({ access: ["Ring 07700 900123"] }), current).error, /email addresses and phone numbers/);
  assert.match(cleanPlanEdit(rawPlan({ flow: [] }), current).error, /at least 2 steps/);
});

test("a step is out of date when the angle or the workflow it was built for changes", () => {
  const pains = finishPains(rawPains(), JOB).step, basis = painBasis({ pains });
  const demo = finishDemo(rawDemo(), picked(), [], basis).step, plan = finishPlan(rawPlan(), JOB, basis, "n8n:2").step;
  const bp = { pains, matches: { basis, search: [], matches: [], considered: 0, notes: [] }, workflow: picked(), demo, plan };
  assert.deepEqual(stepStates(bp), { pains: "ready", matches: "ready", demo: "ready", plan: "ready" });
  assert.deepEqual(stepStates({ ...bp, pains: { ...pains, chosen: "p2" } }), { pains: "ready", matches: "stale", demo: "stale", plan: "stale" });
  assert.deepEqual(stepStates({ ...bp, workflow: picked({ ref: "lib:7" }) }), { pains: "ready", matches: "ready", demo: "stale", plan: "stale" });
  assert.deepEqual(stepStates(null), { pains: "empty", matches: "empty", demo: "empty", plan: "empty" });
  assert.deepEqual(stepStates({ pains, plan: finishPlan(rawPlan(), JOB, basis, "").step }), { pains: "ready", matches: "empty", demo: "empty", plan: "ready" });   // a plan can stand without a workflow
});

test("a chosen workflow read back keeps only the outline, and only the owner's own counts as theirs", () => {
  assert.equal(cleanPicked({ ...picked(), own: true }).own, false);                               // a public template is never "mine"
  assert.equal(cleanPicked({ ...picked({ source: "pasted", ref: "pasted:1", url: "https://example.com/x" }), own: true }).own, true);
  assert.equal(cleanPicked({ ...picked({ source: "pasted", ref: "pasted:1", url: "https://example.com/x" }) }).url, null);
  assert.equal(cleanPicked({ ...picked({ source: "library", ref: "lib:7" }) }).own, true);
  assert.equal(cleanPicked({ ref: "x", workflow: null }), null);
});

test("the application text is put together by code, leaves out anything out of date, and prices in the chosen currency", () => {
  const pains = finishPains(rawPains(), JOB).step, basis = painBasis({ pains });
  const demo = finishDemo(rawDemo(), picked(), eligibleCases(PROOF), basis).step, plan = finishPlan(rawPlan(), JOB, basis, "n8n:2").step;
  const bp = { pains, workflow: picked(), demo, plan };
  const t = applicationText(bp, DEFAULT_RATES);
  assert.match(t, /THE PROBLEM I'D SOLVE FIRST\nLeads go cold/);
  assert.match(t, /A WORKFLOW PATTERN I'D START FROM FOR THIS KIND OF PROBLEM/);
  assert.match(t, /Who for: A lettings agency/);
  assert.ok(!t.includes("Harbour"));
  assert.match(t, /1\. Enquiry capture \(day 1\): £260/);
  assert.match(t, /Timeline: 2 working days from the day I have access\.\nFixed price: £520/);
  assert.match(applicationText(bp, DEFAULT_RATES, { currency: "USD", usdToGbp: 0.75 }), /Fixed price: \$695/);
  const moved = applicationText({ ...bp, pains: { ...pains, chosen: "p2" } }, DEFAULT_RATES);
  assert.match(moved, /Hours a week copying/);
  assert.ok(!moved.includes("MY PLAN FOR YOU") && !moved.includes("WORKFLOW PATTERN"));
  assert.equal(applicationText({}, DEFAULT_RATES), "");
});

test("a digit inside a tool's name is not a made-up figure, and does not back a real one", () => {
  assert.deepEqual(unbackedNumbers("n8n reads it, GA4 counts it, v2 of the S3 export", JOB), []);
  assert.deepEqual(unbackedNumbers("n81 and 8 more", JOB), ["8"]);                                   // the rest of a name is skipped; a real number is still caught
  assert.deepEqual(unbackedNumbers("8 branches", "We use n8n."), ["8"]);                               // the 8 in n8n does not excuse a figure
  assert.deepEqual(unbackedNumbers("3 branches, 1,200 leads and 2.5 hours", `${JOB} 1,200 leads.`), ["2.5"]);
  const withN8n = rawPlan();
  withN8n.flow[1].tool = "n8n";
  assert.deepEqual(finishPlan(withN8n, JOB, "leads go cold", "n8n:2").problems, []);                   // the job post never mentions n8n
  assert.deepEqual(lineProblems("n8n checks whether the email is a real enquiry."), []);
  assert.deepEqual(lineProblems("It replies within 5 minutes."), ["a number"]);
});

test("your own workflows come first: the demos you built and your library are scored against the job, and the similar ones go ahead of any public template", async () => {
  const { ownFirst, OWN_SIMILAR, headingOf, HEADING_DEMO } = await import("../lib/buildPlanMath.ts");
  const CLINIC = "We are a dental practice. We miss calls at lunch and patients book elsewhere. We want an automatic WhatsApp text back for missed calls using Twilio and n8n.";
  const mine = [
    { ref: "demo:invoice-inbox", source: "demo", name: "Invoice inbox to draw request (demo)", summary: "Supplier invoices arriving by email are read, filed and logged.", apps: ["Gmail", "Google Sheets"], url: null, tags: ["invoices", "make", "gmail"] },
    { ref: "demo:missed-call", source: "demo", name: "Missed-call WhatsApp text-back for clinics (demo)", summary: "A missed call to a clinic gets a WhatsApp reply within seconds.", apps: ["Twilio", "n8n"], url: null, tags: ["dental", "missed-calls", "whatsapp", "twilio"] },
    { ref: "lib:7", source: "library", name: "Missed calls to SMS", summary: "Texts back anyone whose call was missed.", apps: ["Twilio"], url: null, tags: ["missed-calls"] },
  ];
  const pub = [{ ref: "n8n:1", source: "n8n", name: "WhatsApp missed call text back with Twilio", summary: "Text back missed calls on WhatsApp.", apps: ["Twilio", "WhatsApp"], url: "https://n8n.io/workflows/1" }, { ref: "n8n:2", source: "n8n", name: "Dental booking bot", summary: "", apps: [], url: "https://n8n.io/workflows/2" }];
  const { ranked, first } = ownFirst([...mine, ...pub], CLINIC);
  assert.deepEqual(ranked.map((c) => c.ref), ["demo:missed-call", "lib:7", "demo:invoice-inbox"]);       // public templates are never scored as yours
  assert.deepEqual(first.map((c) => c.ref), ["demo:missed-call", "lib:7"]);
  assert.equal(OWN_SIMILAR, 60);                                                                          // the owner's bar: over 60 out of 100
  assert.ok(first.every((c) => c.score > OWN_SIMILAR) && ranked[2].score <= OWN_SIMILAR);
  assert.ok(first[0].shares.includes("Twilio") && first[0].shares.includes("missed calls"));

  // Whatever the AI ranks, your similar ones stay in front, in their own order; the AI's picks fill what is left.
  const all = [...ranked, ...pub];
  const m = finishMatches({ picks: [{ ref: "n8n:1", reason: "Texts the caller back on WhatsApp straight after a missed call." }, { ref: "lib:7", reason: "Texts back every missed caller." }, { ref: "n8n:2", reason: "A booking bot." }] }, all, first);
  assert.deepEqual(m.map((x) => [x.ref, x.source]), [["demo:missed-call", "demo"], ["lib:7", "library"], ["n8n:1", "n8n"]]);
  assert.match(m[0].reason, /^A demo you built\. Shares .*Twilio/);                                       // no AI reason for it, so a plain one that says it is a demo
  assert.equal(m[1].reason, "Texts back every missed caller.");
  assert.equal(m[0].score, first[0].score);
  assert.deepEqual(finishMatches(null, all, first).map((x) => x.ref), ["demo:missed-call", "lib:7", "demo:invoice-inbox"]);   // the AI failed: yours first, then the list's own order
  assert.deepEqual(finishMatches({ picks: [] }, pub, first).map((x) => x.ref), ["n8n:1", "n8n:2"]);      // one that was not found cannot be put first
  // Asked for n8n's library as well: yours stay in front and public templates take the extra places, so the tick always shows something new.
  const wide = finishMatches({ picks: [{ ref: "lib:7", reason: "Texts back every missed caller." }] }, all, first, 5);
  assert.deepEqual(wide.map((x) => x.ref), ["demo:missed-call", "lib:7", "n8n:1", "n8n:2", "demo:invoice-inbox"]);
  assert.deepEqual(finishMatches(null, all, first, 4).map((x) => x.source), ["demo", "library", "n8n", "n8n"]);
  assert.deepEqual(ownFirst(pub, CLINIC), { ranked: [], first: [] });
  assert.deepEqual(ownFirst(mine, "Something about payroll exports.").first, []);                         // nothing of yours is forced in when none is close

  // A demo is called a demo: never "a workflow I use", even though it is yours. The long reference of a demo survives a round trip.
  const demo = cleanPicked({ ...picked({ source: "demo", ref: "demo:consent-first-lead-capture-and-journey-t", url: null }), own: true });
  assert.deepEqual([demo.source, demo.own, demo.ref], ["demo", false, "demo:consent-first-lead-capture-and-journey-t"]);
  assert.equal(headingOf(demo), HEADING_DEMO);
  assert.equal(headingOf({ own: true, source: "library" }), HEADING_OWN);
  assert.equal(headingOf({ own: false, source: "n8n" }), HEADING_PATTERN);
  assert.equal(finishDemo(rawDemo(), demo, [], "x").step.heading, "A demo workflow I built for this kind of problem");
  assert.equal(stepStates({ pains: finishPains(rawPains(), JOB).step, workflow: demo, demo: { ...finishDemo(rawDemo(), demo, [], "leads go cold because nobody replies until the next day").step } }).demo, "ready");
});

// ---------- The client page (buildPlanPageMath.ts) ----------

test("the client page is the saved plan step by step, with tools as chips, the places the flow jumps, and the same prices as the application", async () => {
  const { clientPage, clientPageBlock, clientPageHref } = await import("../lib/buildPlanPageMath.ts");
  const pains = finishPains(rawPains(), JOB).step, basis = painBasis({ pains });
  const demo = finishDemo(rawDemo(), picked(), eligibleCases(PROOF), basis).step, plan = finishPlan(rawPlan(), JOB, basis, "n8n:2").step;
  const bp = { pains, workflow: picked(), demo, plan };
  const page = clientPage(bp, DEFAULT_RATES);
  assert.equal(clientPageBlock(bp), null);
  assert.deepEqual(page.problem, { text: pains.pains[0].pain, quote: pains.pains[0].quote });
  assert.deepEqual(page.steps.map((s) => [s.n, s.title, s.stack]), [[1, "Rightmove enquiry arrives", ["Gmail"]], [2, "Read the enquiry", []], [3, "Add to your CRM", ["Your CRM"]], [4, "Reply straight away", ["Gmail"]], [5, "Tell the branch", []]]);
  assert.deepEqual(page.steps[1].jumps, [{ label: "Not an enquiry", to: 5, back: false }]);         // the next step in line is not a jump
  assert.deepEqual(page.steps[0].jumps, []);
  assert.deepEqual(page.outcomes, plan.outcomes);
  assert.deepEqual(page.milestones.map((m) => [m.name, m.when, m.price]), [["Enquiry capture", "Day 1", "£260"], ["Replies and branch alerts", "Day 2", "£260"]]);
  assert.equal(page.timeline, "2 working days");
  assert.equal(page.total, "£520");
  assert.equal(page.caseStudy.client_type, "A lettings agency");
  assert.ok(!JSON.stringify(page).includes("Harbour"));                                              // a real client is never named
  assert.equal(page.dataNote, null);

  assert.equal(clientPage(bp, DEFAULT_RATES, { currency: "USD", usdToGbp: 0.75, showPrice: true }).total, "$695");
  const quiet = clientPage(bp, DEFAULT_RATES, { currency: "GBP", usdToGbp: null, showPrice: false });
  assert.equal(quiet.total, null);
  assert.deepEqual(quiet.milestones.map((m) => m.price), [null, null]);
  assert.equal(quiet.timeline, "2 working days");                                                    // the days stay when the price is left off

  // A plan built for another angle gives no page; a stale demo only loses its case study.
  const moved = { ...bp, pains: { ...pains, chosen: "p2" } };
  assert.equal(clientPage(moved, DEFAULT_RATES), null);
  assert.match(clientPageBlock(moved), /different pain point/);
  assert.match(clientPageBlock({ pains }), /step 4/);
  assert.equal(clientPage({}, DEFAULT_RATES), null);
  assert.equal(clientPage({ ...bp, demo: { ...demo, ref: "n8n:9" } }, DEFAULT_RATES).caseStudy, null);
  assert.match(clientPage({ ...bp, plan: finishPlan(rawPlan(), `${JOB} We hold tenants' personal data.`, basis, "n8n:2").step }, DEFAULT_RATES).dataNote, /data processing agreement comes first/);

  assert.deepEqual([page.title, page.client, page.intro, page.closing], [null, null, null, null]);   // nothing of the owner's own until they type it
  assert.equal(clientPageHref(7, { currency: "GBP", showPrice: true }), "/proposals/7/build-plan");
  assert.equal(clientPageHref(7, { currency: "USD", showPrice: false }), "/proposals/7/build-plan?currency=usd&price=0");
  assert.equal(clientPageHref(7, { currency: "USD", showPrice: true, edit: true }), "/proposals/7/build-plan?edit=1&currency=usd");
});

test("every step carries its full tech stack: the AI's list is kept in order, gaps are named, and each tool is checked on its own", async () => {
  const { splitStack, stackOf, stepsWithoutStack } = await import("../lib/buildPlanMath.ts");
  const { clientPage, stackGapNote } = await import("../lib/buildPlanPageMath.ts");
  assert.deepEqual(splitStack("Shopify, Klaviyo / OpenAI and shopify; Slack"), ["Shopify", "Klaviyo", "OpenAI", "Slack"]);
  assert.deepEqual(splitStack("Rightmove/Zoopla, AT&T"), ["Rightmove/Zoopla", "AT&T"]);                 // only a spaced divider splits a name
  assert.deepEqual(splitStack("Your CRM"), ["Your CRM"]);
  assert.deepEqual(splitStack(null), []);
  assert.equal(splitStack("a,b,c,d,e,f,g,h").length, 6);

  const raw = rawPlan();
  raw.flow = raw.flow.map((f, i) => ({ label: f.label, detail: f.detail, stack: [["Gmail", "n8n"], ["n8n", "OpenAI"], ["n8n", "Your CRM"], ["n8n", "Gmail", "gmail"], []][i] }));
  const { step, problems, missing } = finishPlan(raw, JOB, "leads go cold", "n8n:2");
  assert.deepEqual(problems, []);                                                                       // a gap is asked for again, never a reason to throw the plan away
  assert.deepEqual(missing, [5]);
  assert.deepEqual(step.flow.map((f) => f.tool), ["Gmail, n8n", "n8n, OpenAI", "n8n, Your CRM", "n8n, Gmail", null]);
  assert.deepEqual(stackOf(step.flow[3]), ["n8n", "Gmail"]);
  assert.deepEqual(stepsWithoutStack(step.flow), [5]);
  assert.deepEqual(finishPlan(rawPlan(), JOB, "leads go cold", "n8n:2").missing, [2, 5]);              // an older reply with one tool a step still reads

  const pains = finishPains(rawPains(), JOB).step, bp = { pains, plan: { ...step, basis: painBasis({ pains }), ref: "" } };
  assert.deepEqual(clientPage(bp, DEFAULT_RATES).steps.map((s) => s.stack), [["Gmail", "n8n"], ["n8n", "OpenAI"], ["n8n", "Your CRM"], ["n8n", "Gmail"], []]);
  assert.match(stackGapNote(bp), /No tech stack on step 5\./);
  assert.equal(stackGapNote({ pains, plan: { ...bp.plan, flow: bp.plan.flow.slice(0, 4) } }), null);
  assert.deepEqual(toolsToCheck(step.flow, JOB, { strong_tools: ["n8n", "Gmail"], familiar_tools: [] }), ["OpenAI"]);   // each tool on its own; "Your CRM" is theirs
  // The owner's own typing in step 4 is one comma list, tidied the same way.
  assert.equal(cleanPlanEdit({ ...rawPlan(), flow: [{ label: "A step", detail: "It happens.", tool: " Gmail ,n8n,  gmail " }, { label: "B step", detail: "Then this.", tool: "" }] }, step).value.flow[0].tool, "Gmail, n8n");
});

test("editing the client page saves the owner's words: step text into the plan, the page's own lines beside it, contact details refused", async () => {
  const { clientPage, cleanPageEdit, pageDraft } = await import("../lib/buildPlanPageMath.ts");
  const pains = finishPains(rawPains(), JOB).step, basis = painBasis({ pains });
  const plan = finishPlan(rawPlan(), JOB, basis, "").step, bp = { pains, plan };
  const TITLE = "Lettings enquiry follow-up";
  const draft = pageDraft(clientPage(bp, DEFAULT_RATES), TITLE);
  assert.equal(draft.title, TITLE);
  assert.equal(draft["step.0.stack"], "Gmail");
  assert.equal(draft["mile.0.delivers"], "Enquiries read and filed in the CRM");
  assert.equal(draft.outcomes.split("\n").length, 2);

  // Saved untouched, nothing changes and nothing of the owner's own is stored (so the title keeps following the proposal).
  const same = cleanPageEdit(draft, bp, TITLE).value;
  assert.deepEqual(same.plan, plan);
  assert.deepEqual(same.page, { basis, title: "", client: "", intro: "", problem: "", closing: "" });

  const edited = cleanPageEdit({
    ...draft, title: "Never lose a Rightmove enquiry again", client: "Harbour Lettings", intro: "  Built around your 3 branches.  ", problem: "Enquiries wait until the next day", closing: "A 15 minute call to confirm access.",
    "step.1.title": "Read and sort it", "step.1.detail": "Each enquiry is read and sorted in 2 minutes.", "step.1.stack": "n8n, OpenAI,n8n",
    outcomes: "- A lead record for every enquiry\n\n• A weekly list", access: "Inbox access", assumptions: "", "mile.0.name": "Capture", "mile.0.delivers": "Filed in the CRM\nA test run",
  }, bp, TITLE).value;
  assert.deepEqual(edited.page, { basis, title: "Never lose a Rightmove enquiry again", client: "Harbour Lettings", intro: "Built around your 3 branches.", problem: "Enquiries wait until the next day", closing: "A 15 minute call to confirm access." });
  assert.deepEqual([edited.plan.flow[1].label, edited.plan.flow[1].detail, edited.plan.flow[1].tool], ["Read and sort it", "Each enquiry is read and sorted in 2 minutes.", "n8n, OpenAI"]);   // their own figure is theirs
  assert.deepEqual(edited.plan.outcomes, ["A lead record for every enquiry", "A weekly list"]);
  assert.deepEqual(edited.plan.assumptions, []);
  assert.deepEqual([edited.plan.milestones[0].name, edited.plan.milestones[0].delivers, edited.plan.milestones[0].hours_low, edited.plan.milestones[0].ease], ["Capture", ["Filed in the CRM", "A test run"], 4, "medium"]);   // hours and prices are not touched
  assert.deepEqual(edited.plan.branches, plan.branches);
  assert.match(edited.plan.mermaid, /Read and sort it/);                                              // a diagram drawn by code follows the new title
  assert.equal(cleanPageEdit({ ...draft, "step.1.title": "Read and sort it" }, { pains, plan: { ...plan, mermaid: "flowchart LR\n  A[My own] --> B[Drawing]" } }, TITLE).value.plan.mermaid, "flowchart LR\n  A[My own] --> B[Drawing]");   // the owner's own is left alone

  // The page shows the owner's words, and their wording of the problem only while the plan is about that pain point.
  const shown = clientPage({ pains, plan: edited.plan, page: edited.page }, DEFAULT_RATES);
  assert.deepEqual([shown.title, shown.client, shown.intro, shown.closing, shown.problem.text], ["Never lose a Rightmove enquiry again", "Harbour Lettings", "Built around your 3 branches.", "A 15 minute call to confirm access.", "Enquiries wait until the next day"]);
  assert.equal(shown.problem.quote, pains.pains[0].quote);                                            // the quote stays the job post's own
  const other = { ...pains, chosen: "p2" }, otherBasis = painBasis({ pains: other });
  assert.equal(clientPage({ pains: other, plan: { ...edited.plan, basis: otherBasis }, page: edited.page }, DEFAULT_RATES).problem.text, "Hours a week copying enquiries into the CRM");

  assert.match(cleanPageEdit({ ...draft, intro: "Call me on 07700 900123" }, bp, TITLE).error, /email addresses and phone numbers/);
  assert.match(cleanPageEdit({ ...draft, "step.2.detail": "Write to hello@example.com" }, bp, TITLE).error, /email addresses and phone numbers/);
  assert.match(cleanPageEdit({ ...draft, "step.2.title": " " }, bp, TITLE).error, /Step 3 needs a title/);
  assert.match(cleanPageEdit({ ...draft, "mile.1.name": "" }, bp, TITLE).error, /Milestone 2 needs a name/);
  const fewer = { ...draft }; delete fewer["step.4.title"];
  assert.match(cleanPageEdit(fewer, bp, TITLE).error, /plan has changed since this page was opened/);  // never saved over a plan that moved on
  assert.match(cleanPageEdit(draft, { ...bp, pains: other }, TITLE).error, /different pain point/);
  assert.match(cleanPageEdit("nope", bp, TITLE).error, /could not be read/);
});

test("Send to my n8n from step 2: only a workflow this plan found or chose, and only one with a file to fetch", async () => {
  const { sendKind } = await import("../lib/buildPlanMath.ts");
  const match = (ref, source) => ({ ref, source, name: ref, summary: "", apps: [], url: null, reason: "" });
  const bp = { matches: { basis: "", search: [], considered: 3, notes: [], matches: [match("demo:missed-call", "demo"), match("lib:7", "library"), match("n8n:1750", "n8n")] }, workflow: { ref: "n8n:2001" } };
  assert.equal(sendKind(bp, "n8n:1750"), "n8n");                  // a public template on a card
  assert.equal(sendKind(bp, "demo:missed-call"), "demo");         // a demo you built
  assert.equal(sendKind(bp, "n8n:2001"), "n8n");                  // the chosen one, e.g. from a pasted template link
  assert.equal(sendKind(bp, "lib:7"), null);                      // only its outline was ever saved
  assert.equal(sendKind(bp, "n8n:9999"), null);                   // a template this plan never found is not fetched
  assert.equal(sendKind({ workflow: { ref: "pasted:abc" } }, "pasted:abc"), null);
  assert.equal(sendKind({}, "n8n:1750"), null);
  assert.equal(sendKind(bp, ""), null);
});

test("one of your own takes a place only over 60: under it, it is left out and named, and a public template takes the place", async () => {
  const { clearTheBar, heldNote, finishMatches, OWN_SIMILAR } = await import("../lib/buildPlanMath.ts");
  const own = (ref, source, score) => ({ ref, source, name: `Workflow ${ref}`, summary: "", apps: [], url: null, score, shares: [] });
  const strong = own("demo:missed-call", "demo", 75), exact = own("demo:on-the-line", "demo", OWN_SIMILAR), weak = own("lib:7", "library", 41);
  const pub = [1, 2, 3].map((n) => ({ ref: `n8n:${n}`, source: "n8n", name: `Template ${n}`, summary: "", apps: [], url: `https://n8n.io/workflows/${n}` }));

  // One of yours cleared the bar: it leads, the two under it (60 exactly is not over 60) are left out, and templates fill the places.
  const some = clearTheBar([strong, exact, weak, ...pub], [strong]);
  assert.deepEqual(some.pool.map((c) => c.ref), ["demo:missed-call", "n8n:1", "n8n:2", "n8n:3"]);
  assert.deepEqual([some.held.map((c) => c.ref), some.fallback], [["demo:on-the-line", "lib:7"], false]);
  assert.deepEqual(finishMatches(null, some.pool, [strong]).map((m) => m.ref), ["demo:missed-call", "n8n:1", "n8n:2"]);
  assert.match(heldNote(some.held), /^2 of your own workflows came close but did not score over 60 \(the closest was Workflow demo:on-the-line at 60 out of 100\)/);

  // None of yours cleared it: all three places go to public templates, whatever the AI says about yours.
  const none = clearTheBar([exact, weak, ...pub], []);
  assert.deepEqual(none.pool.map((c) => c.source), ["n8n", "n8n", "n8n"]);
  assert.deepEqual(finishMatches({ picks: [{ ref: "lib:7", reason: "Close." }] }, none.pool, []).map((m) => m.ref), ["n8n:1", "n8n:2", "n8n:3"]);
  assert.match(heldNote([weak]), /^Your own Workflow lib:7 at 41 out of 100 did not score over 60, so it was left out\./);

  // One of yours cleared it and no template was found: only that one is offered, never padded out with the weaker ones.
  assert.deepEqual(clearTheBar([strong, weak], [strong]).pool.map((c) => c.ref), ["demo:missed-call"]);
  // Nothing else at all: the closest of yours stay, flagged as a fallback, so the step is never empty while you have workflows.
  assert.deepEqual(clearTheBar([exact, weak], []), { pool: [exact, weak], held: [], fallback: true });
  assert.deepEqual(clearTheBar(pub, []), { pool: pub, held: [], fallback: false });
  assert.deepEqual(clearTheBar([], []), { pool: [], held: [], fallback: false });
  assert.equal(heldNote([]), "");
  assert.equal(heldNote([own("demo:far", "demo", 5)]), "");                                               // nowhere near the job: left out without a word
  assert.match(heldNote([own("demo:far", "demo", 5), weak]), /^Your own Workflow lib:7 at 41 out of 100/); // only the near miss is named
});
