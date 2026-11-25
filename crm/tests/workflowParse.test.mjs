import test from "node:test";
import assert from "node:assert/strict";
import { appName, cleanParsed, MAX_STEPS, parseWorkflow, parseWorkflowText, plainStep, workflowMermaid } from "../lib/workflowParse.ts";

const node = (name, type, x, extra = {}) => ({ name, type: `n8n-nodes-base.${type}`, position: [x, 0], parameters: {}, ...extra });
const link = (...to) => ({ main: to.map((t) => (t ? [{ node: t, type: "main", index: 0 }] : [])) });
const N8N = {
  name: "Chase unpaid invoices",
  nodes: [
    node("Note", "stickyNote", 0),
    node("Every Monday", "scheduleTrigger", 0),
    node("Get unpaid invoices", "xero", 200, { parameters: { resource: "invoice", operation: "getAll", url: "https://example.com/hook?key=abc" }, credentials: { xeroOAuth2Api: { id: "9", name: "jane@example.com account" } } }),
    node("Anything overdue?", "if", 400),
    node("Email the client", "gmail", 600, { parameters: { resource: "message", operation: "send", sendTo: "jane@example.com" } }),
    node("Log it", "googleSheets", 600, { parameters: { operation: "={{ $json.op }}" } }),
    node("Switched off", "slack", 800, { disabled: true }),
    node("Left over", "set", 900),
  ],
  connections: {
    "Every Monday": link("Get unpaid invoices"), "Get unpaid invoices": link("Anything overdue?"),
    "Anything overdue?": link("Email the client", "Log it"), "Email the client": link("Switched off"),
  },
};

test("an n8n export becomes ordered steps: trigger first, branches labelled, notes and switched-off nodes left out", () => {
  const { workflow: w } = parseWorkflow(N8N);
  assert.equal(w.platform, "n8n");
  assert.deepEqual(w.steps.map((s) => [s.id, s.name, s.kind]), [
    ["s1", "Every Monday", "trigger"], ["s2", "Get unpaid invoices", "action"], ["s3", "Anything overdue?", "branch"], ["s4", "Email the client", "action"], ["s5", "Log it", "action"],
  ]);
  assert.deepEqual(w.steps[2].next, [{ to: "s4", label: "Yes" }, { to: "s5", label: "No" }]);
  assert.deepEqual(w.apps, ["Xero", "Gmail", "Google Sheets"]);       // the schedule is how it starts, not an app
  assert.equal(w.steps[1].action, "Get all invoice");
  assert.equal(w.steps[4].action, null);                               // an expression is not a plain operation name
});

test("nothing from a node's settings or credentials reaches the outline", () => {
  const kept = JSON.stringify(parseWorkflow(N8N).workflow);
  for (const secret of ["example.com", "jane@", "key=abc", "credentials", "xeroOAuth2Api"]) assert.ok(!kept.includes(secret), secret);
  const named = parseWorkflow({ nodes: [node("Email jane@example.com on 07700 900123", "gmail", 0), node("Then https://example.com/x done", "slack", 100)], connections: { "Email jane@example.com on 07700 900123": link("Then https://example.com/x done") } }).workflow;
  assert.deepEqual(named.steps.map((s) => s.name), ["Email on", "Then done"]);
});

test("an AI step lists what is plugged into it, and those helpers are not steps of their own", () => {
  const w = parseWorkflow({
    nodes: [node("When chat message", "chatTrigger", 0), { name: "Agent", type: "@n8n/n8n-nodes-langchain.agent", position: [200, 0] },
      { name: "Model", type: "@n8n/n8n-nodes-langchain.lmChatOpenAi", position: [200, 200] }, { name: "Sheet tool", type: "n8n-nodes-base.googleSheetsTool", position: [300, 200] }],
    connections: { "When chat message": link("Agent"), Model: { ai_languageModel: [[{ node: "Agent", type: "ai_languageModel", index: 0 }]] }, "Sheet tool": { ai_tool: [[{ node: "Agent", type: "ai_tool", index: 0 }]] } },
  }).workflow;
  assert.deepEqual(w.steps.map((s) => s.name), ["When chat message", "Agent"]);
  assert.equal(w.steps[1].kind, "ai");
  assert.deepEqual(w.steps[1].uses, ["OpenAI", "Google Sheets"]);
  assert.deepEqual(w.apps, ["OpenAI", "Google Sheets"]);
});

