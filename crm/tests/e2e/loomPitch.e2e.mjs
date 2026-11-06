// Drives the Loom pitch in a real browser: what a unit test can't see (Mermaid drawing, the live count, saving, the Loom link step).
// It makes real AI calls (one fit score, one full pitch, one section rewrite) and creates a proposal titled [TEST], so point it at a scratch database.
//   LOOM_E2E_URL=http://127.0.0.1:3001 APP_PASSWORD=... LOOM_E2E_JOB=<job.txt> LOOM_E2E_SHOTS=<folder> node crm/tests/e2e/loomPitch.e2e.mjs
// Not part of `npm test`, which has no browser. Writes the pitch as saved to <LOOM_E2E_SHOTS>/pitch-url.txt so it can be read back.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const BASE = process.env.LOOM_E2E_URL, PASSWORD = process.env.APP_PASSWORD, JOB = process.env.LOOM_E2E_JOB, SHOTS = process.env.LOOM_E2E_SHOTS;
if (!BASE || !PASSWORD || !JOB) { console.error("Set LOOM_E2E_URL, APP_PASSWORD and LOOM_E2E_JOB."); process.exit(2); }
const existing = process.env.LOOM_E2E_PROPOSAL;   // a proposal already written: skips the AI call that writes it

// LOOM_E2E_LEAN=1 for a machine short of memory.
const lean = process.env.LOOM_E2E_LEAN ? ["--single-process", "--no-zygote", "--disable-gpu", "--renderer-process-limit=1", "--js-flags=--max-old-space-size=200"] : [];
const browser = await chromium.launch({ args: ["--disable-dev-shm-usage", ...lean] });
const errors = [];
async function open(theme) {
  const context = await browser.newContext({ baseURL: BASE, viewport: { width: 1440, height: 1000 }, permissions: ["clipboard-read", "clipboard-write"] });
  context.setDefaultTimeout(180_000);                // a dev server compiles each route on first visit
  context.setDefaultNavigationTimeout(180_000);
  for (const route of ["**/api/calendar/sync", "**/api/inbox/poll"]) await context.route(route, (r) => r.abort());   // the check must not sync or read anything
  await context.addCookies([{ name: "theme", value: theme, url: BASE }]);
  const page = await context.newPage();
  page.on("console", (m) => { if (m.type() === "error" && !/calendar\/sync|inbox\/poll|ERR_FAILED/.test(m.text() + m.location().url)) errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("dialog", (d) => d.accept());
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await page.fill('input[type="password"]', PASSWORD);
  await page.press('input[type="password"]', "Enter");
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { waitUntil: "domcontentloaded" });
  return { context, page };
}
// A first visit can abort while the dev server is still compiling and redirecting, so try again.
const go = async (page, to) => { for (let i = 0; ; i++) { try { return await page.goto(to, { waitUntil: "domcontentloaded" }); } catch (e) { if (i >= 3 || !/ERR_ABORTED|interrupted/.test(String(e))) throw e; } } };
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true }); };
const step = (m) => console.log(`ok - ${m}`);

let { context, page } = await open("light");
let url;
if (existing) url = `/proposals/${existing}`;
else {
  await go(page, "/proposals/new");
  await page.getByRole("radio", { name: "Loom pitch" }).click();
  await page.fill('input[name="job_title"]', "[TEST] Digital mail scanning & distribution automation");
  await page.fill('textarea[name="job_text"]', readFileSync(JOB, "utf8"));
  await page.fill('textarea[name="screening_questions"]', "What certifications do you have?\nWhat's your tone of voice like with clients?");
  await page.getByLabel(/Draft anyway/).check();     // the sample job's fit score isn't what this checks
  await page.getByRole("button", { name: "Write Loom pitch" }).click();
  // Either it arrives on the proposal, or the page says why not.
  await Promise.race([
    page.waitForURL(/\/proposals\/\d+/, { timeout: 300_000, waitUntil: "domcontentloaded" }),
    page.locator('form [role="alert"]').waitFor({ timeout: 300_000 }).then(async () => { throw new Error(`The page said: ${await page.locator('form [role="alert"]').innerText()}`); }),
  ]);
  url = new URL(page.url()).pathname;
  step("wrote a Loom pitch from the new proposal page");
}
if (SHOTS) writeFileSync(path.join(SHOTS, "pitch-url.txt"), url);

