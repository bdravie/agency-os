// Free, offline tests of the rules (npm test). No Claude call, no network except a local stand-in for the sheet.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import { relevant, search } from "../lib/search.ts";
import { cleanFirstName, cleanOrderNumber, maskContactDetails, soundsUnhappy, unsupportedNumbers } from "../lib/text.ts";
import { articleProblem } from "../lib/articleRules.ts";
import { allowedSheetUrl, sendToSheet } from "../lib/sheets.ts";
import type { Article, Flow, Ticket } from "../lib/types.ts";

const articles = (JSON.parse(fs.readFileSync("sample-data/articles.json", "utf8")) as { articles: Article[] }).articles;
const flows = (JSON.parse(fs.readFileSync("sample-data/flows.json", "utf8")) as { flows: Flow[] }).flows;

test("sample data: 12 articles, 3 flows of 3 to 5 steps, every flow step reachable and pointing somewhere real", () => {
  assert.equal(articles.length, 12);
  assert.equal(new Set(articles.map((a) => a.id)).size, 12);
  assert.equal(flows.length, 3);
  for (const f of flows) {
    assert.ok(articles.some((a) => a.id === f.article), `${f.id} names a real article`);
    const ids = Object.keys(f.steps);
    assert.ok(ids.length >= 3 && ids.length <= 5, `${f.id} has ${ids.length} steps`);
    assert.ok(f.steps[f.start]);
    const seen = new Set<string>();
    const walk = (id: string) => {
      if (seen.has(id)) return;
      seen.add(id);
      for (const o of f.steps[id].options) {
        assert.ok(o.next ? f.steps[o.next] : o.end, `${f.id}/${id}/${o.label} goes somewhere`);
        if (o.next) walk(o.next);
      }
    };
    walk(f.start);
    assert.equal(seen.size, ids.length, `${f.id}: every step reachable`);
  }
});

test("search finds the right article for plain questions", () => {
  assert.equal(search("how do I reset my password", articles)[0].article.id, "reset-password");
  assert.equal(search("my parcel hasn't arrived", articles)[0].article.id, "late-delivery");
  assert.equal(search("when will I get my money back", articles)[0].article.id, "refunds");
});

test("search sends nothing for a question with no overlap, so Claude is not called", () => {
  assert.deepEqual(relevant(search("what's the weather like in Leeds", articles)), []);
});

test("an answer with a figure that is not in its article is refused", () => {
  const src = articles.find((a) => a.id === "refunds")!.body;
  assert.deepEqual(unsupportedNumbers("We refund within 5 working days.", src), []);
  assert.deepEqual(unsupportedNumbers("We refund within 2 working days.", src), ["2"]);
  assert.deepEqual(unsupportedNumbers("Standard delivery costs £4.95.", articles[0].body), []);
});

test("emails and phone numbers are removed before anything is sent or saved", () => {
  const m = maskContactDetails("I'm sam@example.com, call 07700 900123 or +44 7700 900456");
  assert.ok(m.masked);
  assert.ok(!/example\.com|07700|7700 900456/.test(m.text), m.text);
  assert.equal(maskContactDetails("Order TH-10482 is late").masked, false);
});

test("unhappy or asking for a person is spotted", () => {
  assert.ok(soundsUnhappy("This is ridiculous, I want to speak to a person"));
  assert.ok(soundsUnhappy("can I talk to a human"));
  assert.ok(!soundsUnhappy("How long does delivery take?"));
});

test("handover fields: first name and TH- order numbers only", () => {
  assert.equal(cleanFirstName("  Sam  "), "Sam");
  assert.equal(cleanFirstName(""), "");
  assert.equal(cleanFirstName("sam@example.com"), null);
  assert.equal(cleanOrderNumber("th-10482"), "TH-10482");
  assert.equal(cleanOrderNumber("07700900123"), null);
});

test("articles with contact details or no text are refused", () => {
  assert.match(articleProblem({ title: "Gift wrap", body: "Email jo@example.com for wrapping.", tags: [] })!, /contact details/);
  assert.match(articleProblem({ title: "Gift wrap", body: "Short", tags: [] })!, /20 to 4,000/);
  assert.equal(articleProblem({ title: "Gift wrapping", body: "We do not offer gift wrapping at the moment.", tags: ["gift"] }), null);
});

test("only an Apps Script /exec address may receive tickets", () => {
  assert.ok(allowedSheetUrl("https://script.google.com/macros/s/AKfycbx-abc_123/exec"));
  assert.ok(!allowedSheetUrl("https://script.google.com/macros/s/AKfycbx/dev"));
  assert.ok(!allowedSheetUrl("https://example.com/macros/s/x/exec"));
  assert.ok(!allowedSheetUrl("http://127.0.0.1:9/x"));
});

test("a ticket reaches the sheet through Apps Script's redirect, and a wrong secret is reported", async () => {
  // Stand-in for Apps Script: POST /exec answers 302 to a one-time address, which returns the JSON (as Google does).
  const rows: unknown[] = [];
  let pending = "";
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      if (req.method === "POST" && req.url === "/exec") {
        const { secret, row } = JSON.parse(body);
        pending = JSON.stringify(secret === "s3cret" ? (rows.push(row), { ok: true, row: rows.length + 1 }) : { ok: false, error: "not allowed" });
        res.writeHead(302, { Location: "/echo?user_content_key=abc" }).end();
      } else if (req.method === "GET" && req.url?.startsWith("/echo")) {
        res.writeHead(200, { "Content-Type": "application/json" }).end(pending);
      } else res.writeHead(404).end();
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as { port: number }).port;
  const ticket: Ticket = {
    id: "T-1001", createdAt: "2026-11-19T10:00:00Z", reason: "asked_for_person", firstName: "Sam", orderNumber: "TH-10482",
    topic: "Delivery", summary: "Parcel late.", lastQuestion: "Where is it?", articlesTried: ["My order has not arrived"],
    transcript: "Customer: Where is it?", sheet: "not_set_up", status: "open",
  };
  try {
    process.env.SUPPORT_DEMO_LOCAL_SHEET = "1";
    process.env.SHEETS_WEBHOOK_URL = `http://127.0.0.1:${port}/exec`;
    process.env.SHEETS_WEBHOOK_SECRET = "s3cret";
    assert.deepEqual(await sendToSheet(ticket), { status: "sent" });
    assert.equal(rows.length, 1);
    assert.equal((rows[0] as { ticket_id: string }).ticket_id, "T-1001");
    process.env.SHEETS_WEBHOOK_SECRET = "wrong";
    assert.deepEqual(await sendToSheet(ticket), { status: "failed", error: "not allowed" });
    delete process.env.SHEETS_WEBHOOK_URL;
    assert.deepEqual(await sendToSheet(ticket), { status: "not_set_up" });
  } finally {
    server.close();
    delete process.env.SUPPORT_DEMO_LOCAL_SHEET;
  }
});
