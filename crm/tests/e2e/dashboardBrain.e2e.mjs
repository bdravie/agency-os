// Drives the dashboard brain and the assistant in real browsers, with JavaScript on and off, on a desktop and a phone:
// no console errors or warnings on load or during a full scroll-through, every lobe previews on hover, focus and tap,
// the core opens the assistant (a panel with JavaScript, the /assistant page without), and "reduce motion" still works.
//   BRAIN_E2E_URL=http://127.0.0.1:3001 APP_PASSWORD=... node crm/tests/e2e/dashboardBrain.e2e.mjs
// Optional: BRAIN_E2E_ONLY=desktop-js,phone-webkit-js runs only those scenarios; BRAIN_E2E_SHOTS=<folder> saves screenshots; BRAIN_E2E_ASK=1 also asks one real question with JavaScript off
// (one AI call, saved to the assistant's history). Not part of `npm test`, which has no browser.
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { chromium, webkit } from "playwright";

const BASE = process.env.BRAIN_E2E_URL, PASSWORD = process.env.APP_PASSWORD, SHOTS = process.env.BRAIN_E2E_SHOTS, ASK = process.env.BRAIN_E2E_ASK === "1";
if (!BASE || !PASSWORD) { console.error("Set BRAIN_E2E_URL and APP_PASSWORD."); process.exit(2); }
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

const LOBES = ["find", "sell", "deliver", "grow"];
const DESKTOP = { viewport: { width: 1440, height: 900 } };
const PHONE = { viewport: { width: 440, height: 956 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1" };

let failed = 0;
const results = [];

async function signedInState() {
  const browser = await chromium.launch({ args: ["--disable-dev-shm-usage"] });
  const context = await browser.newContext({ baseURL: BASE });
  const page = await context.newPage();
  await page.goto("/login");
  await page.fill('input[type="password"]', PASSWORD);
  await page.keyboard.press("Enter");
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 60_000 });
  const state = await context.storageState();
  await browser.close();
  return state;
}

/** Collects every console error and warning, uncaught error and failed request on a page. */
function watch(page, label, jsOff = false) {
  const problems = [];
  // With JavaScript off, Playwright's Chromium blocks scripts by content security policy, so their requests "fail" by design.
  const blockedByTest = (r) => jsOff && /csp/i.test(r.failure()?.errorText ?? "");
  page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") problems.push(`console ${m.type()}: ${m.text()} @ ${m.location().url}`); });
  page.on("pageerror", (e) => problems.push(`page error: ${e.message}`));
  // A link prefetch (?_rsc=) cancelled because the page moved on or closed is Next.js working as designed, not a failure.
  const cancelled = (r) => /[?&]_rsc=/.test(r.url()) && /ABORTED|cancelled|Load request cancelled/i.test(r.failure()?.errorText ?? "");
  page.on("requestfailed", (r) => { if (!cancelled(r) && !blockedByTest(r)) problems.push(`request failed: ${r.url()} (${r.failure()?.errorText})`); });
  page.on("response", (r) => { if (r.status() >= 400 && !/calendar\/sync/.test(r.url())) problems.push(`HTTP ${r.status()}: ${r.url()}`); });
  return { problems, label };
}

async function scrollThrough(page) {
  // Phones have no mouse wheel (mobile WebKit refuses one), so the page is walked block by block instead.
  if (await page.evaluate(() => matchMedia("(pointer: coarse)").matches).catch(() => true)) {
    const blocks = page.locator("main :is(section, .card, form, nav, header, h1, h2, table, ul)");
    const n = Math.min(await blocks.count(), 80);
    for (let i = 0; i < n; i++) {
      await blocks.nth(i).scrollIntoViewIfNeeded({ timeout: 1500 }).catch(() => {});   // hidden ones (closed tabs, dialogs) are skipped
      await page.waitForTimeout(60);
    }
    await blocks.first().scrollIntoViewIfNeeded({ timeout: 1500 }).catch(() => {});
    return;
  }
  const box = page.viewportSize();
  for (let i = 0; i < 40; i++) {
    const before = await page.evaluate(() => window.scrollY).catch(() => null);
    await page.mouse.move(box.width / 2, box.height / 2);
    await page.mouse.wheel(0, Math.round(box.height * 0.7));
    await page.waitForTimeout(160);
    const after = await page.evaluate(() => window.scrollY).catch(() => null);
    if (before !== null && after === before) break;
    if (before === null) { await page.keyboard.press("PageDown"); }
  }
  await page.keyboard.press("End");
  await page.waitForTimeout(300);
  await page.keyboard.press("Home");
  await page.waitForTimeout(300);
}

