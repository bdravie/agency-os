import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { BODY_MAX, CODE_MAX, TITLE_MAX, checkFlowchartFields, copyTitle, diagramKind, fileSlug, isVersion, likePattern, parseFlowchartId, pngPlan, resolveEngineTheme } from "../lib/flowchartMath.ts";
import { fitView, zoomAt, ZOOM_MAX, ZOOM_MIN } from "../lib/flowchartViewMath.ts";
import { createFlowchart, deleteFlowchart, duplicateFlowchart, listFlowcharts, loadFlowchart, sameOrigin, saveFlowchart } from "../lib/flowchartApi.ts";
import { parseTemplates } from "../lib/flowchartTemplates.ts";

const V1 = "2026-11-05 10:00:00.123456+00", V2 = "2026-11-05 10:00:01.654321+00";

// The same behaviour as the real store's SQL, in memory.
function fakeStore() {
  const rows = new Map();
  let next = 1, clock = 0;
  const stamp = () => `2026-11-05 10:00:${String(++clock).padStart(2, "0")}.000001+00`;
  return {
    rows,
    async list(q) { return [...rows.values()].filter((r) => !q || r.title.includes(q) || r.code.includes(q)).map(({ code, ...r }) => ({ ...r, kind: diagramKind(code) })); },
    async get(id) { const r = rows.get(id); return r ? { ...r } : null; },
    async create(f) { const r = { id: next++, ...f, created_at: "now", updated_at: "now", version: stamp() }; rows.set(r.id, r); return { ...r }; },
    async update(id, f, base) {
      const r = rows.get(id);
      if (!r) return null;
      if (base && base !== r.version) return { conflict: { ...r } };
      Object.assign(r, f, { version: stamp() });
      return { row: { ...r } };
    },
    async remove(id) { return rows.delete(id); },
  };
}
const send = (o) => JSON.stringify(o);
const seeded = async (fields = {}) => {
  const store = fakeStore();
  const { body } = await createFlowchart(store, send({ title: "Journey", code: "flowchart TD\n  A --> B", ...fields }));
  return { store, row: body.flowchart };
};

// ---------- what may be saved ----------
test("a diagram is tidied before saving, and the theme defaults to following the CRM", () => {
  const r = checkFlowchartFields({ title: "  My \n flow  ", code: "flowchart TD\r\n  A\u0000 --> B" });
  assert.deepEqual(r, { ok: true, value: { title: "My flow", code: "flowchart TD\n  A --> B", theme: "auto" } });
});
test("a blank or over-long title, over-long code and an unknown theme are refused", () => {
  assert.match(checkFlowchartFields({ title: "  ", code: "" }).error, /title/);
  assert.match(checkFlowchartFields({ title: "x".repeat(TITLE_MAX + 1), code: "" }).error, /title/);
  assert.match(checkFlowchartFields({ title: "x", code: "x".repeat(CODE_MAX + 1) }).error, /too long/);
  assert.match(checkFlowchartFields({ title: "x", code: "", theme: "neon" }).error, /theme/);
  assert.match(checkFlowchartFields({ title: 5, code: "" }).error, /text/);
  assert.match(checkFlowchartFields({ title: "x", code: ["a"] }).error, /text/);
  assert.equal(checkFlowchartFields("nope").ok, false);
  assert.equal(checkFlowchartFields(null).ok, false);
});
test("the longest allowed diagram is accepted", () => {
  assert.equal(checkFlowchartFields({ title: "x".repeat(TITLE_MAX), code: "x".repeat(CODE_MAX) }).ok, true);
});
test("contact details are refused in the code and the title, so no person's details end up in a diagram", () => {
  assert.match(checkFlowchartFields({ title: "x", code: "flowchart TD\n  A[Email sam@oakwood.co.uk]" }).error, /email address or phone/);
  assert.match(checkFlowchartFields({ title: "x", code: "flowchart TD\n  A[Ring 07700 900123]" }).error, /email address or phone/);
  assert.match(checkFlowchartFields({ title: "Call 07700 900123", code: "" }).error, /title/);
});
test("Mermaid's own @ syntax is not mistaken for an email address", () => {
  assert.equal(checkFlowchartFields({ title: "x", code: 'flowchart TD\n  A@{ shape: rect, label: "Start" }' }).ok, true);
});
test("unfinished or invalid Mermaid still saves: autosave must not lose work in progress", () => {
  assert.equal(checkFlowchartFields({ title: "x", code: "flowchart TD\n  A[[[ --> " }).ok, true);
  assert.equal(checkFlowchartFields({ title: "x", code: "" }).ok, true);
});
test("a partial save checks only what was sent", () => {
  assert.deepEqual(checkFlowchartFields({ title: "New name" }, true), { ok: true, value: { title: "New name" } });
  assert.deepEqual(checkFlowchartFields({ theme: "dark" }, true), { ok: true, value: { theme: "dark" } });
  assert.deepEqual(checkFlowchartFields({}, true), { ok: true, value: {} });
});

