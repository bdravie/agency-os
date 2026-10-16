import test from "node:test";
import assert from "node:assert/strict";
import { checklistFrom, clampCredit, lineNet, maxCredit, parseDeliverables, progress, rangeState, totals } from "../lib/dealOffers.ts";

test("an audit fee credited against the build is counted once, and one-off money stays apart from monthly", () => {
  const audit = { billing: "one_off", price: 1500, credit: 0 };
  const build = { billing: "setup", price: 6000, credit: 1500 };
  const retainer = { billing: "monthly", price: 750, credit: 0 };
  assert.equal(lineNet(build), 4500);
  const t = totals([audit, build, retainer]);
  assert.equal(t.oneOff, 6000);   // 1,500 audit + 4,500 build net = what the client pays in total, not 7,500
  assert.equal(t.monthly, 750);   // recurring is separate
  assert.equal(t.credit, 1500);
  assert.equal(t.gross, 7500);
});

test("a monthly line never carries credit", () => {
  assert.equal(lineNet({ billing: "monthly", price: 500, credit: 200 }), 500);
  assert.equal(totals([{ billing: "monthly", price: 500, credit: 200 }]).credit, 0);
});

test("credit is capped at the audit fee and at the build price", () => {
  assert.equal(maxCredit(1500, 6000), 1500);
  assert.equal(maxCredit(1500, 1000), 1000);
  assert.equal(clampCredit(9999, 1500, 6000), 1500);
  assert.equal(clampCredit(-5, 1500, 6000), 0);
  assert.equal(clampCredit(Number.NaN, 1500, 6000), 0);
});

test("price against the offer's range", () => {
  assert.equal(rangeState(500, 750, 2500), "below");
  assert.equal(rangeState(1500, 750, 2500), "within");
  assert.equal(rangeState(9000, 750, 2500), "above");
  assert.equal(rangeState(100, null, null), "unknown");
});

test("checklists are copied from the offer, start unticked, and report progress", () => {
  const list = checklistFrom(["Kick-off call", "  ", 7, "Report"]);
  assert.deepEqual(list, [{ text: "Kick-off call", done: false }, { text: "Report", done: false }]);
  list[0].done = true;
  assert.deepEqual(progress(list), { done: 1, total: 2 });
  assert.deepEqual(checklistFrom(null), []);
});

test("deliverables typed one per line", () => {
  assert.deepEqual(parseDeliverables("- One\n\n* Two  \n   Three"), ["One", "Two", "Three"]);
  assert.equal(parseDeliverables(Array.from({ length: 40 }, (_, i) => `item ${i}`).join("\n")).length, 30);
});