await go(page, url);
await page.waitForSelector("#loom-pitch .lp-diagram svg", { timeout: 90_000 });
assert.ok(await page.locator("#loom-pitch .lp-diagram svg .node").count() >= 4, "the diagram draws its steps");
step("the diagram draws");
for (const s of ["job_analysis", "workflow_diagram", "loom_script", "tool_flexibility_line", "cover_letter", "screening_answers", "pre_record_checklist"]) assert.equal(await page.locator(`#lp-${s}`).count(), 1, s);
step("every section is shown");
assert.match(await page.locator("#lp-job_analysis").innerText(), /Personal data/);
assert.equal(await page.locator("#loom-pitch").getByRole("button", { name: /^Write/ }).count() <= 1, true);
await shot(page, "pitch-light");
if (SHOTS) {
  await page.locator("#lp-job_analysis").screenshot({ path: path.join(SHOTS, "analysis-light.png") });
  await page.locator("#lp-workflow_diagram").screenshot({ path: path.join(SHOTS, "diagram-light.png") });
}

// Copying the raw Mermaid
// Browsers only offer the clipboard on https or localhost, so over any other address check the text the button would copy.
if (await page.evaluate(() => window.isSecureContext)) {
  await page.locator("#lp-workflow_diagram").getByRole("button", { name: "Copy Mermaid" }).click();
  assert.match(await page.evaluate(() => navigator.clipboard.readText()), /^flowchart LR/);
} else assert.match(await page.locator("#lp-mermaid").inputValue(), /^flowchart LR/);
step("the raw Mermaid copies");

// The live count, and the highlight past 200
const letter = page.getByLabel("Cover letter", { exact: true });
const original = await letter.inputValue();
const count = page.getByTestId("cover-count");
assert.match(await count.innerText(), /^\d+ characters/);
const n = Number((await count.innerText()).split(" ")[0]);
assert.equal(n, original.length - 12 + 59, "counted with a real link length");
await letter.fill(`${original} ${"x".repeat(40)}`);
assert.match(await count.getAttribute("class"), /over-soft|over-max/);
assert.ok(await page.locator(".lp-preview mark").count());
await shot(page, "cover-over");
await letter.fill(`${original} ${"x".repeat(100)}`);
assert.match(await count.getAttribute("class"), /over-max/);
await letter.fill(original);
step("the live count warns past 200 and past 250");

// An edit saves and survives a reload
const toolLine = page.getByLabel("Tool line");
const oldLine = await toolLine.inputValue();
await toolLine.fill(`${oldLine} Edited.`);
await page.locator("#lp-tool_flexibility_line").getByRole("button", { name: "Save" }).click();
await page.waitForFunction(() => document.body.innerText.includes("Tool line saved"), null, { timeout: 120_000 });
await page.reload({ waitUntil: "domcontentloaded" });
assert.match(await page.getByLabel("Tool line").inputValue(), /Edited\.$/);
step("an edit saves");

// Contact details are refused
await page.getByLabel("Tool line").fill("Call me on 07700 900123");
await page.locator("#lp-tool_flexibility_line").getByRole("button", { name: "Save" }).click();
await page.waitForFunction(() => document.body.innerText.includes("Leave email addresses"), null, { timeout: 120_000 });
await page.getByLabel("Tool line").fill(oldLine);
await page.locator("#lp-tool_flexibility_line").getByRole("button", { name: "Save" }).click();
await page.waitForFunction(() => document.body.innerText.includes("Tool line saved"), null, { timeout: 120_000 });
step("contact details are refused");

