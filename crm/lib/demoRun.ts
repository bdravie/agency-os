// Run a demo from a proposal: finds the owner's demos closest to the job post and runs the chosen one's demo version on this computer.
// The demo version is the free one (config/demos.yaml): fake data, the demo's own offline mode, no paid accounts. A demo is started
// with only a handful of plain settings, never the CRM's keys or database address, so a run cannot send, spend or reach the business data.
// Plain server module (no "use server"): the actions that call it check you are logged in first.
import { execFile, spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { parse } from "yaml";
import { cleanRecipes, joinDemos, pickTop, rankDemos, tidyOutput, type Cmd, type DemoMatch, type OpenLink, type Recipe } from "./demoRunMath.ts";
import { loadProof } from "./pitchLibrary.ts";

const ROOT = path.resolve(process.cwd(), "..");
const FILE = path.join(ROOT, "config", "demos.yaml");
const STEP_SECONDS = 120, START_SECONDS = 40;

let cache: { at: number; recipes: Recipe[]; problems: string[] } | null = null;

/** The recipes in config/demos.yaml whose folder exists, read again whenever the file changes. `problems` names any entry that was left out. */
export async function loadRecipes(): Promise<{ recipes: Recipe[]; problems: string[] }> {
  const at = (await stat(FILE).catch(() => null))?.mtimeMs ?? 0;
  if (!at) return { recipes: [], problems: ["config/demos.yaml is missing."] };
  if (cache?.at !== at) {
    let raw: unknown = null, bad = "";
    try { raw = parse(await readFile(FILE, "utf8")); } catch (err) { bad = `config/demos.yaml could not be read: ${err instanceof Error ? err.message : String(err)}`; }
    const r = cleanRecipes(raw);
    const here = r.recipes.filter((x) => existsSync(path.join(ROOT, "demos", x.folder)));
    const gone = r.recipes.filter((x) => !here.includes(x)).map((x) => `${x.folder}: there is no such folder in demos/`);
    cache = { at, recipes: here, problems: [...(bad ? [bad] : []), ...r.problems, ...gone] };
  }
  return { recipes: cache.recipes, problems: cache.problems };
}

/** The three closest demos that can be run, any closer one that cannot, and anything wrong with the recipe file. */
export async function demosFor(job: string): Promise<{ top: DemoMatch[]; closer: DemoMatch[]; problems: string[]; demos: number }> {
  const [{ recipes, problems }, proof] = await Promise.all([loadRecipes(), loadProof()]);
  const cands = joinDemos(proof, recipes);
  return { ...pickTop(rankDemos(job, cands)), problems, demos: cands.length };
}

// ---------- Running ----------

/** What a demo is started with: where to find programs, and nothing of the CRM's own (no keys, no database address). */
function demoEnv(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  const keep = Object.fromEntries(["HOME", "USER", "LANG", "LC_ALL", "TMPDIR", "SHELL"].flatMap((k) => (process.env[k] ? [[k, process.env[k] as string]] : [])));
  return { ...keep, PATH: [path.dirname(process.execPath), process.env.PATH ?? "/usr/local/bin:/usr/bin:/bin"].join(path.delimiter), NO_COLOR: "1", FORCE_COLOR: "0", ...extra } as unknown as NodeJS.ProcessEnv;
}

/** The real program behind a recipe's first word: this computer's Node, the project's own Python, or npm. */
function program(cmd: Cmd): { file: string; args: string[]; error?: string } {
  const [runner, ...args] = cmd;
  if (runner === "node") return { file: process.execPath, args };
  if (runner === "npm") { const beside = path.join(path.dirname(process.execPath), "npm"); return { file: existsSync(beside) ? beside : "npm", args }; }
  const python = path.join(ROOT, ".venv", "bin", "python");
  return existsSync(python) ? { file: python, args } : { file: python, args, error: "The Python tools are not set up on this computer. In the project folder run: uv sync (install uv first with: brew install uv)." };
}

const said = (cmd: Cmd) => `$ ${cmd.join(" ")}`;

/** Runs a recipe's one-off steps in order and returns what they printed. Stops at the first one that fails. */
export async function runSteps(recipe: Recipe): Promise<{ ok: boolean; output: string }> {
  const out: string[] = [];
  for (const cmd of recipe.steps) {
    const p = program(cmd);
    if (p.error) return { ok: false, output: tidyOutput([...out, said(cmd), p.error].join("\n")) };
    const r = await new Promise<{ ok: boolean; text: string }>((resolve) => {
      execFile(p.file, p.args, { cwd: ROOT, env: demoEnv(), timeout: STEP_SECONDS * 1000, maxBuffer: 4_000_000 }, (err, stdout, stderr) => {
        const timedOut = !!err && (err as { killed?: boolean }).killed;
        resolve({ ok: !err, text: `${stdout}${stderr ? `\n${stderr}` : ""}${timedOut ? `\nStopped after ${STEP_SECONDS} seconds.` : err && !stdout && !stderr ? `\n${err.message}` : ""}` });
      });
    });
    out.push(said(cmd), r.text.trim(), "");
    if (!r.ok) return { ok: false, output: tidyOutput(out.join("\n")) };
  }
  return { ok: true, output: tidyOutput(out.join("\n")) };
}

// ---------- A demo's local page (one at a time) ----------

export type Serving = { folder: string; title: string; port: number; open: OpenLink[]; since: string };
type Running = Serving & { child: ChildProcess; log: string };
// Kept on globalThis so a reload of this module while developing does not lose track of a page that is still up.
const store = globalThis as unknown as { __demoServing?: Running | null; __demoExitHook?: boolean };

const alive = (r: Running | null | undefined): r is Running => !!r && r.child.exitCode === null && r.child.signalCode === null;
const listening = (port: number) => new Promise<boolean>((resolve) => {
  const s = net.connect({ host: "127.0.0.1", port });
  const done = (v: boolean) => { s.destroy(); resolve(v); };
  s.setTimeout(700, () => done(false)); s.once("connect", () => done(true)); s.once("error", () => done(false));
});
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

function kill(r: Running) {
  try { if (r.child.pid) process.kill(-r.child.pid, "SIGTERM"); } catch { try { r.child.kill("SIGTERM"); } catch { /* already gone */ } }
}

/** The demo page that is up right now, if any. */
export function demoServing(): Serving | null {
  const r = store.__demoServing;
  if (!alive(r)) { store.__demoServing = null; return null; }
  return { folder: r.folder, title: r.title, port: r.port, open: r.open, since: r.since };
}

export async function stopServing(): Promise<void> {
  const r = store.__demoServing;
  store.__demoServing = null;
  if (!alive(r)) return;
  kill(r);
  for (let i = 0; i < 20 && alive(r); i++) await wait(150);
}

/** Starts a recipe's local page and waits until it answers. Only one demo page is up at a time: starting one stops the last. */
export async function startServing(recipe: Recipe): Promise<{ serving?: Serving; error?: string; output: string }> {
  const s = recipe.serve;
  if (!s) return { output: "" };
  await stopServing();
  if (await listening(s.port)) return { error: `Something is already using port ${s.port}, perhaps this demo left running from a Terminal window. Stop that one first.`, output: "" };
  const p = program(s.command);
  if (p.error) return { error: p.error, output: said(s.command) };
  const cwd = s.cwd === "demo" ? path.join(ROOT, "demos", recipe.folder) : ROOT;
  let child: ChildProcess;
  try {
    child = spawn(p.file, p.args, { cwd, env: demoEnv(s.env), detached: true, stdio: ["ignore", "pipe", "pipe"] });
  } catch (err) {
    return { error: `It could not be started: ${err instanceof Error ? err.message : String(err)}`, output: said(s.command) };
  }
  const r: Running = { folder: recipe.folder, title: recipe.title, port: s.port, open: s.open, since: new Date().toISOString(), child, log: "" };
  const take = (b: Buffer) => { r.log = (r.log + b.toString("utf8")).slice(-8000); };
  child.stdout?.on("data", take); child.stderr?.on("data", take);
  let failed = "";
  child.once("error", (err) => { failed = (err as NodeJS.ErrnoException).code === "ENOENT" ? `${s.command[0]} was not found on this computer.` : err.message; });
  store.__demoServing = r;
  if (!store.__demoExitHook) {   // never leave a demo page running after the CRM itself stops
    store.__demoExitHook = true;
    process.once("exit", () => { const last = store.__demoServing; if (alive(last)) kill(last); });
  }
  for (let i = 0; i < START_SECONDS * 4; i++) {
    if (failed || !alive(r)) break;
    if (await listening(s.port)) return { serving: demoServing() ?? undefined, output: tidyOutput(`${said(s.command)}\n${r.log}`) };
    await wait(250);
  }
  const output = tidyOutput(`${said(s.command)}\n${r.log}`);
  if (alive(r)) { await stopServing(); return { error: `It did not answer on port ${s.port} within ${START_SECONDS} seconds, so it was stopped.`, output }; }
  store.__demoServing = null;
  return { error: failed || "It stopped straight away. What it printed is below.", output };
}
