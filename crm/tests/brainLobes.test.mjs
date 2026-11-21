import test from "node:test";
import assert from "node:assert/strict";
import { ALL_ITEMS } from "../components/nav-items.ts";
import { BRAIN_HREFS, BRAIN_LOBES, BRAIN_STEM } from "../lib/brainLobes.ts";
import { SPARKS, TRACES } from "../lib/brainArt.ts";

test("the brain has four lobes, clockwise from the front-left", () => {
  assert.deepEqual(BRAIN_LOBES.map((l) => [l.label, l.corner]), [["Find", "tl"], ["Sell", "tr"], ["Deliver", "br"], ["Grow", "bl"]]);
  assert.ok(BRAIN_LOBES.every((l) => l.items.length > 0), "every lobe has pages");
});

test("every page in the sidebar is reachable from the brain exactly once (the Dashboard is the brain itself)", () => {
  const sidebar = ALL_ITEMS.map((i) => i.href).filter((h) => h !== "/").sort();
  assert.deepEqual([...BRAIN_HREFS].sort(), sidebar);
  assert.equal(new Set(BRAIN_HREFS).size, BRAIN_HREFS.length);
  assert.ok(!BRAIN_STEM.some((i) => i.href === "/"));
});

test("every lobe has a trace to pulse along and two coral nodes to spark", () => {
  for (const l of BRAIN_LOBES) {
    assert.ok(TRACES.some((t) => t.lobes.includes(l.key)), `${l.key} has no trace`);
    assert.equal(SPARKS.filter((s) => s.lobe === l.key).length, 2, `${l.key} sparks`);
  }
  for (const t of TRACES) {
    const nums = t.d.match(/[\d.]+/g).map(Number);
    assert.ok(nums.every((n) => n >= 0 && n <= 100), `${t.key} stays inside the art`);
    const [x1, y1, end] = nums;
    const length = t.d.includes("V") ? Math.abs(end - y1) : Math.abs(end - x1);
    assert.ok(Math.abs(length - t.length) < 0.6, `${t.key} length ${t.length} matches its path (${length})`);
  }
});
