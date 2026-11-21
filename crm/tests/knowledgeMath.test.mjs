import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { parse } from "yaml";
import {
  assembleAnswer, buildIndex, chunkMarkdown, citedRefs, parseAnswer, parseInline, passagesBlock, questionProblem, retrieve, tokenise,
} from "../lib/knowledgeMath.ts";

const ROOT = path.resolve(process.cwd(), "..");

test("a Markdown file is cut into one passage per section, with the heading path", () => {
  const md = "# Contracts\nIntro line.\n\n## Data processing agreement\nNeeded when you process personal data.\n\n## Retainer\n- hours\n- notice";
  const ps = chunkMarkdown("knowledge/contracts/x.md", "contracts", md);
  assert.deepEqual(ps.map((p) => p.heading), ["Contracts", "Contracts > Data processing agreement", "Contracts > Retainer"]);
  assert.match(ps[2].text, /- hours\n\n- notice|- hours\n- notice/);
  assert.ok(ps.every((p) => p.topic === "contracts" && p.file === "knowledge/contracts/x.md"));
});

test("a long section is split into passages under the size limit, never mid-fence", () => {
  const long = Array.from({ length: 40 }, (_, i) => `- Point ${i} about retainers and notice periods for clients.`).join("\n");
  const ps = chunkMarkdown("f.md", "t", `## Big\n${long}\n\n\`\`\`js\nconst a = 1;\n\nconst b = 2;\n\`\`\``, 400);
  assert.ok(ps.length > 3);
  assert.ok(ps.every((p) => p.text.length <= 400 + 80));
  assert.ok(ps.some((p) => p.text.includes("const a = 1;\n\nconst b = 2;")), "a code block stays whole");
});

test("front matter is not a passage", () => {
  const ps = chunkMarkdown("f.md", "t", "---\nname: x\n---\n# Title\nBody");
  assert.equal(ps.length, 1);
  assert.equal(ps[0].heading, "Title");
});

test("words are matched across endings", () => {
  assert.deepEqual(tokenise("Contracts contracting"), ["contract", "contract"]);
  assert.ok(!tokenise("what is the").length, "stop words are dropped");
});

test("retrieval ranks the passage about the question first and respects the topic", () => {
  const ps = [
    ...chunkMarkdown("a.md", "contracts", "## Data processing agreement\nArticle 28 says a processor must act on instructions.\n\n## Late payment\nStatutory interest on invoices."),
    ...chunkMarkdown("b.md", "design", "## Motion\nAnimate transform and opacity. Respect reduce motion.\n\n## Colour\nContrast ratio 4.5:1."),
  ];
  const idx = buildIndex(ps);
  assert.equal(retrieve(idx, "what goes in a data processing agreement?")[0].heading, "Data processing agreement");
  assert.equal(retrieve(idx, "how should I animate things", { topic: "design" })[0].heading, "Motion");
  assert.equal(retrieve(idx, "animate", { topic: "contracts" }).length, 0, "another topic's passages are not searched");
  assert.equal(retrieve(idx, "the of and").length, 0, "a question of stop words finds nothing");
  assert.ok(retrieve(idx, "interest invoices contrast motion", { k: 2 }).length <= 2);
});

test("questions with contact details, empty or too long are refused", () => {
  assert.equal(questionProblem("Which contracts do I send a clinic?"), null);
  assert.match(questionProblem("   "), /Type a question/);
  assert.match(questionProblem("email jo@example.com about it"), /email addresses/);
  assert.match(questionProblem("call 07700 900123 tomorrow"), /phone numbers/);
  assert.match(questionProblem("ring +44 7700 900123"), /phone numbers/);
  assert.match(questionProblem("x".repeat(2001)), /under 2,000/);
  assert.equal(questionProblem("Is a 30 day notice period normal for a £1500 retainer?"), null, "ordinary numbers are fine");
});

test("passages are numbered K1, K2 for the AI to cite", () => {
  const block = passagesBlock(chunkMarkdown("a.md", "t", "## One\nfirst\n\n## Two\nsecond"));
  assert.match(block, /^\[K1\] a\.md > One\nfirst/);
  assert.match(block, /\[K2\] a\.md > Two\nsecond/);
  assert.match(passagesBlock([]), /No passage/);
});