// ---------- small helpers ----------
test("ids must be positive whole numbers", () => {
  assert.equal(parseFlowchartId("12"), 12);
  for (const bad of ["0", "-1", "1.5", "abc", "", null, undefined, "1;DROP", "99999999999999999"]) assert.equal(parseFlowchartId(bad), null, String(bad));
});
test("a save's version must look like a database timestamp, keeping its microseconds", () => {
  assert.equal(isVersion(V1), true);
  assert.equal(isVersion("2026-11-05 10:00:00+00:00"), true);
  for (const bad of ["yesterday", "2026-11-05", "'; --", 5, null]) assert.equal(isVersion(bad), false, String(bad));
});
test("Match CRM follows light and dark; a chosen theme stays as chosen", () => {
  assert.equal(resolveEngineTheme("auto", "dark"), "dark");
  assert.equal(resolveEngineTheme("auto", "light"), "default");
  assert.equal(resolveEngineTheme("forest", "dark"), "forest");
  assert.equal(resolveEngineTheme("dark", "light"), "dark");
});
test("the diagram type is read past front matter and comments", () => {
  assert.equal(diagramKind("flowchart LR\nA-->B"), "Flowchart");
  assert.equal(diagramKind("graph TD; A-->B"), "Flowchart");
  assert.equal(diagramKind("---\ntitle: Plan\n---\n%% note\ngantt\n title x"), "Gantt chart");
  assert.equal(diagramKind("sequenceDiagram\n A->>B: hi"), "Sequence diagram");
  assert.equal(diagramKind("nonsense"), "Diagram");
  assert.equal(diagramKind(""), "Diagram");
});
test("a copy's title stays within the limit", () => {
  assert.equal(copyTitle("Journey"), "Journey (copy)");
  assert.ok(copyTitle("x".repeat(TITLE_MAX)).length <= TITLE_MAX);
});
test("search wildcards typed by the owner are treated as plain text", () => {
  assert.equal(likePattern("100%_a\\b"), "%100\\%\\_a\\\\b%");
});
test("file names are safe, and never empty", () => {
  assert.equal(fileSlug("Quote-to-job: Workflow (v2)!"), "quote-to-job-workflow-v2");
  assert.equal(fileSlug("../../etc/passwd"), "etc-passwd");
  assert.equal(fileSlug("€€€"), "flowchart");
});
test("PNG sizes follow the scale, and a huge diagram is reduced to what a browser can draw", () => {
  assert.deepEqual(pngPlan(800, 600, 2), { width: 1600, height: 1200, scale: 2, reduced: false });
  const big = pngPlan(6000, 4000, 4);
  assert.equal(big.reduced, true);
  assert.ok(big.width <= 16000 && big.height <= 16000 && big.width * big.height <= 120_000_001);
  assert.ok(Math.abs(big.width / big.height - 1.5) < 0.01, "keeps its shape");
});

