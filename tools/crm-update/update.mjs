#!/usr/bin/env node
// Updates the running CRM without breaking it. The live version keeps working until the new one has passed its checks.
//
// Usage (in the Mac's Terminal app):  bash scripts/update-crm.sh
//       go back to the last version:  bash scripts/update-crm.sh --rollback
//
// Tests, then build in a separate folder, then database changes, then a trial run on a spare port, then swap and restart,
// then a check of the real CRM, going back to the previous version by itself if that check fails.
// See docs/SETUP.md. Secrets are read from .env and never printed.
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assetsIn, pendingMigrations, riskyMigration, sessionCookie, tailLines } from "./rules.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const CRM = path.join(ROOT, "crm");
// The defaults are the Mac's real service. These three settings exist so the whole command can be rehearsed in the container against a throwaway server.
const LIVE = process.env.CRM_UPDATE_LIVE_DIR || ".next";
const BASE = process.env.CRM_UPDATE_URL || "http://127.0.0.1:3000";
const RESTART_CMD = process.env.CRM_UPDATE_RESTART_CMD;
const BUILD = ".next-build";
const CACHE = ".next-build-cache";          // kept between updates, so builds stay quick
const PREVIOUS = `${LIVE}-previous`;
const FAILED = `${LIVE}-failed`;
const LOCK = path.join(CRM, ".update-lock");
const PAGES = ["/", "/content", "/proposals", "/tasks", "/deals"];   // read-only pages that together touch most of the database
const MANUAL_RESTART = "launchctl kickstart -k gui/$(id -u)/com.agencyos.crm";

const dir = (name) => path.join(CRM, name);
const say = (text = "") => console.log(text);
const step = (n, text) => say(`\n${n}. ${text}`);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const buildIdIn = (name) => { try { return fs.readFileSync(path.join(dir(name), "BUILD_ID"), "utf8").trim(); } catch { return null; } };
class Stop extends Error {}

let trial = null;
function stopTrial() {
  if (!trial) return;
  try { process.kill(-trial.pid, "SIGTERM"); } catch { /* already gone */ }
  trial = null;
}
function run(cmd, args, options = {}) {
  const r = spawnSync(cmd, args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, ...options });
  return { ok: r.status === 0, output: `${r.stdout ?? ""}${r.stderr ?? ""}${r.error ? r.error.message : ""}` };
}

// ---------- one update at a time ----------
function takeLock() {
  try {
    const held = JSON.parse(fs.readFileSync(LOCK, "utf8"));
    let alive = Date.now() - held.at < 30 * 60_000;
    if (alive && held.host === os.hostname()) { try { process.kill(held.pid, 0); } catch { alive = false; } }
    if (alive) throw new Stop("Another update is already running. Wait for it to finish.");
  } catch (err) { if (err instanceof Stop) throw err; }
  fs.writeFileSync(LOCK, JSON.stringify({ pid: process.pid, host: os.hostname(), at: Date.now() }));
}
const dropLock = () => fs.rmSync(LOCK, { force: true });

// ---------- checks ----------
async function get(url, cookie) {
  const res = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(30_000), headers: cookie ? { cookie } : {} });
  return { status: res.status, text: await res.text() };
}

/** Everything that went wrong with a server, or nothing if it is healthy and running this build. */
async function problemsWith(base, buildId) {
  const out = [];
  const login = await get(`${base}/login`);
  if (login.status !== 200) return [`the login page answered ${login.status}`];
  if (buildId && !login.text.includes(buildId)) return ["it is not running the expected version yet"];
  const assets = assetsIn(login.text);
  if (assets.length === 0) out.push("the login page lists no scripts or styles");
  for (const a of assets) { const r = await get(base + a); if (r.status !== 200) out.push(`${a} answered ${r.status}`); }
  const cookie = sessionCookie(process.env.SESSION_SECRET ?? "");
  for (const page of PAGES) { const r = await get(base + page, cookie); if (r.status !== 200) out.push(`${page} answered ${r.status}`); }
  const api = await get(`${base}/api/needs-you`, cookie);
  if (api.status !== 200) out.push(`the sidebar numbers answered ${api.status}`);
  else {
    const j = JSON.parse(api.text);
    if (j.failed?.length) out.push(`the sidebar numbers could not check: ${j.failed.join(", ")}`);
    if (buildId && j.build !== buildId) out.push("the sidebar numbers came from a different version");
  }
  return out;
}