test("an answer is read back into headings, paragraphs, lists and code", () => {
  const blocks = parseAnswer("Send a DPA first [K1].\n\n### Why\n- Article 28 [K1, K2]\n- **Clinics** need a DPIA\n  as well\n1. one\n2. two\n\n```\ncode\n```");
  assert.deepEqual(blocks.map((b) => b.kind), ["p", "h", "ul", "ol", "code"]);
  assert.equal(blocks[2].items[1], "**Clinics** need a DPIA as well");
  assert.equal(blocks[4].text, "code");
});

test("inline bold, code and citations are recognised; HTML stays text", () => {
  assert.deepEqual(parseInline("A **b** `c` [K1, W2] <script>"), [
    { t: "text", v: "A " }, { t: "bold", v: "b" }, { t: "text", v: " " }, { t: "code", v: "c" }, { t: "text", v: " " },
    { t: "cite", v: "K1" }, { t: "cite", v: "W2" }, { t: "text", v: " <script>" },
  ]);
  assert.deepEqual(citedRefs("x [K2] y [K1, K2] z [W1]"), ["K2", "K1", "W1"]);
});

test("web citations become numbered sources, https only, each page once", () => {
  const { text, webSources } = assembleAnswer([
    { type: "thinking", text: "" },
    { type: "text", text: "The ICO says so.", citations: [{ type: "web_search_result_location", url: "https://ico.org.uk/a", title: "ICO" }] },
    { type: "web_search_tool_result", content: [] },
    { type: "text", text: " Again.", citations: [{ type: "web_search_result_location", url: "https://ico.org.uk/a", title: "ICO" }, { type: "web_search_result_location", url: "http://insecure.test", title: "x" }] },
  ]);
  assert.equal(text, "The ICO says so. [W1] Again. [W1]");
  assert.deepEqual(webSources, [{ ref: "W1", kind: "web", title: "ICO", url: "https://ico.org.uk/a" }]);
});

test("pages a web search returned are listed even when the answer cites none (dynamic filtering), at most 6", () => {
  const results = Array.from({ length: 8 }, (_, i) => ({ type: "web_search_result", url: `https://site${i}.test/p`, title: `Site ${i}` }));
  const { text, webSources } = assembleAnswer([
    { type: "server_tool_use" },
    { type: "web_search_tool_result", content: [{ type: "web_search_result", url: "http://plain.test", title: "x" }, ...results] },
    { type: "code_execution_tool_result" },
    { type: "text", text: "The rate is on the Bank of England site." },
  ]);
  assert.equal(text, "The rate is on the Bank of England site.");
  assert.equal(webSources.length, 6);
  assert.deepEqual(webSources[0], { ref: "W1", kind: "web", title: "Site 0", url: "https://site0.test/p" });
  assert.equal(assembleAnswer([{ type: "web_search_tool_result", content: { type: "web_search_tool_result_error", error_code: "max_uses_exceeded" } }]).webSources.length, 0, "an error result is not a list");
});

test("every knowledge topic in config/knowledge.yaml has at least one file, and no listed file is missing", () => {
  const cfg = parse(readFileSync(path.join(ROOT, "config", "knowledge.yaml"), "utf8"));
  for (const [key, t] of Object.entries(cfg.topics)) {
    let files = 0;
    for (const src of t.sources) {
      if (src.endsWith("/*.md")) {
        const dir = path.join(ROOT, src.slice(0, -5));
        assert.ok(existsSync(dir), `${key}: folder ${src} is missing`);
        files += readdirSync(dir).filter((f) => f.endsWith(".md")).length;
      } else {
        assert.ok(existsSync(path.join(ROOT, src)), `${key}: ${src} is missing`);
        files++;
      }
    }
    assert.ok(files > 0, `${key} has no files`);
  }
});

test("the knowledge files hold no email addresses or phone numbers", () => {
  const dir = path.join(ROOT, "knowledge");
  for (const sub of readdirSync(dir, { withFileTypes: true })) {
    if (!sub.isDirectory()) continue;
    for (const f of readdirSync(path.join(dir, sub.name)).filter((x) => x.endsWith(".md"))) {
      const text = readFileSync(path.join(dir, sub.name, f), "utf8");
      for (const line of text.split("\n").filter((l) => l.trim())) {
        assert.equal(questionProblem(line.slice(0, 1999)), null, `${sub.name}/${f} holds contact details: ${line.slice(0, 80)}`);
      }
    }
  }
});
