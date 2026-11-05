// Drives the flowchart builder in a real browser: what a unit test can't see (Mermaid drawing, exports, autosave, pan and zoom).
// It creates flowcharts titled [TEST] and deletes them afterwards. Point it at a scratch database, or a local CRM you don't mind writing to briefly.
//   FLOWCHART_E2E_URL=http://127.0.0.1:3001 APP_PASSWORD=... node crm/tests/e2e/flowcharts.e2e.mjs
// Not part of `npm test`, which has no browser. Optional: FLOWCHART_E2E_SHOTS=<folder> saves screenshots to look at.
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium } from "playwright";

const BASE = process.env.FLOWCHART_E2E_URL, PASSWORD = process.env.APP_PASSWORD, SHOTS = process.env.FLOWCHART_E2E_SHOTS;
if (!BASE || !PASSWORD) { console.error("Set FLOWCHART_E2E_URL and APP_PASSWORD."); process.exit(2); }
const ONLY = process.env.FLOWCHART_E2E_ONLY?.split(",");

const browser = await chromium.launch({ args: ["--disable-dev-shm-usage"] });
const downloads = mkdtempSync(path.join(tmpdir(), "flowchart-e2e-"));
let passed = 0, failed = 0;
const created = new Set();
const consoleErrors = [];

async function newContext(options = {}) {
  const context = await browser.newContext({ baseURL: BASE, viewport: { width: 1440, height: 900 }, acceptDownloads: true, permissions: ["clipboard-read", "clipboard-write"], ...options });
  await context.route("**/api/calendar/sync", (r) => r.abort());   // the check must not sync anything
  return context;
}
async function signIn(context) {
  const page = await context.newPage();
  page.on("console", (m) => { if (m.type() === "error" && !/calendar\/sync|ERR_FAILED/.test(m.text() + m.location().url) && !/409|400 \(Bad/.test(m.text())) consoleErrors.push(m.text()); });
  page.on("pageerror", (e) => consoleErrors.push(String(e)));
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await page.fill('input[type="password"]', PASSWORD);
  await page.keyboard.press("Enter");
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30_000 });
  return page;
}
const api = (page, url, method = "GET", body) => page.evaluate(async ({ url, method, body }) => {
  const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}, { url, method, body });
async function make(page, code, title = "[TEST] Flow", theme = "auto") {
  const r = await api(page, "/api/flowcharts", "POST", { title, code, theme });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  created.add(r.body.flowchart.id);
  return r.body.flowchart.id;
}
const open = async (page, id) => {
  await page.goto(`/flowcharts/${id}`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".fc-stage svg, .fc-error", { timeout: 60_000 });
};
const stageText = (page) => page.locator(".fc-stage").innerText();
const status = (page) => page.locator(".fc-status");
const setCode = async (page, code) => {
  await page.locator(".cm-content").click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.press("Delete");
  await page.evaluate((c) => navigator.clipboard.writeText(c), code);
  await page.keyboard.press("ControlOrMeta+v");
};
const saved = (page) => status(page).filter({ hasText: /^Saved$/ }).waitFor({ timeout: 15_000 });
const transform = (page) => page.locator(".fc-stage").evaluate((e) => e.style.transform);
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `${name}.png`) }); };

async function check(name, fn) {
  if (ONLY && !ONLY.some((o) => name.startsWith(o))) return;
  try { await fn(); passed++; console.log(`ok   ${name}`); }
  catch (e) { failed++; console.log(`FAIL ${name}\n     ${String(e.message ?? e).split("\n").slice(0, 6).join("\n     ")}`); }
}

const anon = await newContext();
const context = await newContext();
const page = await signIn(context);
const SIMPLE = "flowchart TD\n  A[First box] --> B[Second box]";

