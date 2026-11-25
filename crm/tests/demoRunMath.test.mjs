import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { parse } from "yaml";
import { cleanRecipes, commandProblem, joinDemos, mainWorkflowFile, n8nImportLines, pickTop, rankDemos, tidyOutput } from "../lib/demoRunMath.ts";
import { n8nProblem, n8nTarget, n8nUnreachable, orderForImport, pushSummary, toCreateBody, NODE_KEYS } from "../lib/n8nPushMath.ts";
import { parseWorkflowText } from "../lib/workflowParse.ts";

const ROOT = new URL("../../", import.meta.url);
const recipe = (o = {}) => ({ folder: "missed-call", proof: "Missed-call", title: "Missed-call text-back", shows: "The steps on sample calls.", steps: [["node", "demos/missed-call/scripts/test.mjs"]], ...o });

test("a command may only start with node, python or npm, and may not point outside the project", () => {
  assert.equal(commandProblem(["node", "demos/x/scripts/run.mjs", "--no-llm"]), null);
  assert.equal(commandProblem(["python", "-m", "agency.client_report", "--client", "Harbour & Co Interiors"]), null);   // run as written, with no shell, so & is only a character
  assert.match(commandProblem(["bash", "-c", "rm -rf ."]), /must start with node, python, npm/);
  assert.match(commandProblem(["open", "report.html"]), /must start with/);
  assert.match(commandProblem(["node", "/etc/passwd"]), /outside the project/);
  assert.match(commandProblem(["node", "demos/../../secrets.mjs"]), /outside the project/);
  assert.match(commandProblem(["node", "~/x.mjs"]), /outside the project/);
  assert.match(commandProblem("node x.mjs"), /not a short list/);
  assert.match(commandProblem(["node", "a\nb"]), /not a short list/);
  assert.match(commandProblem([]), /not a short list/);
});

