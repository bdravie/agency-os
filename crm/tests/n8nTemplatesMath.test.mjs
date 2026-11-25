import test from "node:test";
import assert from "node:assert/strict";
import { broaden, cleanHits, cleanSearch, cleanSearches, looksLikeUrl, templateIdFromUrl } from "../lib/n8nTemplatesMath.ts";

test("search phrases are plain words, a few of them, and at most three different ones", () => {
  assert.equal(cleanSearch("  Missed-call TEXT back (dental)!! "), "missed-call text back dental");
  assert.equal(cleanSearch("one two three four five six seven eight"), "one two three four five six");
  assert.equal(cleanSearch(42), "");
  assert.deepEqual(cleanSearches(["invoice chasing", "Invoice  chasing", "ab", "xero reminders", "late payment", "a fourth"]), ["invoice chasing", "xero reminders", "late payment"]);
  assert.deepEqual(cleanSearches("invoice"), []);
});

test("a thin search is widened with shorter versions of the same phrases, never ones already tried", () => {
  assert.deepEqual(broaden(["enquiry auto reply gmail", "lead instant response hubspot"]), ["reply gmail", "response hubspot"]);
  assert.deepEqual(broaden(["lead reply gmail", "reply gmail"]), ["lead reply"]);
  assert.deepEqual(broaden(["hubspot lead", "lead response"]), []);
  assert.deepEqual(broaden(["a b c", "d e f", "g h i"], 5), ["b c", "e f", "h i", "a b", "d e"]);
});

const reply = {
  workflows: [
    { id: 101, name: "Text back missed calls with Twilio", price: 0, purchaseUrl: null, description: "## How it works\nCatches a **missed call** and replies. See [docs](https://example.com/d) or email jane@example.com.",
      user: { name: "Jane Example", username: "jane", bio: "I build things", links: "[\"https://example.com\"]", avatar: "https://example.com/a.png" },
      nodes: [{ displayName: "Twilio" }, { displayName: "Code" }, { displayName: "Google Sheets" }, { displayName: "Sticky Note" }, { displayName: "Twilio" }] },
    { id: 102, name: "Paid one", price: 19, purchaseUrl: null, description: "", nodes: [] },
    { id: 103, name: "Also paid", price: 0, purchaseUrl: "https://example.com/buy", description: "", nodes: [] },
    { id: "x", name: "No id", price: 0 }, { id: 104, name: "", price: 0 },
  ],
};

test("a search reply is cut to an allow-list: free templates only, and never the creator's name, bio, links or picture", () => {
  const hits = cleanHits(reply);
  assert.deepEqual(hits.map((h) => h.id), [101]);
  assert.deepEqual(hits[0].apps, ["Twilio", "Google Sheets"]);
  assert.equal(hits[0].summary, "How it works Catches a missed call and replies. See docs or email");
  const kept = JSON.stringify(hits);
  for (const gone of ["Jane", "jane", "bio", "avatar", "example.com", "user"]) assert.ok(!kept.includes(gone), gone);
  assert.deepEqual(cleanHits(null), []);
  assert.deepEqual(cleanHits({ workflows: "nope" }), []);
});

test("only a link to n8n's own library, or a template number, is read as a template", () => {
  assert.equal(templateIdFromUrl("https://n8n.io/workflows/1750-creating-an-api-endpoint/"), 1750);
  assert.equal(templateIdFromUrl(" https://www.n8n.io/workflows/19112 "), 19112);
  assert.equal(templateIdFromUrl("1750"), 1750);
  assert.equal(templateIdFromUrl("http://n8n.io/workflows/1750"), null);
  assert.equal(templateIdFromUrl("https://n8n.io.example.com/workflows/1750"), null);
  assert.equal(templateIdFromUrl("https://n8n.io/integrations/slack"), null);
  assert.equal(templateIdFromUrl("https://example.com/workflows/1750"), null);
  assert.equal(templateIdFromUrl("not a link"), null);
  assert.ok(looksLikeUrl(" https://n8n.io/workflows/1 "));
  assert.ok(!looksLikeUrl('{"nodes": []}'));
});