/** Keeps asking until the server is healthy or time runs out: it may still be starting, or the database waking up. */
async function waitUntilHealthy(base, buildId, seconds = 90) {
  const deadline = Date.now() + seconds * 1000;
  let last = ["it did not answer"];
  while (Date.now() < deadline) {
    try { last = await problemsWith(base, buildId); if (last.length === 0) return []; }
    catch (err) { last = [`it did not answer (${err.message})`]; }
    await sleep(2000);
  }
  return last;
}

const freePort = () => new Promise((resolve, reject) => {
  const s = net.createServer();
  s.once("error", reject);
  s.listen(0, "127.0.0.1", () => { const { port } = s.address(); s.close(() => resolve(port)); });
});

// ---------- the steps ----------
function preflight() {
  if (process.platform !== "darwin" && !RESTART_CMD) {
    throw new Stop("Run this in the Mac's Terminal app. A VS Code terminal is inside the container, which cannot restart your CRM.");
  }
  try { process.loadEnvFile(path.join(ROOT, ".env")); } catch { /* the settings may already be in the environment */ }
  if ((process.env.SESSION_SECRET ?? "").length < 32) throw new Stop("SESSION_SECRET is missing from .env, so the new version could not be checked.");
  const deps = run("npm", ["ls", "--depth=0"], { cwd: CRM });
  if (!deps.ok) throw new Stop(`The CRM's packages do not match its package list. Run npm install in crm/ first.\n${tailLines(deps.output, 8)}`);
}

function checkMigrations(allowRisky) {
  const status = run("npm", ["run", "--silent", "db:status"], { cwd: ROOT });
  if (!status.output.includes("Applied:")) throw new Stop(`Could not reach the database, so nothing was changed.\n${tailLines(status.output, 6)}`);
  const pending = pendingMigrations(status.output);
  for (const file of pending) {
    const reason = riskyMigration(fs.readFileSync(path.join(ROOT, "db/migrations", file), "utf8"));
    if (reason && !allowRisky) throw new Stop(`${file} ${reason}, so the previous version might stop working and going back would not help.\nBack up first, then run this again with --allow-risky-migration if you are sure.`);
  }
  return pending;
}

function runTests() {
  const t = run("npm", ["test"], { cwd: CRM });
  if (!t.ok) throw new Stop(`A test failed, so nothing was changed.\n${tailLines(t.output, 30)}`);
  say(`   ${t.output.match(/^# pass (\d+)/m)?.[1] ?? "All"} tests passed.`);
}

function build() {
  // A previous attempt may have stopped halfway. Its cache is worth keeping, the rest is not.
  if (fs.existsSync(path.join(dir(BUILD), "cache")) && !fs.existsSync(dir(CACHE))) fs.renameSync(path.join(dir(BUILD), "cache"), dir(CACHE));
  fs.rmSync(dir(BUILD), { recursive: true, force: true });
  if (fs.existsSync(dir(CACHE))) { fs.mkdirSync(dir(BUILD)); fs.renameSync(dir(CACHE), path.join(dir(BUILD), "cache")); }
  const envFile = path.join(CRM, "next-env.d.ts");
  const keep = fs.existsSync(envFile) ? fs.readFileSync(envFile, "utf8") : null;
  const started = Date.now();
  const b = run(process.execPath, ["node_modules/next/dist/bin/next", "build"], { cwd: CRM, env: { ...process.env, NODE_ENV: "production", NEXT_DIST_DIR: BUILD } });
  if (keep !== null) fs.writeFileSync(envFile, keep);   // Next points this at the folder it built in
  if (!b.ok) throw new Stop(`The build failed, so nothing was changed.\n${tailLines(b.output, 30)}`);
  const id = buildIdIn(BUILD);
  if (!id) throw new Stop("The build finished without a version number, so nothing was changed.");
  say(`   Built in ${Math.round((Date.now() - started) / 1000)} seconds.`);
  return id;
}

function migrate(pending) {
  if (pending.length === 0) return say("   None to apply.");
  const m = run("npm", ["run", "--silent", "db:migrate"], { cwd: ROOT });
  if (!m.ok) throw new Stop(`A database change failed. Your CRM keeps running the current version, so check it still behaves.\n${tailLines(m.output, 12)}`);
  say(`   Applied ${pending.join(", ")}.`);
}

async function trialRun(buildId) {
  const port = await freePort();
  const logs = [];
  trial = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-H", "127.0.0.1", "-p", String(port)], {
    cwd: CRM, detached: true, stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, NODE_ENV: "production", LOCAL_HTTP: "1", NEXT_DIST_DIR: BUILD },
  });
  trial.stdout.on("data", (d) => logs.push(String(d)));
  trial.stderr.on("data", (d) => logs.push(String(d)));
  const problems = await waitUntilHealthy(`http://127.0.0.1:${port}`, buildId, 120);
  stopTrial();
  if (problems.length) throw new Stop(`The new version failed its trial run, so your CRM was left as it is:\n - ${problems.join("\n - ")}\n${tailLines(logs.join(""), 15)}`);
  say("   Login, scripts, main pages and live numbers all work.");
}