const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: false }); };
const peek = (page, lobe) => page.locator(`.lobe-${lobe} .lobe-peek`);

const ONLY = process.env.BRAIN_E2E_ONLY?.split(",").map((s) => s.trim()).filter(Boolean);

async function scenario(name, engine, options, fn) {
  if (ONLY && !ONLY.includes(name)) return;
  let browser;
  try { browser = await engine.launch(engine === chromium ? { args: ["--disable-dev-shm-usage"] } : {}); }
  catch (e) { failed++; results.push(`FAIL ${name}\n     the browser would not start: ${String(e.message).split("\n")[0]}`); return; }
  const context = await browser.newContext({ baseURL: BASE, storageState: STATE, ...options });
  // The check must not sync anything: the calendar's poll is answered here with "not connected, nothing changed".
  await context.route("**/api/calendar/sync", (r) => r.fulfill({ status: 200, contentType: "application/json", body: '{"connected":false,"changed":false}' }));
  const page = await context.newPage();
  page.setDefaultTimeout(60_000);              // against `next dev`, the first visit to a page compiles it
  page.setDefaultNavigationTimeout(120_000);
  const w = watch(page, name, options.javaScriptEnabled === false);
  try {
    await fn(page);
    await page.waitForTimeout(400);
    assert.deepEqual(w.problems, [], `${name}: console or network problems`);
    results.push(`ok   ${name}`);
  } catch (e) {
    failed++;
    results.push(`FAIL ${name}\n     ${String(e.message).split("\n").join("\n     ")}${w.problems.length ? `\n     problems:\n       ${w.problems.join("\n       ")}` : ""}`);
    await shot(page, `${name}-failure`).catch(() => {});
  } finally {
    await browser.close();
  }
}

const STATE = await signedInState();

// 1. Desktop, JavaScript on: hover, keyboard, the core's panel.
await scenario("desktop-js", chromium, DESKTOP, async (page) => {
  await page.goto("/", { waitUntil: "load" });
  await page.waitForSelector("[data-brain].is-live");
  await page.waitForTimeout(1200);
  await shot(page, "desktop-js-load");
  for (const lobe of LOBES) {
    await page.hover(`.lobe-${lobe} .lobe-hit`);
    await assert.doesNotReject(peek(page, lobe).waitFor({ state: "visible", timeout: 2000 }), `${lobe} preview opens on hover`);
    if (lobe === "find") await shot(page, "desktop-js-hover-find");
    // Crossing the gap to the preview keeps it open.
    const link = peek(page, lobe).locator(".peek-link").first();
    const b = await link.boundingBox();
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 12 });
    assert.ok(await peek(page, lobe).isVisible(), `${lobe} preview stays open while moving onto it`);
  }
  await page.mouse.move(5, 5);
  await page.waitForTimeout(500);
  for (const lobe of LOBES) assert.ok(!(await peek(page, lobe).isVisible()), `${lobe} preview closes when the pointer leaves`);
  // Keyboard: focusing a lobe opens its preview, and Tab moves into it.
  await page.focus(".lobe-find .lobe-hit");
  await peek(page, "find").waitFor({ state: "visible", timeout: 2000 });
  await page.keyboard.press("Tab");
  assert.ok(await page.evaluate(() => document.activeElement?.classList.contains("peek-link")), "Tab moves into the preview");
  await page.keyboard.press("Escape");
  // The core opens the assistant panel; Escape closes it.
  await page.click(".brain-core");
  await page.waitForSelector("dialog.modal[open] .as-drawer");
  await page.waitForSelector(".as-drawer textarea[name=question]");
  await page.waitForTimeout(600);
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("name")), "question", "the question box takes focus");
  await shot(page, "desktop-js-panel");
  await page.keyboard.press("Escape");
  await page.waitForSelector("dialog.modal[open]", { state: "detached" });
  assert.equal(new URL(page.url()).pathname, "/", "the core did not navigate away with JavaScript on");
  await scrollThrough(page);
  await page.goto("/assistant");
  await page.waitForSelector("form textarea[name=question]");
  await shot(page, "desktop-js-assistant-page");
  await scrollThrough(page);
});