test("a recipe that breaks a rule is left out and named, without hiding the others", () => {
  const { recipes, problems } = cleanRecipes({ demos: [
    recipe(),
    recipe({ folder: "served", serve: { command: ["npm", "run", "dev"], cwd: "demo", port: 3100, env: { SUPPORT_DEMO_NO_LLM: "1" }, open: [{ label: "Chat", url: "http://127.0.0.1:3100/" }] }, steps: [] }),
    recipe({ folder: "bad-step", steps: [["sh", "x"]] }),
    recipe({ folder: "crm-port", serve: { command: ["node", "x.mjs"], port: 3000, open: [{ label: "x", url: "http://127.0.0.1:3000/" }] } }),
    recipe({ folder: "elsewhere", serve: { command: ["node", "x.mjs"], port: 4000, open: [{ label: "x", url: "https://example.com/" }] } }),
    recipe({ folder: "other-port", serve: { command: ["node", "x.mjs"], port: 4000, open: [{ label: "x", url: "http://127.0.0.1:4001/" }] } }),
    recipe({ folder: "keys", serve: { command: ["node", "x.mjs"], port: 4000, env: { ANTHROPIC_API_KEY: "x" }, open: [{ label: "x", url: "http://127.0.0.1:4000/" }] } }),
    recipe({ folder: "db", serve: { command: ["node", "x.mjs"], port: 4000, env: { DATABASE_URL: "x" }, open: [{ label: "x", url: "http://127.0.0.1:4000/" }] } }),
    recipe({ folder: "empty", steps: [] }),
    recipe({ folder: "../up" }),
    recipe(),
    recipe({ folder: "n8n-out", n8n: ["demos/other/n8n/x.json"] }),
    recipe({ folder: "n8n-shell", n8n: ["demos/n8n-shell/n8n/x.json; rm -rf ."] }),
  ] });
  assert.deepEqual(recipes.map((r) => r.folder), ["missed-call", "served"]);
  assert.deepEqual(recipes[1].serve, { command: ["npm", "run", "dev"], cwd: "demo", port: 3100, env: { SUPPORT_DEMO_NO_LLM: "1" }, open: [{ label: "Chat", url: "http://127.0.0.1:3100/" }] });
  assert.equal(recipes[0].serve, null);
  assert.equal(problems.length, 11);
  assert.match(cleanRecipes({ demos: [recipe({ make: ["demos/elsewhere/make/x.json"] })] }).problems[0], /the make files must be/);
  const both = cleanRecipes({ demos: [recipe({ n8n: ["demos/missed-call/n8n/a.json", "demos/missed-call/n8n/b.json"], make: ["demos/missed-call/make/c.json"] }), recipe({ folder: "made", make: ["demos/made/make/c.json"] }), recipe({ folder: "none" })] }).recipes;
  assert.deepEqual(both.map(mainWorkflowFile), ["demos/missed-call/n8n/a.json", "demos/made/make/c.json", null]);   // n8n before Make, the first one listed
  assert.match(problems.join("\n"), /bad-step: a step must start with/);
  assert.match(problems.join("\n"), /crm-port: the port must be a free one/);
  assert.match(problems.join("\n"), /elsewhere: each address to open must start http:\/\/127\.0\.0\.1:4000\//);
  assert.match(problems.join("\n"), /keys: may not set ANTHROPIC_API_KEY/);
  assert.match(problems.join("\n"), /db: may not set DATABASE_URL/);
  assert.match(problems.join("\n"), /empty: has nothing to run/);
  assert.match(problems.join("\n"), /missed-call: is listed twice/);
  assert.deepEqual(cleanRecipes(null), { recipes: [], problems: [] });
});

test("config/demos.yaml is all runnable: every entry passes, every folder and file it names exists, and every run is the offline one", () => {
  const { recipes, problems } = cleanRecipes(parse(readFileSync(new URL("config/demos.yaml", ROOT), "utf8")));
  assert.deepEqual(problems, []);
  assert.ok(recipes.length >= 7);
  for (const r of recipes) {
    assert.ok(existsSync(new URL(`demos/${r.folder}/README.md`, ROOT)), `${r.folder} has no README`);
    assert.ok(r.shows.length > 20, `${r.folder} does not say what running it shows`);
    for (const f of [...r.n8n, ...r.make]) assert.ok(existsSync(new URL(f, ROOT)), `${f} is missing`);
    // Its main workflow reads as an outline (what the Build plan shows as a workflow you already have), and every n8n file can be sent.
    const main = mainWorkflowFile(r);
    if (main) assert.ok(parseWorkflowText(readFileSync(new URL(main, ROOT), "utf8")).workflow?.steps.length > 1, `${main} could not be read as a workflow`);
    for (const f of r.n8n) {
      const made = toCreateBody(JSON.parse(readFileSync(new URL(f, ROOT), "utf8")));
      assert.ok(made.value, `${f}: ${made.error}`);
      assert.deepEqual(Object.keys(made.value.body).sort(), ["connections", "name", "nodes", "settings"]);
      assert.ok(made.value.body.nodes.every((n) => Object.keys(n).every((k) => NODE_KEYS.includes(k))));
    }
    for (const cmd of [...r.steps, ...(r.serve ? [r.serve.command] : [])]) {
      for (const a of cmd.filter((x) => x.startsWith("demos/"))) assert.ok(existsSync(new URL(a, ROOT)), `${a} is missing`);
      assert.ok(!cmd.includes("--ai") && !cmd.includes("--fresh"), `${r.folder} must run its offline mode`);
    }
  }
  // The ones that would otherwise call a model are pinned to their offline mode.
  const flat = (folder) => { const r = recipes.find((x) => x.folder === folder); return [...r.steps, ...(r.serve ? [r.serve.command] : [])].flat().join(" ") + JSON.stringify(r.serve?.env ?? {}); };
  assert.match(flat("event-listing-to-social-post-queue"), /--no-llm/);
  assert.match(flat("invoice-inbox-to-draw-request"), /inbox --no-llm/);
  assert.match(flat("client-report"), /--no-llm/);
  assert.match(flat("support-chatbot-with-human-handover"), /SUPPORT_DEMO_NO_LLM/);
  assert.deepEqual(n8nImportLines(recipes.find((x) => x.folder === "client-report")), ["npx n8n import:workflow --input=demos/client-report/n8n/weekly-client-report.json"]);
});

const PROOF = [
  { id: 1, name: "Missed-call WhatsApp text-back for clinics (demo)", kind: "demo", one_line: "A missed call to a clinic gets a WhatsApp reply within seconds.", problem_solved: "Clinics lose bookings when calls ring out at lunch.", tags: ["clinics", "dental", "missed-calls", "whatsapp", "twilio", "n8n", "demo"], tools: ["n8n", "Twilio"] },
  { id: 2, name: "Invoice inbox to draw request (demo)", kind: "demo", one_line: "Supplier invoices arriving by email are read, filed and logged.", problem_solved: "Typing invoices into a tracker by hand.", tags: ["invoices", "make", "gmail", "google-sheets", "construction", "demo"], tools: ["Make.com", "Gmail", "Google Sheets"] },
  { id: 3, name: "Salon website (demo)", kind: "demo", one_line: "A booking website for a salon with a missed calls page and WhatsApp button for the dental chair.", problem_solved: "", tags: ["beauty", "website", "missed-calls", "whatsapp", "dental", "twilio", "demo"], tools: ["Twilio", "n8n"] },
  { id: 4, name: "Harbour Lettings", kind: "client", one_line: "Missed calls answered on WhatsApp with Twilio.", problem_solved: "", tags: ["missed-calls"], tools: ["Twilio"] },
];
const RECIPES = cleanRecipes({ demos: [recipe({ folder: "missed-call", proof: "Missed-call WhatsApp" }), recipe({ folder: "invoice-inbox", proof: "Invoice inbox" }), recipe({ folder: "voice", proof: "AI voice", title: "AI voice receptionist", shows: "Sample phone enquiries answered by a voice." })] }).recipes;
const CLINIC = "We are a dental practice. We miss calls at lunch and patients book elsewhere. We want an automatic WhatsApp text back for missed calls using Twilio and n8n.";

test("only demos are candidates, each joined to its recipe; a recipe with no proof entry still counts", () => {
  const cands = joinDemos(PROOF, RECIPES);
  assert.deepEqual(cands.map((c) => [c.key, c.recipe?.folder ?? null]), [["proof:1", "missed-call"], ["proof:2", "invoice-inbox"], ["proof:3", null], ["folder:voice", "voice"]]);   // the client is never offered as a demo
  assert.equal(cands[3].name, "AI voice receptionist");
});

test("demos are scored out of 100 on shared tags, tools and wording, best first, with what was found", () => {
  const ranked = rankDemos(CLINIC, joinDemos(PROOF, RECIPES));
  assert.deepEqual(ranked.map((m) => m.key), ["proof:1", "proof:3", "proof:2", "folder:voice"]);   // the two with nothing in common keep their order
  assert.ok(ranked[0].score >= 80 && ranked[0].score <= 100, String(ranked[0].score));
  assert.equal(ranked.at(-1).score, 0);
  assert.deepEqual(ranked.at(-1).shares, []);
  assert.deepEqual(ranked[0].shares.slice(0, 2), ["n8n", "Twilio"]);                       // tools first
  assert.ok(ranked[0].shares.includes("missed calls") && ranked[0].shares.includes("whatsapp"));
  assert.ok(!ranked[0].shares.includes("twilio") && !ranked[0].shares.includes("demo"));   // said once; a label tag is not a match
  assert.ok(ranked.every((m) => Number.isInteger(m.score) && m.score >= 0 && m.score <= 100));
  const invoices = rankDemos("Supplier invoices arrive in Gmail and must be logged in Google Sheets. Make.com preferred.", joinDemos(PROOF, RECIPES));
  assert.equal(invoices[0].key, "proof:2");
  assert.deepEqual(invoices[0].shares.slice(0, 3), ["Make.com", "Gmail", "Google Sheets"]);
  assert.deepEqual(rankDemos("", joinDemos(PROOF, RECIPES)).map((m) => m.score), [0, 0, 0, 0]);
  assert.deepEqual(rankDemos(CLINIC, []), []);
});

test("the selection is the three closest that can be run, plus any closer one that cannot, so nothing is hidden", () => {
  const { top, closer } = pickTop(rankDemos(CLINIC, joinDemos(PROOF, RECIPES)));
  assert.deepEqual(top.map((m) => m.recipe.folder), ["missed-call", "invoice-inbox", "voice"]);
  assert.deepEqual(closer, []);                                                            // the salon site scores under the best runnable one
  const noRecipe = pickTop(rankDemos(CLINIC, joinDemos(PROOF, RECIPES.filter((r) => r.folder !== "missed-call"))));
  assert.deepEqual(noRecipe.top.map((m) => m.recipe.folder), ["invoice-inbox", "voice"]);
  assert.deepEqual(noRecipe.closer.map((m) => m.key), ["proof:1", "proof:3"]);
  assert.deepEqual(pickTop([]), { top: [], closer: [] });
});

test("what a run printed is shown without colour codes, and only the end of something very long", () => {
  assert.equal(tidyOutput("\u001b[32mok\u001b[0m one  \r\nok two\n\n"), "ok one\nok two");
  const long = tidyOutput(`${"x".repeat(7000)}END`, 100);
  assert.ok(long.startsWith("…\n") && long.endsWith("END") && long.length === 102);
});

// ---------- Send to my n8n (n8nPushMath.ts) ----------

test("n8n's address is your own local one unless you set another, and a key is only ever sent over https or to this computer", () => {
  assert.deepEqual(n8nTarget(undefined).target, { base: "http://localhost:5678", label: "localhost:5678", local: true });
  assert.deepEqual(n8nTarget("  http://127.0.0.1:5678/ ").target, { base: "http://127.0.0.1:5678", label: "127.0.0.1:5678", local: true });
  assert.deepEqual(n8nTarget("https://brad.app.n8n.cloud/api/v1/").target, { base: "https://brad.app.n8n.cloud", label: "brad.app.n8n.cloud", local: false });
  assert.match(n8nTarget("http://brad.app.n8n.cloud").error, /must start with https/);
  assert.match(n8nTarget("ftp://localhost").error, /must start with https/);
  assert.match(n8nTarget("https://me:secret@example.com").error, /name and password out/);
  assert.match(n8nTarget("not an address").error, /not a web address/);
});

test("a workflow file is cut down to exactly what n8n's API accepts, and always arrives switched off", () => {
  const file = {
    id: "OldId01", name: "  Missed call text-back  ", active: true, versionId: "v", meta: { instanceId: "x" }, tags: [{ name: "demo" }], pinData: { A: [{ json: { x: 1 } }] },
    nodes: [{ id: "1", name: "Webhook", type: "n8n-nodes-base.webhook", typeVersion: 2, position: [0, 0], parameters: { path: "missed" }, webhookId: "w1", onError: "continueRegularOutput", credentials: { twilioApi: { id: "9", name: "Twilio" } }, issues: {}, extra: 1 }],
    connections: { Webhook: { main: [[]] } }, settings: { executionOrder: "v1", errorWorkflow: "ErrId02", somethingNew: true },
  };
  const { value } = toCreateBody(file);
  assert.deepEqual(Object.keys(value.body), ["name", "nodes", "connections", "settings"]);            // no id, active, meta, tags or pinned test data
  assert.equal(value.body.name, "Missed call text-back");
  assert.deepEqual(Object.keys(value.body.nodes[0]).sort(), ["credentials", "id", "name", "onError", "parameters", "position", "type", "typeVersion", "webhookId"]);
  assert.deepEqual(value.body.settings, { executionOrder: "v1" });                                       // the error workflow is re-pointed by the sender, never sent as the old id
  assert.deepEqual([value.oldId, value.errorWorkflow], ["OldId01", "ErrId02"]);
  assert.deepEqual(toCreateBody({ name: "x", nodes: [{ name: "a", type: "t" }], connections: {} }).value.body.settings, { executionOrder: "v1" });
  assert.match(toCreateBody({ name: "Make blueprint", flow: [] }).error, /not an n8n workflow file/);
  assert.match(toCreateBody({ name: " ", nodes: [{ name: "a", type: "t" }], connections: {} }).error, /no name/);
  assert.match(toCreateBody({ name: "x", nodes: [], connections: {} }).error, /could not read/);
  assert.match(toCreateBody(null).error, /not an n8n workflow file/);
});

test("a workflow another one names as its error workflow is added first, and problems are said in plain words", () => {
  const items = [{ oldId: "A", errorWorkflow: "C", body: {} }, { oldId: "B", errorWorkflow: "C", body: {} }, { oldId: "C", errorWorkflow: null, body: {} }];
  assert.deepEqual(orderForImport(items).map((i) => i.oldId), ["C", "A", "B"]);
  assert.deepEqual(orderForImport(items.slice(0, 2)).map((i) => i.oldId), ["A", "B"]);
  assert.match(n8nProblem(401, "{}", "localhost:5678"), /refused the API key.*Settings > n8n API/);
  assert.match(n8nProblem(404, "", "x.app.n8n.cloud"), /Check N8N_API_URL/);
  assert.equal(n8nProblem(400, JSON.stringify({ message: "request/body must NOT have additional properties" }), "localhost:5678"), "n8n at localhost:5678 did not accept it (400): request/body must NOT have additional properties.");
  assert.match(n8nUnreachable({ base: "http://localhost:5678", label: "localhost:5678", local: true }), /npx n8n/);
  assert.match(n8nUnreachable({ base: "https://x.app.n8n.cloud", label: "x.app.n8n.cloud", local: false }), /Check the address/);
  assert.equal(pushSummary([{ status: "added" }, { status: "added" }, { status: "already" }, { status: "failed" }], "localhost:5678"), "2 added, 1 already there, 1 not added in n8n at localhost:5678.");
});