function swapIn() {
  fs.rmSync(dir(CACHE), { recursive: true, force: true });
  if (fs.existsSync(path.join(dir(BUILD), "cache"))) fs.renameSync(path.join(dir(BUILD), "cache"), dir(CACHE));
  fs.rmSync(dir(PREVIOUS), { recursive: true, force: true });
  if (fs.existsSync(dir(LIVE))) fs.renameSync(dir(LIVE), dir(PREVIOUS));
  fs.renameSync(dir(BUILD), dir(LIVE));
}

function restart() {
  const r = RESTART_CMD ? run("bash", ["-c", RESTART_CMD], { cwd: CRM }) : run("launchctl", ["kickstart", "-k", `gui/${process.getuid()}/com.agencyos.crm`]);
  if (!r.ok) say(`   The restart command reported a problem: ${tailLines(r.output, 3)}`);
}

/** Puts the previous version back, and keeps the one taken out for a look. */
async function goBack(keepAs) {
  if (!fs.existsSync(dir(PREVIOUS))) throw new Stop("There is no previous version to go back to.");
  const id = buildIdIn(PREVIOUS);
  fs.rmSync(dir(keepAs), { recursive: true, force: true });
  fs.renameSync(dir(LIVE), dir(keepAs));
  fs.renameSync(dir(PREVIOUS), dir(LIVE));
  restart();
  const problems = await waitUntilHealthy(BASE, id);
  if (problems.length) throw new Stop(`The previous version is back in place but is not answering properly:\n - ${problems.join("\n - ")}\nTry: ${MANUAL_RESTART}\nThe log is at ~/Library/Logs/agency-os/crm.log`);
}

async function update(allowRisky) {
  const was = buildIdIn(LIVE);
  say("Updating the CRM. It keeps running as normal until step 6.");
  step(1, "Checking the setup and the database changes…");
  preflight();
  const pending = checkMigrations(allowRisky);
  step(2, "Running the tests…");
  runTests();
  step(3, "Building the new version in a separate folder…");
  const id = build();
  step(4, "Applying database changes…");
  migrate(pending);
  step(5, "Trying the new version on a spare port…");
  await trialRun(id);
  step(6, "Swapping it in and restarting (a few seconds)…");
  swapIn();
  restart();
  step(7, "Checking the real CRM…");
  // It has already passed on the spare port and the database is awake, so a long wait here is only a longer outage.
  const problems = await waitUntilHealthy(BASE, id, 45);
  if (problems.length) {
    say(`   The new version failed once live:\n    - ${problems.join("\n    - ")}\n   Going back to the previous version…`);
    await goBack(FAILED);
    throw new Stop(`Your CRM is back on the previous version and working. The failed build is kept in crm/${FAILED}.${pending.length ? " Database changes stay applied." : ""}`);
  }
  fs.rmSync(dir(FAILED), { recursive: true, force: true });   // a build kept from an earlier failure is no longer of interest
  say(`\nDone. Version ${was ?? "(none)"} replaced by ${id}.\nRefresh your CRM tab to see it. If something looks wrong, go back with: bash scripts/update-crm.sh --rollback`);
}

async function rollback() {
  preflight();
  say("Going back to the previous version…");
  // The version taken out goes where the previous one was, so running this again goes forward again.
  const swap = `${LIVE}-swap`;
  await goBack(swap);
  fs.rmSync(dir(PREVIOUS), { recursive: true, force: true });
  fs.renameSync(dir(swap), dir(PREVIOUS));
  say("Done. Refresh your CRM tab. Database changes stay applied.");
}

// ---------- main ----------
const args = new Set(process.argv.slice(2));
const unknown = [...args].filter((a) => !["--rollback", "--allow-risky-migration"].includes(a));
if (unknown.length) { console.error(`Unknown option: ${unknown.join(" ")}`); process.exit(2); }

for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => { stopTrial(); dropLock(); process.exit(130); });

try {
  takeLock();
  await (args.has("--rollback") ? rollback() : update(args.has("--allow-risky-migration")));
} catch (err) {
  stopTrial();
  console.error(`\nStopped. ${err instanceof Stop ? err.message : `Something unexpected went wrong: ${err?.stack ?? err}`}`);
  process.exitCode = 1;
} finally {
  dropLock();
}
