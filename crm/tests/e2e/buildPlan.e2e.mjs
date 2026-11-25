// Drives the Build plan pipeline in a real browser: what a unit test can't see (the run-all sequence, Mermaid drawing, picking
// another angle, pasting a workflow, the price updating as hours change).
// It makes real AI calls and real searches of n8n's template library, and creates a proposal titled [TEST], so point it at a scratch database.
//   BUILD_E2E_URL=http://127.0.0.1:3001 APP_PASSWORD=... BUILD_E2E_JOB=<job.txt> BUILD_E2E_SHOTS=<folder> node crm/tests/e2e/buildPlan.e2e.mjs
// Not part of `npm test`, which has no browser.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium, webkit } from "playwright";

const BASE = process.env.BUILD_E2E_URL, PASSWORD = process.env.APP_PASSWORD, JOB = process.env.BUILD_E2E_JOB, SHOTS = process.env.BUILD_E2E_SHOTS;
if (!BASE || !PASSWORD || !JOB) { console.error("Set BUILD_E2E_URL, APP_PASSWORD and BUILD_E2E_JOB."); process.exit(2); }
const existing = process.env.BUILD_E2E_PROPOSAL;   // a proposal whose plan is already written: skips the AI calls that write it
const jobText = readFileSync(JOB, "utf8");
const plain = (s) => s.toLowerCase().replace(/[^a-z0-9£$%]+/g, " ").trim();

// BUILD_E2E_LEAN=1 for a machine short of memory.
const lean = process.env.BUILD_E2E_LEAN ? ["--single-process", "--no-zygote", "--disable-gpu", "--renderer-process-limit=1", "--js-flags=--max-old-space-size=200"] : [];
const errors = [];
async function open(engine, theme, viewport = { width: 1440, height: 1000 }) {
  const browser = await engine.launch(engine === chromium ? { args: ["--disable-dev-shm-usage", ...lean] } : {});
  const context = await browser.newContext({ baseURL: BASE, viewport });
  context.setDefaultTimeout(400_000);                // a dev server compiles each route on first visit
  context.setDefaultNavigationTimeout(400_000);
  for (const route of ["**/api/calendar/sync", "**/api/inbox/poll"]) await context.route(route, (r) => r.abort());   // the check must not sync or read anything
  await context.addCookies([{ name: "theme", value: theme, url: BASE }]);
  const page = await context.newPage();
  page.on("console", (m) => { if (m.type() === "error" && !/calendar\/sync|inbox\/poll|ERR_FAILED|Failed to load resource/.test(m.text() + m.location().url)) errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("dialog", (d) => d.accept());
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await page.fill('input[type="password"]', PASSWORD);
  await page.press('input[type="password"]', "Enter");
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { waitUntil: "domcontentloaded" });
  return { browser, page };
}
const go = async (page, to) => { for (let i = 0; ; i++) { try { return await page.goto(to, { waitUntil: "domcontentloaded" }); } catch (e) { if (i >= 3 || !/ERR_ABORTED|interrupted/.test(String(e))) throw e; } } };
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true }); };
const step = (m) => console.log(`ok - ${m}`);
const railState = (page, key) => page.locator(`.bp-rail li:has(a[href="#bp-${key}"])`).getAttribute("data-state");
const settled = (page) => page.waitForFunction(() => !document.querySelector('.bp-rail li[data-state="working"]') && !document.querySelector(".bp-step[aria-busy='true']"), null, { timeout: 300_000 });

let { browser, page } = await open(chromium, "light");
let url;
if (existing) url = `/proposals/${existing}?tab=build`;
else {
  await go(page, "/proposals/new");
  await page.getByRole("radio", { name: "Build plan" }).click();
  await page.fill('input[name="job_title"]', "[TEST] Lettings enquiry follow-up");
  await page.fill('textarea[name="job_text"]', jobText);
  await page.getByLabel(/Draft anyway/).check();     // the sample job's fit score isn't what this checks
  const started = Date.now();
  await page.getByRole("button", { name: "Start build plan" }).click();
  await Promise.race([
    page.waitForURL(/\/proposals\/\d+\?tab=build/, { timeout: 300_000, waitUntil: "domcontentloaded" }),
    page.locator('form [role="alert"]').waitFor({ timeout: 300_000 }).then(async () => { throw new Error(`The page said: ${await page.locator('form [role="alert"]').innerText()}`); }),
  ]);
  step("a new proposal opens on the Build plan tab and starts the run on its own");
  // The four steps run in order; the application text gains its price only when the last one is saved.
  await page.waitForFunction(() => /Fixed price: £/.test(document.querySelector("#bp-application-text")?.value ?? "") || !!document.querySelector(".card > .error"), null, { timeout: 400_000 });
  const failure = page.locator(".card > .error");
  if (await failure.count()) throw new Error(`The run stopped: ${await failure.innerText()}`);
  console.log(`# whole run took ${Math.round((Date.now() - started) / 1000)}s from the click (fit score included)`);
  url = `${new URL(page.url()).pathname}?tab=build`;
  assert.ok(!page.url().includes("run=1"), "the address is cleaned, so a reload cannot run it again");
  step("all four steps ran from one click");
}
if (SHOTS) writeFileSync(path.join(SHOTS, "plan-url.txt"), url);
await go(page, url);
await page.locator("#bp-application-text").waitFor();

// Step 1: every pain point quotes the job post, and one is chosen.
const quotes = await page.locator(".bp-quote").allInnerTexts();
assert.ok(quotes.length >= 1, "at least one pain point");
for (const q of quotes) assert.ok(plain(jobText).includes(plain(q.replace(/^[“"]|[”"]$/g, ""))), `quote is in the job post: ${q}`);
assert.equal(await page.locator('input[name="bp-angle"]:checked').count(), 1);
step(`step 1 shows ${quotes.length} pain points, each with words from the job post, and one chosen`);