// 2. Desktop, JavaScript off: hover still previews (CSS), the core is a link to the assistant page, its form posts.
await scenario("desktop-nojs", chromium, { ...DESKTOP, javaScriptEnabled: false }, async (page) => {
  await page.goto("/", { waitUntil: "load" });
  await page.waitForTimeout(600);
  await shot(page, "desktop-nojs-load");
  for (const lobe of LOBES) {
    await page.hover(`.lobe-${lobe} .lobe-hit`);
    await peek(page, lobe).waitFor({ state: "visible", timeout: 2000 });
  }
  await page.mouse.move(5, 5);
  await page.focus(".lobe-deliver .lobe-hit");
  await peek(page, "deliver").waitFor({ state: "visible", timeout: 2000 });
  await scrollThrough(page);
  await page.click(".brain-core");
  await page.waitForURL("**/assistant");
  await page.waitForSelector("form textarea[name=question]");
  await shot(page, "desktop-nojs-assistant");
  if (ASK) {
    await page.fill("textarea[name=question]", "Which agreements should I send a new clinic client before a missed-call build, and in what order?");
    await page.selectOption("select[name=topic]", "contracts");
    await page.click("button[type=submit]");
    await page.waitForURL(/\/assistant\?thread=/, { timeout: 120_000 });
    await page.waitForSelector(".as-msg.as-assistant .as-answer", { timeout: 10_000 });
    assert.ok(await page.locator(".as-sources li").count() > 0, "the answer cites the knowledge files");
    await shot(page, "desktop-nojs-answer");
  }
  await scrollThrough(page);
});

// 3. Desktop with "reduce motion": no loops, everything still works.
await scenario("desktop-reduced-motion", chromium, { ...DESKTOP, reducedMotion: "reduce" }, async (page) => {
  await page.goto("/", { waitUntil: "load" });
  await page.waitForSelector("[data-brain].is-live");
  await page.waitForTimeout(800);
  const t = await page.evaluate(() => getComputedStyle(document.querySelector(".brain-img")).transform);
  assert.ok(t === "none" || t === "matrix(1, 0, 0, 1, 0, 0)", `the art stays still (transform ${t})`);
  await page.hover(".lobe-sell .lobe-hit");
  await peek(page, "sell").waitFor({ state: "visible", timeout: 2000 });
  await scrollThrough(page);
});

// 4 and 5. Phones (WebKit, as an iPhone Pro Max; and Chromium): JavaScript on, first tap previews, second opens.
for (const [label, engine] of [["phone-webkit-js", webkit], ["phone-chromium-js", chromium]]) {
  await scenario(label, engine, PHONE, async (page) => {
    await page.goto("/", { waitUntil: "load" });
    await page.waitForSelector("[data-brain].is-live");
    await page.waitForTimeout(1000);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.ok(overflow <= 0, `no sideways scroll (${overflow}px too wide)`);
    await page.locator(".brain").scrollIntoViewIfNeeded();
    await shot(page, `${label}-load`);
    await page.tap(".lobe-grow .lobe-hit");
    await peek(page, "grow").waitFor({ state: "visible", timeout: 2000 });
    assert.equal(new URL(page.url()).pathname, "/", "the first tap only previews");
    await shot(page, `${label}-tap-grow`);
    await page.tap(".lobe-sell .lobe-hit");
    await peek(page, "sell").waitFor({ state: "visible", timeout: 2000 });
    await page.waitForTimeout(450);   // the closing preview fades out first
    assert.ok(!(await peek(page, "grow").isVisible()), "opening one lobe closes the other");
    await page.tap(".lobe-sell .lobe-hit");
    await page.waitForURL("**/calls", { timeout: 15_000 });
    await page.goBack();
    await page.waitForSelector("[data-brain].is-live");
    await page.tap(".brain-core");
    await page.waitForSelector("dialog.modal[open] .as-drawer");
    await page.waitForTimeout(500);
    await shot(page, `${label}-panel`);
    await page.tap(".as-drawer button[aria-label=Close]");
    await page.waitForSelector("dialog.modal[open]", { state: "detached" });
    await scrollThrough(page);
  });
}

// 6. Phone, JavaScript off: every page is listed under the brain, a lobe tap opens its page, the core opens /assistant.
await scenario("phone-webkit-nojs", webkit, { ...PHONE, javaScriptEnabled: false }, async (page) => {
  await page.goto("/", { waitUntil: "load" });
  await page.waitForTimeout(600);
  await page.locator(".brain").scrollIntoViewIfNeeded();
  await shot(page, "phone-webkit-nojs-load");
  assert.ok(await page.locator(".brain-index").isVisible(), "the page list shows on a touch screen with JavaScript off");
  await page.tap(".lobe-deliver .lobe-hit");
  await page.waitForURL("**/clients", { timeout: 15_000 });
  await page.goBack();
  await page.tap(".brain-core");
  await page.waitForURL("**/assistant");
  await page.waitForSelector("form textarea[name=question]");
  await shot(page, "phone-webkit-nojs-assistant");
  await scrollThrough(page);
});

console.log(results.join("\n"));
console.log(failed ? `\n${failed} scenario(s) failed` : "\nAll scenarios passed");
process.exit(failed ? 1 : 0);