// ---------- pan and zoom ----------
test("fit shows the whole diagram, centred", () => {
  const v = fitView(1000, 500, 600, 400);
  assert.ok(1000 * v.k <= 600 - 48 + 0.001);
  assert.ok(Math.abs(v.x - (600 - 1000 * v.k) / 2) < 0.001);
  assert.ok(Math.abs(v.y - (400 - 500 * v.k) / 2) < 0.001);
});
test("fit does not blow a tiny diagram up, and survives a pane with no size yet", () => {
  assert.equal(fitView(50, 50, 2000, 2000).k, 1.5);
  assert.deepEqual(fitView(100, 100, 0, 0), { x: 0, y: 0, k: 1 });
});
test("zooming keeps the point under the pointer where it is, within limits", () => {
  const v = { x: 10, y: 20, k: 1 };
  const z = zoomAt(v, 2, 100, 100);
  assert.equal(z.k, 2);
  assert.equal((100 - z.x) / z.k, (100 - v.x) / v.k);
  assert.equal((100 - z.y) / z.k, (100 - v.y) / v.k);
  assert.equal(zoomAt({ x: 0, y: 0, k: 7 }, 10, 0, 0).k, ZOOM_MAX);
  assert.equal(zoomAt({ x: 0, y: 0, k: 0.2 }, 0.01, 0, 0).k, ZOOM_MIN);
});