test("n8n's template wrapper and a pasted file both read; rubbish is refused with a plain reason", () => {
  assert.equal(parseWorkflow({ workflow: { name: "Outer name", workflow: { nodes: N8N.nodes, connections: N8N.connections } } }).workflow.name, "Outer name");
  assert.equal(parseWorkflowText(JSON.stringify(N8N)).workflow.steps.length, 5);
  assert.match(parseWorkflowText("{not json").error, /valid JSON/);
  assert.match(parseWorkflowText("").error, /Paste/);
  assert.match(parseWorkflowText('{"hello":1}').error, /n8n workflow or a Make blueprint/);
  assert.match(parseWorkflow({ nodes: [node("Only", "gmail", 0)], connections: {} }).error ?? parseWorkflow({ nodes: [node("Only", "webhook", 0)], connections: {} }).error, /one step|doesn't look/);
});

const MAKE = {
  name: "New enquiry to CRM",
  flow: [
    { id: 1, module: "gateway:CustomWebHook", parameters: { hook: 123 } },
    { id: 2, module: "google-sheets:addRow", mapper: { email: "jane@example.com" }, metadata: { designer: { name: "Log the enquiry" } } },
    { id: 3, module: "builtin:BasicRouter", routes: [
      { flow: [{ id: 4, module: "hubspotcrm:createContact" }, { id: 5, module: "slack:CreateMessage" }] },
      { flow: [{ id: 6, module: "util:SetVariable2" }, { id: 7, module: "email:ActionSendEmail" }] },
    ] },
  ],
};

test("a Make blueprint becomes ordered steps with its router's routes", () => {
  const { workflow: w } = parseWorkflow(MAKE);
  assert.equal(w.platform, "make");
  assert.deepEqual(w.steps.map((s) => [s.name, s.kind]), [
    ["Webhook", "trigger"], ["Log the enquiry", "action"], ["Router", "branch"], ["HubSpot: Create contact", "action"], ["Slack: Create message", "action"], ["Set variable", "logic"], ["Email: Send email", "action"],
  ]);
  assert.deepEqual(w.steps[2].next, [{ to: "s4", label: "Route 1" }, { to: "s6", label: "Route 2" }]);
  assert.deepEqual(w.steps[4].next, []);                                // the end of a route does not run on into the next route
  assert.deepEqual(w.apps, ["Google Sheets", "HubSpot", "Slack", "Email"]);
  assert.ok(!JSON.stringify(w).includes("jane@"));
  assert.equal(parseWorkflow({ blueprint: MAKE }).workflow.steps.length, 7);
});

test("a very long workflow is cut to the limit and says how many steps were left out", () => {
  const nodes = Array.from({ length: MAX_STEPS + 5 }, (_, i) => node(`Step ${i}`, i ? "slack" : "webhook", i * 10));
  const connections = Object.fromEntries(nodes.slice(0, -1).map((n, i) => [n.name, link(nodes[i + 1].name)]));
  const w = parseWorkflow({ nodes, connections }).workflow;
  assert.equal(w.steps.length, MAX_STEPS);
  assert.equal(w.dropped, 5);
  assert.deepEqual(w.steps.at(-1).next, []);
});

test("the diagram is Mermaid that always draws: rounded start, diamond decision, labels with nothing that breaks it", () => {
  const code = workflowMermaid(parseWorkflow(N8N).workflow);
  assert.match(code, /^flowchart LR/);
  assert.match(code, /s1\(\["Every Monday<br\/>Schedule"\]\)/);
  assert.match(code, /s3\{"Anything overdue\?"\}/);
  assert.match(code, /s3 -->\|"Yes"\| s4/);
  const many = Array.from({ length: 14 }, (_, i) => node(`Step ${i}`, i ? "slack" : "webhook", i * 10));
  assert.match(workflowMermaid(parseWorkflow({ nodes: many, connections: Object.fromEntries(many.slice(0, -1).map((n, i) => [n.name, link(many[i + 1].name)])) }).workflow), /^flowchart TD/);   // a long one runs down the page
  const odd = parseWorkflow({ nodes: [node('Say "hi" [now] {x} | #1', "webhook", 0), node("Done (ok)", "slack", 100)], connections: { 'Say "hi" [now] {x} | #1': link("Done (ok)") } }).workflow;
  assert.ok(!/["[\]{}()|#]/.test(workflowMermaid(odd).split("\n")[2].replace(/^\s*s2\["|"\]$/g, "")));
});

test("the plain line for a step, and app names", () => {
  const w = parseWorkflow(N8N).workflow;
  assert.equal(plainStep(w.steps[0]), "Every Monday: starts the workflow, uses Schedule.");
  assert.equal(plainStep(w.steps[1]), "Get unpaid invoices: get all invoice in Xero.");
  assert.equal(plainStep(w.steps[2]), "Anything overdue?: decides which way to go.");
  assert.equal(appName("googleSheetsTrigger"), "Google Sheets");
  assert.equal(appName("lmChatOpenRouter"), "OpenRouter");
  assert.equal(appName("invoiceNinja"), "Invoice Ninja");
  assert.equal(appName("google-sheets"), "Google Sheets");
});

test("an outline read back is tidied: unknown ids, links to missing steps and contact details go", () => {
  const w = parseWorkflow(N8N).workflow;
  const back = cleanParsed({ ...w, steps: [...w.steps.map((s) => ({ ...s, parameters: { secret: 1 } })), { id: "x9", name: "Bad" }].map((s, i) => (i === 0 ? { ...s, name: "Start jane@example.com", next: [...s.next, { to: "s99", label: null }] } : s)) });
  assert.equal(back.steps.length, 5);
  assert.equal(back.steps[0].name, "Start");
  assert.deepEqual(back.steps[0].next, [{ to: "s2", label: null }]);
  assert.ok(!JSON.stringify(back).includes("secret"));
  assert.equal(cleanParsed({ steps: [{ id: "s1", name: "One" }] }), null);
  assert.equal(cleanParsed(null), null);
});
