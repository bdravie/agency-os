// Run with: npm test   (Node's built-in test runner; reads the TypeScript directly)
import test from "node:test";
import assert from "node:assert/strict";
import { average, funnelRows, groupLost, pct, days, rangeFor, rate } from "../lib/funnelMath.ts";

test("conversion is each stage against the one before, and against the first", () => {
  const rows = funnelRows([20, 10, 5, 2, 1, 1, 1]);
  assert.equal(rows[1].pctPrev, 0.5);
  assert.equal(rows[3].pctPrev, 0.4);
  assert.equal(rows[6].pctLead, 0.05);
  assert.equal(rows[0].pctPrev, null);
});

test("never divides by zero", () => {
  assert.equal(funnelRows([0, 0])[1].pctPrev, null);
  assert.equal(rate(2, 0), null);
  assert.equal(rate(1, 4), 0.25);
});

test("lost reasons: standard codes, older free text and blanks are all grouped, none dropped, real reasons rank first on ties", () => {
  const known = [{ code: "price", label: "Price" }, { code: "timing", label: "Timing" }];
  const g = groupLost(["price", "price", "timing", "too pricey", null, ""], known);
  assert.equal(g[0].label, "Price");
  assert.equal(g.reduce((s, x) => s + x.n, 0), 6);
  assert.ok(g.some((x) => x.label.startsWith("Other")) && g.some((x) => x.label.startsWith("Not recorded")));
});

test("weeks run Monday to Sunday and months are calendar months", () => {
  const wk = rangeFor("week", 0, new Date(2026, 9, 15, 12)); // Thursday 15 Oct 2026
  assert.equal(wk.start.getDay(), 1);
  assert.equal(wk.start.getDate(), 12);
  assert.equal(wk.end.getDate(), 19);
  assert.equal(rangeFor("week", -1, new Date(2026, 9, 15, 12)).start.getDate(), 5);
  const mo = rangeFor("month", -1, new Date(2026, 0, 20)); // previous month from January is December
  assert.equal(mo.start.getMonth(), 11);
  assert.equal(mo.start.getFullYear(), 2025);
  assert.equal(rangeFor("all", 0).start, null);
});

test("average ignores missing values instead of counting them as zero", () => {
  assert.equal(average([null, undefined, "", NaN]), null);
  assert.equal(average([null, "3", 5, undefined]), 4); // numbers arrive from the database as text
  assert.equal(average([-2, 4]), 4);
});

test("formatting", () => {
  assert.equal(pct(0.256), "26%");
  assert.equal(pct(null), "–");
  assert.equal(days(3.26), "3.3 d");
  assert.equal(days(14.4), "14 d");
});