// ---------- save and load API ----------
test("create then load returns what was saved", async () => {
  const { store, row } = await seeded({ theme: "forest" });
  const r = await loadFlowchart(store, String(row.id));
  assert.equal(r.status, 200);
  assert.equal(r.body.flowchart.code, "flowchart TD\n  A --> B");
  assert.equal(r.body.flowchart.theme, "forest");
});
test("create refuses bad input with the reason, and saves nothing", async () => {
  const store = fakeStore();
  assert.equal((await createFlowchart(store, send({ title: "", code: "" }))).status, 400);
  assert.equal((await createFlowchart(store, "{not json")).status, 400);
  assert.equal((await createFlowchart(store, send({ title: "x", code: "Email a@b.co.uk" }))).status, 400);
  assert.equal((await createFlowchart(store, "x".repeat(BODY_MAX + 1))).status, 413);
  assert.equal(store.rows.size, 0);
});
test("loading something that isn't there is a 404, whatever the id looks like", async () => {
  const store = fakeStore();
  for (const id of ["999", "abc", "-1", "0"]) assert.equal((await loadFlowchart(store, id)).status, 404, id);
});
test("a save changes only what was sent", async () => {
  const { store, row } = await seeded();
  const r = await saveFlowchart(store, row.id, send({ title: "Renamed" }));
  assert.equal(r.status, 200);
  assert.equal(r.body.flowchart.title, "Renamed");
  assert.equal(r.body.flowchart.code, "flowchart TD\n  A --> B");
});
test("a save from an out-of-date tab gets a conflict with the newer copy, and overwrites nothing", async () => {
  const { store, row } = await seeded();
  const first = await saveFlowchart(store, row.id, send({ code: "graph LR\n  newer", baseVersion: row.version }));
  assert.equal(first.status, 200);
  const stale = await saveFlowchart(store, row.id, send({ code: "graph LR\n  stale", baseVersion: V1 }));
  assert.equal(stale.status, 409);
  assert.equal(stale.body.flowchart.code, "graph LR\n  newer");
  assert.equal(store.rows.get(row.id).code, "graph LR\n  newer");
});
test("each save moves the version on, so the next one can be based on it", async () => {
  const { store, row } = await seeded();
  const a = await saveFlowchart(store, row.id, send({ code: "a", baseVersion: row.version }));
  const b = await saveFlowchart(store, row.id, send({ code: "b", baseVersion: a.body.flowchart.version }));
  assert.equal(b.status, 200);
  assert.notEqual(a.body.flowchart.version, b.body.flowchart.version);
});
test("a save without a version overwrites: this is Keep mine, and a rename from the list", async () => {
  const { store, row } = await seeded();
  await saveFlowchart(store, row.id, send({ code: "other tab", baseVersion: row.version }));
  assert.equal((await saveFlowchart(store, row.id, send({ code: "mine" }))).status, 200);
  assert.equal(store.rows.get(row.id).code, "mine");
});
test("a save with a malformed version or nothing in it is refused before it reaches the database", async () => {
  const { store, row } = await seeded();
  assert.equal((await saveFlowchart(store, row.id, send({ code: "x", baseVersion: "'; DROP" }))).status, 400);
  assert.equal((await saveFlowchart(store, row.id, send({}))).status, 400);
  assert.equal((await saveFlowchart(store, row.id, send({ baseVersion: V2 }))).status, 400);
  assert.equal(store.rows.get(row.id).code, "flowchart TD\n  A --> B");
});
test("a save refuses contact details and leaves the saved copy alone", async () => {
  const { store, row } = await seeded();
  const r = await saveFlowchart(store, row.id, send({ code: "flowchart TD\n  A[07700 900123]" }));
  assert.equal(r.status, 400);
  assert.match(r.body.error, /phone number/);
  assert.equal(store.rows.get(row.id).code, "flowchart TD\n  A --> B");
});
test("saving or deleting something that isn't there is a 404", async () => {
  const store = fakeStore();
  assert.equal((await saveFlowchart(store, "5", send({ title: "x" }))).status, 404);
  assert.equal((await saveFlowchart(store, "abc", send({ title: "x" }))).status, 404);
  assert.equal((await deleteFlowchart(store, "5")).status, 404);
  assert.equal((await duplicateFlowchart(store, "5")).status, 404);
});
test("duplicate makes a separate copy; delete removes only the one asked for", async () => {
  const { store, row } = await seeded({ theme: "neutral" });
  const copy = (await duplicateFlowchart(store, row.id)).body.flowchart;
  assert.notEqual(copy.id, row.id);
  assert.equal(copy.title, "Journey (copy)");
  assert.equal(copy.theme, "neutral");
  await saveFlowchart(store, copy.id, send({ code: "changed" }));
  assert.equal(store.rows.get(row.id).code, "flowchart TD\n  A --> B");
  assert.equal((await deleteFlowchart(store, row.id)).status, 200);
  assert.equal(store.rows.has(row.id), false);
  assert.equal(store.rows.has(copy.id), true);
});
test("the list leaves out the code, says the type and passes the search on", async () => {
  const { store } = await seeded();
  await createFlowchart(store, send({ title: "Plan", code: "gantt\n title x" }));
  const all = (await listFlowcharts(store, null)).body.flowcharts;
  assert.equal(all.length, 2);
  assert.equal(all[0].code, undefined);
  assert.equal(all[1].kind, "Gantt chart");
  assert.deepEqual((await listFlowcharts(store, " Plan ")).body.flowcharts.map((r) => r.title), ["Plan"]);
});
test("another site's page cannot write; the CRM's own pages and non-browser calls can", () => {
  assert.equal(sameOrigin("https://crm.clrsweb.uk", ["crm.clrsweb.uk", "127.0.0.1:3000"]), true);
  assert.equal(sameOrigin("http://127.0.0.1:3000", [null, "127.0.0.1:3000"]), true);
  assert.equal(sameOrigin(null, ["127.0.0.1:3000"]), true);
  assert.equal(sameOrigin("https://clrsweb.uk", ["crm.clrsweb.uk"]), false);
  assert.equal(sameOrigin("https://evil.example", ["127.0.0.1:3000"]), false);
  assert.equal(sameOrigin("not a url", ["127.0.0.1:3000"]), false);
});

// ---------- templates ----------
const templates = parseTemplates(readFileSync(new URL("../../config/flowchart-templates.yaml", import.meta.url), "utf8"));
test("every starter asked for is there, with a unique key", () => {
  const keys = templates.map((t) => t.key);
  assert.equal(new Set(keys).size, keys.length);
  for (const k of ["client-journey", "lead-follow-up", "treatment-pathway", "booking-cancellation", "quote-to-job", "upwork-application", "blank-flowchart", "blank-sequence", "blank-gantt"]) assert.ok(keys.includes(k), k);
});
test("every starter passes the same check as saving, and is a known type of diagram", () => {
  for (const t of templates) {
    assert.equal(checkFlowchartFields({ title: t.title, code: t.code }).ok, true, t.key);
    assert.notEqual(diagramKind(t.code), "Diagram", t.key);
  }
});
test("a template file with a missing field fails loudly rather than showing a broken card", () => {
  assert.throws(() => parseTemplates("templates:\n  - key: a\n    title: b\n"), /missing/);
  assert.throws(() => parseTemplates("nothing: here\n"), /templates list/);
});