// The Loom link: a wrong one is refused; the right one fills the letter beside the job title
const link = page.locator("#lp-loom-url input");
await link.fill("https://example.com/not-loom");
await page.getByRole("button", { name: "Add to the letter" }).click();
await page.waitForFunction(() => document.body.innerText.includes("isn't a Loom share link"), null, { timeout: 120_000 });
await link.fill("https://www.loom.com/share/0123456789abcdef0123456789abcdef?sid=abc");
await page.getByRole("button", { name: "Add to the letter" }).click();
const final = page.getByLabel("Finished cover letter");
await final.waitFor({ timeout: 30_000 });
assert.match(await final.inputValue(), /https:\/\/www\.loom\.com\/share\/0123456789abcdef0123456789abcdef$/);
assert.doesNotMatch(await final.inputValue(), /LOOM_URL|sid=/);
assert.match(await page.locator("#lp-loom-url").innerText(), /This video goes with:[\s\S]*\[TEST\] Digital mail/);
step("the Loom link fills the letter, beside the job title");

// Save a new answer to the bank
const newAnswer = page.locator("#lp-screening_answers .lp-item").filter({ hasText: "tone of voice" });
if (await newAnswer.getByText("Needs your answer").count() || await newAnswer.getByText("New", { exact: true }).count()) {
  await newAnswer.locator("textarea").fill("[TEST] Casual, clear and plain.");
  await newAnswer.getByRole("button", { name: "Save to bank" }).click();
  await page.waitForFunction(() => document.body.innerText.includes("Saved to your answer bank"), null, { timeout: 120_000 });
  step("a new answer saves to the bank");
}

// One section rewrites on its own, leaving the rest alone
const before = await page.locator("#lp-pre_record_checklist textarea").inputValue();
const lineBefore = await page.getByLabel("Tool line").inputValue();
await page.locator("#lp-cover_letter").getByRole("button", { name: "Rewrite" }).click();
await page.waitForFunction(() => document.body.innerText.includes("Cover letter rewritten") || document.body.innerText.includes("didn't pass"), null, { timeout: 120_000 });
assert.ok((await page.locator("body").innerText()).includes("Cover letter rewritten"), "the cover letter rewrote");
assert.equal(await page.locator("#lp-pre_record_checklist textarea").inputValue(), before);
assert.equal(await page.getByLabel("Tool line").inputValue(), lineBefore);
step("one section rewrites on its own");

// Status and the comparison
await page.selectOption('select[name="status"]', "Viewed");
await page.locator('form:has(select[name="status"])').getByRole("button", { name: "Save", exact: true }).click();
await page.waitForFunction(() => document.body.innerText.includes("Proposal saved"), null, { timeout: 120_000 });
await go(page, "/proposals");
await page.getByRole("link", { name: "Viewed", exact: true }).waitFor();
assert.match(await page.locator("body").innerText(), /Loom pitches against plain proposals/i);
await shot(page, "list-light");
step("status and the comparison");

await go(page, "/proposals/library");
assert.match(await page.locator("body").innerText(), /Indulging Beauty OS[\s\S]*Clinic Buddy|Clinic Buddy[\s\S]*Indulging Beauty OS/);
await shot(page, "library-light");
step("the library lists the seeded projects");
await context.close();

// Dark theme
({ context, page } = await open("dark"));
await go(page, url);
await page.waitForSelector("#loom-pitch .lp-diagram svg", { timeout: 90_000 });
await shot(page, "pitch-dark");
await page.locator("#lp-loom_script").screenshot({ path: SHOTS ? path.join(SHOTS, "script-dark.png") : undefined });
await go(page, "/proposals/library");
await page.waitForSelector("#proof-h");
await shot(page, "library-dark");
step("dark theme draws");
await context.close();
await browser.close();

if (errors.length) { console.error("Console errors:\n" + [...new Set(errors)].join("\n")); process.exit(1); }
console.log("All passed, no console errors.");