// Step 2: up to three matches with a reason, and one chosen.
const matches = await page.locator(".bp-match").count();
assert.ok(matches >= 1 && matches <= 3, `1 to 3 matches, saw ${matches}`);
assert.equal(await page.locator(".bp-match.on").count(), 1, "the top match was taken");
for (const reason of await page.locator(".bp-match > p").allInnerTexts()) assert.ok(reason.length > 5 && !/[£$]\s?\d|\d\s?%/.test(reason), `reason has no figure: ${reason}`);
step(`step 2 shows ${matches} matches with a reason each`);

// Step 3: the diagram drew, and there is a line for every step.
await page.locator("#bp-demo .lp-diagram svg").waitFor();
const lines = await page.locator("#bp-demo .bp-walk textarea").evaluateAll((els) => els.map((e) => e.value));
assert.ok(lines.length >= 2 && lines.every((l) => l.trim().length > 8), "a walkthrough line for every step");
const heading = await page.locator("#bp-demo input").first().inputValue();
assert.match(heading, /pattern I'd start from/, "a public template is not presented as a workflow the owner uses");
step(`step 3 drew the workflow and wrote ${lines.length} walkthrough lines under an honest heading`);

// Step 4: the plan's diagram drew, and the price follows the hours.
await page.locator("#bp-plan .lp-diagram svg").waitFor();
assert.ok((await page.locator("#bp-plan .bp-flow li").count()) >= 4);
const price = () => page.locator("#bp-plan .bp-price").innerText();
const before = await price();
const hoursTo = page.getByLabel("Milestone 1: hours to");
await hoursTo.fill(String(Number(await hoursTo.inputValue()) + 10));
assert.notEqual(await price(), before, "the fixed price is worked out again as the hours change");
await page.reload({ waitUntil: "domcontentloaded" });
await page.locator("#bp-plan .bp-price").waitFor();
assert.equal(await price(), before, "an unsaved change is not kept");
const text = await page.locator("#bp-application-text").inputValue();
assert.ok(text.includes(`Fixed price: ${before}`), "the application text carries the same fixed price");
assert.match(text, /MILESTONES\n1\. .+ \(days? \d/);
step(`step 4 drew the plan and priced it in code (${before}); the application text matches`);
await shot(page, "1-light-desktop");

// Picking another angle marks the later steps out of date, and the application text drops them.
if (quotes.length > 1) {
  await page.locator('input[name="bp-angle"]').nth(1).check();
  await page.waitForFunction(() => document.querySelector('.bp-rail li:nth-child(4)')?.getAttribute("data-state") === "stale");
  assert.equal(await railState(page, "matches"), "stale");
  assert.equal(await railState(page, "demo"), "stale");
  assert.ok(!(await page.locator("#bp-application-text").inputValue()).includes("Fixed price"), "out-of-date steps are left out of the application text");
  step("choosing another pain point marks steps 2 to 4 out of date without rewriting them");
  await shot(page, "2-another-angle");
  await page.locator('input[name="bp-angle"]').nth(0).check();
  await page.waitForFunction(() => document.querySelector('.bp-rail li:nth-child(4)')?.getAttribute("data-state") === "ready");
  step("choosing the first one again brings them back");
}

// Pasting a workflow of my own: read in the browser, presented as mine only when I say I have run it.
const blueprint = { name: "Enquiry to CRM", flow: [{ id: 1, module: "gateway:CustomWebHook", parameters: { hook: 1 } }, { id: 2, module: "hubspotcrm:createContact", mapper: { email: "jane@example.com" } }, { id: 3, module: "slack:CreateMessage" }] };
await page.locator("#bp-matches details.lp-item > summary").click();
await page.getByLabel("Template link or workflow JSON").fill(JSON.stringify(blueprint));
await page.getByText("Make", { exact: true }).first().waitFor();
await page.getByLabel(/I have run this workflow myself/).check();
await page.getByRole("button", { name: "Use this workflow" }).click();
await page.locator(".bp-chosen", { hasText: "Enquiry to CRM" }).waitFor();
assert.match(await page.locator(".bp-chosen").innerText(), /Yours/);
assert.equal(await railState(page, "demo"), "stale");
await page.locator("#bp-demo").getByRole("button", { name: "Write again" }).click();
await page.waitForFunction(() => /workflow I use/.test(document.querySelector("#bp-demo input")?.value ?? ""), null, { timeout: 200_000 });
await settled(page);
assert.equal((await page.locator("#bp-demo .bp-walk textarea").count()), 3);
step("a pasted Make blueprint I have run is read in the browser, chosen, and headed as a workflow I use");
await shot(page, "3-own-workflow");
await browser.close();

// Dark theme, and a phone in WebKit.
({ browser, page } = await open(chromium, "dark"));
await go(page, url);
await page.locator("#bp-demo .lp-diagram svg").waitFor();
await shot(page, "4-dark-desktop");
await browser.close();
({ browser, page } = await open(webkit, "light", { width: 440, height: 956 }));
await go(page, url);
await page.locator("#bp-demo .lp-diagram svg").waitFor();
const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
assert.ok(overflow <= 1, `the page does not scroll sideways on a phone (overflow ${overflow}px)`);
await shot(page, "5-phone-webkit");
step("dark theme and a 440px WebKit phone both draw, with no sideways scroll");
await browser.close();

assert.deepEqual(errors, [], "no errors in the browser console");
step("no errors in the browser console");