try {
  await check("auth: every route refuses a visitor who is not signed in", async () => {
    const r = anon.request;
    assert.equal((await r.get("/api/flowcharts")).status(), 401);
    assert.equal((await r.post("/api/flowcharts", { data: { title: "x", code: "" } })).status(), 401);
    assert.equal((await r.get("/api/flowcharts/1")).status(), 401);
    assert.equal((await r.patch("/api/flowcharts/1", { data: { title: "x" } })).status(), 401);
    assert.equal((await r.delete("/api/flowcharts/1")).status(), 401);
    assert.equal((await r.post("/api/flowcharts/1/duplicate")).status(), 401);
    const pageVisit = await r.get("/flowcharts", { maxRedirects: 0 });
    assert.ok([302, 307].includes(pageVisit.status()), `page visit gave ${pageVisit.status()}`);
  });

  await check("api: a signed-in write from another site's page is refused", async () => {
    const r = await context.request.post("/api/flowcharts", { data: { title: "[TEST] cross-site", code: "" }, headers: { Origin: "https://evil.example" } });
    assert.equal(r.status(), 403);
  });

  await check("api: save and load against the real database, keeping microsecond versions", async () => {
    const id = await make(page, SIMPLE);
    const loaded = await api(page, `/api/flowcharts/${id}`);
    assert.equal(loaded.status, 200);
    assert.equal(loaded.body.flowchart.code, SIMPLE);
    const a = await api(page, `/api/flowcharts/${id}`, "PATCH", { code: "graph LR\n  a --> b", baseVersion: loaded.body.flowchart.version });
    assert.equal(a.status, 200);
    const stale = await api(page, `/api/flowcharts/${id}`, "PATCH", { code: "graph LR\n  stale", baseVersion: loaded.body.flowchart.version });
    assert.equal(stale.status, 409);
    assert.equal((await api(page, `/api/flowcharts/${id}`)).body.flowchart.code, "graph LR\n  a --> b");
    assert.equal((await api(page, `/api/flowcharts/${id}`, "PATCH", { code: "x".repeat(50_001) })).status, 400);
    assert.equal((await api(page, `/api/flowcharts/${id}`, "PATCH", { code: "email sam@oakwood.co.uk" })).status, 400);
    assert.equal((await api(page, `/api/flowcharts/${id}`, "PATCH", { theme: "neon" })).status, 400);
    assert.equal((await api(page, "/api/flowcharts/999999999")).status, 404);
  });

  await check("lazy: Mermaid and the editor load on the editor page only", async () => {
    const sizes = async (url) => {
      const p = await context.newPage();
      const seen = new Map();
      p.on("response", async (r) => { if (r.url().endsWith(".js")) seen.set(r.url(), (await r.body().catch(() => Buffer.alloc(0))).length); });
      await p.goto(url, { waitUntil: "domcontentloaded" });
      await p.waitForLoadState("load");
      if (url.startsWith("/flowcharts/") && !url.endsWith("new")) await p.waitForSelector(".fc-stage svg", { timeout: 60_000 });
      await p.waitForTimeout(800);
      await p.close();
      return { total: [...seen.values()].reduce((a, b) => a + b, 0) };
    };
    const id = await make(page, SIMPLE);
    const tasks = await sizes("/tasks"), list = await sizes("/flowcharts"), editor = await sizes(`/flowcharts/${id}`);
    console.log(`     JS loaded: tasks ${Math.round(tasks.total / 1024)} KB, list ${Math.round(list.total / 1024)} KB, editor ${Math.round(editor.total / 1024)} KB`);
    assert.ok(list.total < tasks.total + 80_000, "the list page should not carry the editor");
    assert.ok(editor.total > list.total + 300_000, "the editor page should load the heavy code");
  });

  await check("nav: Flowcharts is in the menu and opens the list", async () => {
    await page.goto("/tasks", { waitUntil: "domcontentloaded" });
    await page.locator(".sidebar").getByRole("link", { name: "Flowcharts" }).click();
    await page.waitForURL("**/flowcharts");
    await page.getByRole("heading", { name: "Flowcharts" }).waitFor();
    await page.waitForTimeout(800);
    await shot(page, "list-light");
  });

  const TEMPLATE_TITLES = ["Patient or client journey", "Treatment pathway with decision points", "Booking and cancellation process", "Quote-to-job workflow", "New lead follow-up process", "Upwork application process", "Flowchart", "Sequence diagram", "Gantt chart"];
  await check("templates: each one creates a flowchart that draws without an error", async () => {
    await page.goto("/flowcharts/new", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(800);   // let the page's entrance finish before any picture
    await shot(page, "templates-light");
    assert.equal(await page.locator(".fc-template").count(), TEMPLATE_TITLES.length);
    for (const title of TEMPLATE_TITLES) {
      await page.goto("/flowcharts/new", { waitUntil: "domcontentloaded" });
      await page.locator(".fc-template").filter({ has: page.locator("strong", { hasText: new RegExp(`^${title}$`) }) }).click();
      await page.waitForURL(/\/flowcharts\/\d+$/, { timeout: 30_000 });
      created.add(Number(page.url().split("/").pop()));
      await page.waitForSelector(".fc-stage svg", { timeout: 60_000 });
      assert.equal(await page.locator(".fc-error").count(), 0, `${title} shows an error`);
      assert.equal(await page.locator(".fc-title").inputValue(), title);
    }
  });

  await check("render: live redraw; an error keeps the last valid diagram; fixing it clears the error", async () => {
    const id = await make(page, SIMPLE);
    await open(page, id);
    assert.match(await stageText(page), /First box/);
    await shot(page, "editor-light");
    await setCode(page, "flowchart TD\n  A[Changed label] --> B[Second box]");
    await page.locator(".fc-stage", { hasText: "Changed label" }).waitFor({ timeout: 5_000 });

    await setCode(page, "flowchart TD\n  A[Changed label --> ((( oops");
    await page.locator(".fc-error").waitFor({ timeout: 5_000 });
    assert.match(await page.locator(".fc-error").innerText(), /\S/);
    assert.match(await stageText(page), /Changed label/, "the last valid diagram stays");
    await page.locator(".fc-stale").waitFor();
    assert.equal(await page.locator('[id^="dfc-draw"], [id^="fc-draw"]:not(.fc-stage *)').count(), 0, "no scratch elements left behind");
    await shot(page, "editor-error");

    await setCode(page, "");
    await page.waitForTimeout(600);
    assert.match(await stageText(page), /Changed label/, "clearing the code does not blank the picture");

    await setCode(page, SIMPLE);
    await page.locator(".fc-error").waitFor({ state: "detached", timeout: 5_000 });
    assert.equal(await page.locator(".fc-stale").count(), 0);
  });

  await check("render: redraws wait about 300ms after typing stops", async () => {
    const id = await make(page, SIMPLE);
    await open(page, id);
    await page.evaluate(() => {
      window.__draws = 0;
      new MutationObserver((m) => { if (m.some((x) => x.addedNodes.length)) window.__draws++; }).observe(document.querySelector(".fc-stage"), { childList: true });
    });
    await page.locator(".cm-content").click();
    await page.keyboard.press("ControlOrMeta+End");
    await page.keyboard.type("\n  B --> C[Typed quickly now]", { delay: 25 });
    await page.locator(".fc-stage", { hasText: "Typed quickly now" }).waitFor({ timeout: 5_000 });
    await page.waitForTimeout(500);
    const draws = await page.evaluate(() => window.__draws);
    assert.ok(draws <= 3, `drew ${draws} times for ${"B --> C[Typed quickly now]".length} keystrokes`);
  });

  await check("keys: typing / in the editor types it, and does not open the search palette", async () => {
    const id = await make(page, SIMPLE);
    await open(page, id);
    await page.locator(".cm-content").click();
    await page.keyboard.press("ControlOrMeta+End");
    await page.keyboard.type("\n  %% a/b");
    assert.match(await page.locator(".cm-content").innerText(), /a\/b/);
    assert.equal(await page.getByRole("dialog").count(), 0);
  });

  await check("autosave: unsaved, then saved within a few seconds, and still there after a reload", async () => {
    const id = await make(page, SIMPLE);
    await open(page, id);
    await page.locator(".cm-content").click();
    await page.keyboard.press("ControlOrMeta+End");
    await page.keyboard.type("\n  B --> C[Autosaved box]");
    await status(page).filter({ hasText: "Unsaved changes" }).waitFor({ timeout: 3_000 });
    await saved(page);
    await page.locator(".fc-title").fill("[TEST] Renamed in editor");
    await saved(page);
    await page.locator(".fc-theme select").selectOption("forest");
    await saved(page);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector(".fc-stage svg", { timeout: 60_000 });
    assert.match(await page.locator(".cm-content").innerText(), /Autosaved box/);
    assert.equal(await page.locator(".fc-title").inputValue(), "[TEST] Renamed in editor");
    assert.equal(await page.locator(".fc-theme select").inputValue(), "forest");
  });

  await check("autosave: Cmd/Ctrl+S saves straight away", async () => {
    const id = await make(page, SIMPLE);
    await open(page, id);
    await page.locator(".cm-content").click();
    await page.keyboard.press("ControlOrMeta+End");
    await page.keyboard.type("\n  %% quick");
    await page.keyboard.press("ControlOrMeta+s");
    await saved(page);
    assert.match((await api(page, `/api/flowcharts/${id}`)).body.flowchart.code, /quick/);
  });

  await check("autosave: invalid code still saves; contact details and a blank title are refused with the reason", async () => {
    const id = await make(page, SIMPLE);
    await open(page, id);
    await setCode(page, "flowchart TD\n  A[[[ broken");
    await saved(page);
    assert.match((await api(page, `/api/flowcharts/${id}`)).body.flowchart.code, /broken/);

    await setCode(page, "flowchart TD\n  A[Ring 07700 900123] --> B");
    await page.getByRole("alert").filter({ hasText: /phone number/ }).waitFor({ timeout: 10_000 });
    await shot(page, "editor-refused");
    assert.doesNotMatch((await api(page, `/api/flowcharts/${id}`)).body.flowchart.code, /07700/);

    await setCode(page, SIMPLE);
    await saved(page);
    await page.locator(".fc-title").fill("");
    await page.getByRole("alert").filter({ hasText: /Give it a title/ }).waitFor({ timeout: 10_000 });
    await page.locator(".fc-title").fill("[TEST] Back again");
    await saved(page);
  });

  await check("conflict: another tab's change is not overwritten until the owner chooses", async () => {
    const id = await make(page, SIMPLE);
    await open(page, id);
    await api(page, `/api/flowcharts/${id}`, "PATCH", { code: "flowchart TD\n  Z[Other tab]" });
    await page.locator(".cm-content").click();
    await page.keyboard.press("ControlOrMeta+End");
    await page.keyboard.type("\n  %% mine");
    await page.getByRole("button", { name: "Keep mine" }).waitFor({ timeout: 10_000 });
    assert.match((await api(page, `/api/flowcharts/${id}`)).body.flowchart.code, /Other tab/);
    await page.getByRole("button", { name: "Use the other version" }).click();
    await page.locator(".cm-content", { hasText: "Other tab" }).waitFor();
    await saved(page);

    await api(page, `/api/flowcharts/${id}`, "PATCH", { code: "flowchart TD\n  Z[Second change]" });
    await page.locator(".cm-content").click();
    await page.keyboard.press("ControlOrMeta+End");
    await page.keyboard.type("\n  %% keepers");
    await page.getByRole("button", { name: "Keep mine" }).click();
    await saved(page);
    const code = (await api(page, `/api/flowcharts/${id}`)).body.flowchart.code;
    assert.match(code, /keepers/);
    assert.doesNotMatch(code, /Second change/);
  });

  await check("leaving: unsaved changes warn on a link; staying keeps them; leaving goes", async () => {
    const id = await make(page, SIMPLE);
    await open(page, id);
    await page.locator(".cm-content").click();
    await page.keyboard.press("ControlOrMeta+End");
    await page.keyboard.type("\n  %% wait");
    let message = "";
    page.once("dialog", (d) => { message = d.message(); return d.dismiss(); });
    await page.locator(".sidebar").getByRole("link", { name: "Tasks" }).click();
    assert.match(message, /not saved/);
    assert.match(page.url(), new RegExp(`/flowcharts/${id}$`));

    await page.keyboard.type("x");
    page.once("dialog", (d) => d.accept());
    await page.locator(".fc-back").click();
    await page.waitForURL("**/flowcharts", { timeout: 15_000 });
  });

  await check("leaving: once saved, a link goes without a warning", async () => {
    const id = await make(page, SIMPLE);
    await open(page, id);
    let asked = false;
    const onDialog = (d) => { asked = true; return d.accept(); };
    page.on("dialog", onDialog);
    await page.locator(".fc-back").click();
    await page.waitForURL("**/flowcharts", { timeout: 15_000 });
    page.off("dialog", onDialog);
    assert.equal(asked, false);
  });

  await check("preview: zoom in and out, fit, drag to pan, wheel, keyboard", async () => {
    const id = await make(page, SIMPLE);
    await open(page, id);
    const zoom = () => page.locator(".fc-zoom").innerText();
    await page.waitForTimeout(300);
    const start = await zoom();
    await page.getByRole("button", { name: "Zoom in" }).click();
    assert.notEqual(await zoom(), start);
    const zoomed = await zoom();
    await page.getByRole("button", { name: "Zoom out" }).click();
    await page.getByRole("button", { name: "Zoom out" }).click();
    assert.ok(parseInt(await zoom()) < parseInt(zoomed));
    const before = await transform(page);
    const box = await page.locator(".fc-canvas").boundingBox();
    await page.mouse.move(box.x + 60, box.y + 60);
    await page.mouse.down();
    await page.mouse.move(box.x + 180, box.y + 140, { steps: 4 });
    await page.mouse.up();
    assert.notEqual(await transform(page), before, "dragging pans");
    const afterPan = await transform(page);
    await page.mouse.move(box.x + 200, box.y + 200);
    await page.mouse.wheel(0, -300);
    await page.waitForTimeout(100);
    assert.notEqual(await transform(page), afterPan, "the wheel zooms");
    await page.getByRole("button", { name: "Fit to screen" }).click();
    assert.equal(await zoom(), start, "fit goes back to the fitted size");
    const svg = await page.locator(".fc-stage svg").boundingBox();
    assert.ok(svg.x >= box.x && svg.y >= box.y && svg.x + svg.width <= box.x + box.width && svg.y + svg.height <= box.y + box.height, "fit shows all of it");
    await page.locator(".fc-canvas").focus();
    const k = await transform(page);
    await page.keyboard.press("ArrowRight");
    assert.notEqual(await transform(page), k, "arrow keys pan");
    await page.keyboard.press("0");
    assert.equal(await zoom(), start);
  });

  await check("panes: the divider drags and moves with the keyboard", async () => {
    const id = await make(page, SIMPLE);
    await open(page, id);
    const width = async () => (await page.locator(".fc-pane-left").boundingBox()).width;
    const start = await width();
    const d = await page.locator(".fc-divider").boundingBox();
    await page.mouse.move(d.x + d.width / 2, d.y + d.height / 2);
    await page.mouse.down();
    await page.mouse.move(d.x + 220, d.y + d.height / 2, { steps: 5 });
    await page.mouse.up();
    assert.ok((await width()) > start + 150, "dragging right widens the code pane");
    const after = await width();
    await page.locator(".fc-divider").focus();
    await page.keyboard.press("ArrowLeft");
    assert.ok((await width()) < after);
    await page.evaluate(() => localStorage.removeItem("flowchart-split"));
  });

  await check("themes: each picks its own look; Match CRM follows the CRM's light and dark", async () => {
    const id = await make(page, SIMPLE);
    await open(page, id);
    const fill = () => page.locator(".fc-stage svg .node rect, .fc-stage svg .node polygon").first().evaluate((e) => getComputedStyle(e).fill);
    const looks = new Map();
    for (const t of ["default", "neutral", "forest", "dark"]) {
      await page.locator(".fc-theme select").selectOption(t);
      await page.waitForTimeout(700);
      looks.set(t, await fill());
      assert.equal(await page.locator(".fc-canvas").getAttribute("data-theme"), t === "dark" ? "dark" : "light", t);
    }
    assert.equal(new Set(looks.values()).size, 4, `each theme looks different: ${[...looks.values()]}`);
    await page.locator(".fc-theme select").selectOption("auto");
    await page.waitForTimeout(700);
    assert.equal(await page.locator(".fc-canvas").getAttribute("data-theme"), "light");
    await page.locator(".sidebar").getByRole("button", { name: "Dark theme" }).click();
    await page.waitForTimeout(700);
    assert.equal(await page.locator(".fc-canvas").getAttribute("data-theme"), "dark");
    assert.equal(await fill(), looks.get("dark"), "Match CRM uses the dark theme in dark mode");
    await saved(page);
    await shot(page, "editor-dark");
    await page.goto("/flowcharts", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(800);
    await shot(page, "list-dark");
    await page.goto("/flowcharts/new", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(800);
    await shot(page, "templates-dark");
    await page.goto(`/flowcharts/${id}`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".fc-stage svg", { timeout: 60_000 });
    await page.locator(".fc-theme select").selectOption("forest");
    await page.waitForTimeout(700);
    assert.equal(await page.locator(".fc-canvas").getAttribute("data-theme"), "light", "a light diagram keeps a light background in a dark CRM");
    await shot(page, "editor-dark-crm-forest");
    await page.locator(".sidebar").getByRole("button", { name: "Light theme" }).click();
  });

  const pngSize = (file) => { const b = readFileSync(file); assert.equal(b.subarray(1, 4).toString(), "PNG"); return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) }; };
  const exportAs = async (label) => {
    await page.locator(".fc-menu summary").click();
    const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 20_000 }), page.getByRole("menuitem", { name: label }).click()]);
    const to = path.join(downloads, `${Date.now()}-${dl.suggestedFilename()}`);
    await dl.saveAs(to);
    return { file: to, name: dl.suggestedFilename() };
  };
  const painted = (file) => page.evaluate(async (b64) => {
    const img = new Image();
    await new Promise((ok, no) => { img.onload = ok; img.onerror = no; img.src = `data:image/png;base64,${b64}`; });
    const c = document.createElement("canvas"); c.width = Math.min(img.width, 800); c.height = Math.min(img.height, 800);
    const x = c.getContext("2d"); x.drawImage(img, 0, 0, c.width, c.height);
    const d = x.getImageData(0, 0, c.width, c.height).data; const colours = new Set();
    for (let i = 0; i < d.length; i += 40) colours.add(`${d[i]},${d[i + 1]},${d[i + 2]}`);
    return colours.size;
  }, readFileSync(file).toString("base64"));

  for (const [kind, code] of [
    ["flowchart", 'flowchart TD\n  A["Start here"] --> B{Decision?}\n  B -- Yes --> C((Done))'],
    ["sequence", "sequenceDiagram\n  Client->>Business: Sends a request\n  Business-->>Client: Replies"],
    ["gantt", "gantt\n  title Plan\n  dateFormat YYYY-MM-DD\n  section One\n  Task :a1, 2027-01-04, 5d"],
  ]) {
    await check(`export: ${kind} as SVG and PNG at 1x, 2x and 4x`, async () => {
      const id = await make(page, code, `[TEST] Export ${kind}`);
      await open(page, id);
      const svg = await exportAs("Download SVG");
      assert.equal(svg.name, `test-export-${kind}.svg`);
      const text = readFileSync(svg.file, "utf8");
      assert.equal(await page.evaluate((t) => new DOMParser().parseFromString(t, "image/svg+xml").querySelector("parsererror")?.textContent ?? null, text), null, "the SVG is valid XML");
      assert.doesNotMatch(text, /<script/i);
      assert.doesNotMatch(text, /foreignObject/i, "labels are plain SVG text, so design tools can open it");

      const one = pngSize((await exportAs("Download PNG 1x")).file);
      const two = await exportAs("Download PNG 2x");
      const four = pngSize((await exportAs("Download PNG 4x")).file);
      assert.equal(two.name, `test-export-${kind}-2x.png`);
      const twoSize = pngSize(two.file);
      assert.ok(Math.abs(twoSize.w - one.w * 2) <= 2 && Math.abs(four.w - one.w * 4) <= 4, `${one.w} ${twoSize.w} ${four.w}`);
      assert.ok(await painted(two.file) > 2, "the PNG has a picture in it, not a blank");
      if (SHOTS) { const { copyFileSync } = await import("node:fs"); copyFileSync(two.file, path.join(SHOTS, `export-${kind}.png`)); }
    });
  }

  await check("export: a dark diagram's PNG has a dark background, so its light text can be read", async () => {
    const id = await make(page, SIMPLE, "[TEST] Export dark", "dark");
    await open(page, id);
    const { file } = await exportAs("Download PNG 1x");
    const corner = await page.evaluate(async (b64) => {
      const img = new Image();
      await new Promise((ok) => { img.onload = ok; img.src = `data:image/png;base64,${b64}`; });
      const c = document.createElement("canvas"); c.width = img.width; c.height = img.height;
      const x = c.getContext("2d"); x.drawImage(img, 0, 0);
      return [...x.getImageData(0, 0, 1, 1).data];
    }, readFileSync(file).toString("base64"));
    assert.ok(corner[0] < 80 && corner[1] < 80 && corner[2] < 80, `corner was ${corner}`);
  });

  await check("export: while the code is invalid, exports use the last valid diagram", async () => {
    const id = await make(page, SIMPLE, "[TEST] Export stale");
    await open(page, id);
    await setCode(page, "flowchart TD\n  A[[[ broken");
    await page.locator(".fc-error").waitFor({ timeout: 5_000 });
    const text = readFileSync((await exportAs("Download SVG")).file, "utf8");
    assert.match(text, /First/);       // exported labels hold each word in its own element
    assert.doesNotMatch(text, /broken/);
  });

  await check("export: copying gives the Mermaid code, even mid-edit", async () => {
    const id = await make(page, SIMPLE);
    await open(page, id);
    await page.locator(".fc-menu summary").click();
    await page.getByRole("menuitem", { name: "Copy Mermaid code" }).click();
    await page.waitForTimeout(200);
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), SIMPLE);
  });

  await check("security: diagrams can't run scripts or inject HTML, even asking for loose mode", async () => {
    const nasty = [
      '%%{init: {"securityLevel": "loose", "startOnLoad": true}}%%',
      "flowchart TD",
      '  A["<img src=x onerror=window.__xss=1>"] --> B["<script>window.__xss=2</script>"]',
      '  B --> C["<iframe src=javascript:window.__xss=3></iframe>"]',
      '  click A call window.__hit("a") "tip"',
      '  click B href "javascript:window.__xss=4"',
      '  click C callback',
    ].join("\n");
    const id = await make(page, nasty, "[TEST] Nasty");
    await page.addInitScript(() => { window.__hit = () => { window.__xss = 5; }; window.callback = () => { window.__xss = 6; }; });
    await open(page, id);
    await page.waitForTimeout(800);
    const stage = page.locator(".fc-stage");
    if (await stage.locator(".node").count()) {
      for (const n of await stage.locator(".node").all()) await n.click({ force: true }).catch(() => {});
    }
    await page.waitForTimeout(300);
    assert.equal(await page.evaluate(() => window.__xss), undefined, "a script ran");
    assert.equal(await stage.locator("script, iframe, [onerror], [onclick], a[href^='javascript']").count(), 0, "active content reached the page");
    assert.match(page.url(), /\/flowcharts\/\d+$/);
  });

  await check("list: search, rename, duplicate and delete with confirmation", async () => {
    const stamp = Date.now();
    const title = `[TEST] Listed ${stamp}`;
    const id = await make(page, "flowchart TD\n  A[Findable needle] --> B", title);
    await make(page, SIMPLE, `[TEST] Other ${stamp}`);
    await page.goto(`/flowcharts?q=${encodeURIComponent(`Listed ${stamp}`)}`, { waitUntil: "domcontentloaded" });
    const rows = page.locator(".fc-list tbody tr");
    assert.equal(await rows.count(), 1);
    await page.goto("/flowcharts?q=Findable%20needle", { waitUntil: "domcontentloaded" });
    assert.ok((await page.locator(".fc-list tbody tr").filter({ hasText: title }).count()) === 1, "search reads the diagram text too");
    await page.goto("/flowcharts?q=100%25_nothing_matches", { waitUntil: "domcontentloaded" });
    await page.getByText("Nothing matches that search").waitFor();

    await page.goto(`/flowcharts?q=${encodeURIComponent(String(stamp))}`, { waitUntil: "domcontentloaded" });
    const row = rows.filter({ hasText: "Listed" });
    await row.getByRole("button", { name: /^Rename/ }).click();
    await page.locator(".fc-list input").fill(`[TEST] Renamed ${stamp}`);   // the title is now this box, so the row no longer has "Listed" in its text
    await page.keyboard.press("Enter");
    await rows.filter({ hasText: "Renamed" }).first().waitFor({ timeout: 10_000 });
    assert.equal((await api(page, `/api/flowcharts/${id}`)).body.flowchart.title, `[TEST] Renamed ${stamp}`);

    await rows.filter({ hasText: "Renamed" }).getByRole("button", { name: /^Duplicate/ }).click();
    const copy = rows.filter({ hasText: "(copy)" });
    await copy.waitFor({ timeout: 10_000 });
    created.add(Number((await copy.getByRole("link").getAttribute("href")).split("/").pop()));

    page.once("dialog", (d) => d.dismiss());
    await rows.filter({ hasText: "(copy)" }).getByRole("button", { name: /^Delete/ }).click();
    await page.waitForTimeout(400);
    assert.equal(await rows.filter({ hasText: "(copy)" }).count(), 1, "cancelling keeps it");

    let confirmText = "";
    page.once("dialog", (d) => { confirmText = d.message(); return d.accept(); });
    await rows.filter({ hasText: "(copy)" }).getByRole("button", { name: /^Delete/ }).click();
    await rows.filter({ hasText: "(copy)" }).waitFor({ state: "detached", timeout: 10_000 });
    assert.match(confirmText, /cannot be undone/);

    await rows.filter({ hasText: "Renamed" }).getByRole("link").click();
    await page.waitForURL(new RegExp(`/flowcharts/${id}$`));
    await page.waitForSelector(".fc-stage svg", { timeout: 60_000 });
  });

  await check("pages: a flowchart that doesn't exist shows Not found, not a crash", async () => {
    for (const bad of ["999999999", "abc"]) {
      const r = await page.goto(`/flowcharts/${bad}`, { waitUntil: "domcontentloaded" });
      assert.equal(r.status(), 404, bad);
    }
  });

  await check("mobile: the panes stack and nothing overflows sideways", async () => {
    const small = await newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
    const p = await signIn(small);
    const id = await make(p, SIMPLE, "[TEST] Mobile");
    await open(p, id);
    const left = await p.locator(".fc-pane-left").boundingBox();
    const right = await p.locator(".fc-pane-right").boundingBox();
    assert.ok(right.y >= left.y + left.height, "the diagram is under the code");
    assert.ok(Math.abs(left.width - right.width) < 2, "same width");
    assert.equal(await p.locator(".fc-divider").isVisible(), false);
    assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), "no sideways scrolling");
    await p.waitForSelector(".fc-stage svg");
    if (SHOTS) await p.screenshot({ path: path.join(SHOTS, "editor-mobile.png"), fullPage: true });
    await small.close();
  });

  await check("console: no errors on any page visited", async () => {
    assert.deepEqual(consoleErrors.filter((e) => !/404|Failed to load resource/.test(e)), []);
  });
} finally {
  // Tidy up everything this run made, whatever happened.
  await page.goto("/flowcharts", { waitUntil: "domcontentloaded" }).catch(() => {});
  for (const id of created) await api(page, `/api/flowcharts/${id}`, "DELETE").catch(() => {});
  const left = await api(page, "/api/flowcharts?q=%5BTEST%5D").catch(() => ({ body: { flowcharts: [] } }));
  for (const r of left.body.flowcharts ?? []) await api(page, `/api/flowcharts/${r.id}`, "DELETE").catch(() => {});
  await browser.close();
}
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
