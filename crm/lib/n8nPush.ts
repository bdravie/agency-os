// Send to my n8n: adds a demo's workflow files to the owner's own n8n through n8n's public API, on their click.
// The address is N8N_API_URL (their local n8n at http://localhost:5678 when it is not set) and the key is N8N_API_KEY, made in n8n
// under Settings > n8n API. Only the workflow files a demo lists in config/demos.yaml are ever sent, only to that one address,
// a workflow already there by the same name is left alone, and nothing is ever switched on from here.
// Plain server module (no "use server"): the action that calls it checks you are logged in first.
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Recipe } from "./demoRunMath.ts";
import { n8nProblem, n8nTarget, n8nUnreachable, orderForImport, toCreateBody, type N8nTarget, type Prepared, type PushResult } from "./n8nPushMath.ts";

const ROOT = path.resolve(process.cwd(), "..");
const MAX_FILE = 1_500_000;

export type N8nStatus = { ready: boolean; label: string; local: boolean; problem: string | null };

/** Whether Send to my n8n can be used, and where it would send. Never returns the key. */
export function n8nStatus(): N8nStatus {
  const { target, error } = n8nTarget(process.env.N8N_API_URL);
  if (!target) return { ready: false, label: "", local: false, problem: error ?? "N8N_API_URL could not be read." };
  const key = process.env.N8N_API_KEY?.trim();
  return { ready: !!key, label: target.label, local: target.local, problem: key ? null : "No API key yet. In n8n, open Settings > n8n API and create a key, put it in the env file as N8N_API_KEY, then restart the CRM." };
}

async function call(t: N8nTarget, key: string, method: "GET" | "POST", route: string, body?: unknown): Promise<{ status: number; text: string }> {
  const res = await fetch(`${t.base}/api/v1${route}`, {
    method, redirect: "error", signal: AbortSignal.timeout(20_000),
    headers: { "X-N8N-API-KEY": key, accept: "application/json", ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, text: await res.text() };
}

/** The id of a workflow already in n8n with exactly this name, or null. */
async function existing(t: N8nTarget, key: string, name: string): Promise<{ id: string | null; problem?: string }> {
  const r = await call(t, key, "GET", `/workflows?limit=100&name=${encodeURIComponent(name)}`);
  if (r.status !== 200) return { id: null, problem: n8nProblem(r.status, r.text, t.label) };
  try {
    const hit = (JSON.parse(r.text)?.data ?? []).find((w: { name?: string }) => w?.name === name);
    return { id: hit?.id ? String(hit.id) : null };
  } catch { return { id: null, problem: `n8n at ${t.label} sent back something that could not be read.` }; }
}

type Ready = Prepared & { added: string };

/** Adds prepared workflows to the owner's n8n, one at a time. One that is already there by name is left as it is. */
async function pushAll(target: N8nTarget, key: string, ready: Ready[], results: PushResult[]): Promise<string | undefined> {
  const newId = new Map<string, string>();   // the file's own id -> the id n8n gave it, so an error workflow can be re-pointed
  const link = (id: string) => `${target.base}/workflow/${encodeURIComponent(id)}`;
  try {
    for (const w of orderForImport(ready)) {
      const name = w.body.name;
      const found = await existing(target, key, name);
      if (found.problem) { results.push({ name, status: "failed", url: null, note: found.problem }); break; }   // the same problem would meet every file
      if (found.id) {
        if (w.oldId) newId.set(w.oldId, found.id);
        results.push({ name, status: "already", url: link(found.id), note: "A workflow with this name is already in your n8n, so it was left as it is. Rename or delete that one to add it again." });
        continue;
      }
      const settings = { ...w.body.settings }, repoint = w.errorWorkflow ? newId.get(w.errorWorkflow) : undefined;
      if (repoint) settings.errorWorkflow = repoint;
      const r = await call(target, key, "POST", "/workflows", { ...w.body, settings });
      if (r.status !== 200 && r.status !== 201) { results.push({ name, status: "failed", url: null, note: n8nProblem(r.status, r.text, target.label) }); continue; }
      let id = "";
      try { id = String(JSON.parse(r.text)?.id ?? ""); } catch { /* answered without an id */ }
      if (id && w.oldId) newId.set(w.oldId, id);
      results.push({ name, status: "added", url: id ? link(id) : target.base, note: w.errorWorkflow && !repoint ? "Added, switched off. Its error workflow was not found, so set that by hand in the workflow's settings." : w.added });
    }
  } catch {
    return n8nUnreachable(target);
  }
  return undefined;
}

function ready(): { target?: N8nTarget; key?: string; label: string; error?: string } {
  const status = n8nStatus(), { target } = n8nTarget(process.env.N8N_API_URL), key = process.env.N8N_API_KEY?.trim();
  return target && key ? { target, key, label: target.label } : { label: status.label, error: status.problem ?? "n8n is not set up." };
}

/** Adds each of a demo's workflow files to the owner's n8n. */
export async function pushDemo(recipe: Recipe): Promise<{ results: PushResult[]; label: string; error?: string }> {
  const { target, key, label, error } = ready();
  if (!target || !key) return { results: [], label, error };
  if (!recipe.n8n.length) return { results: [], label, error: recipe.make.length ? "This demo is a Make.com blueprint, which n8n cannot take. Import it in Make instead." : "This demo has no n8n workflow file listed in config/demos.yaml." };
  const results: PushResult[] = [], list: Ready[] = [];
  for (const file of recipe.n8n) {
    const short = path.basename(file);
    try {
      const raw = await readFile(path.join(ROOT, file), "utf8");
      if (raw.length > MAX_FILE) { results.push({ name: short, status: "failed", url: null, note: "The file is too large to send." }); continue; }
      const made = toCreateBody(JSON.parse(raw));
      if (!made.value) { results.push({ name: short, status: "failed", url: null, note: `${short} ${made.error}.` }); continue; }
      list.push({ ...made.value, added: "Added, switched off. Connect its credentials in n8n, then turn it on there." });
    } catch (err) {
      results.push({ name: short, status: "failed", url: null, note: `${short} could not be read: ${err instanceof Error ? err.message : String(err)}` });
    }
  }
  return { results, label, error: await pushAll(target, key, list, results) };
}

/**
 * Adds one workflow file that did not come from the project folder (a free template from n8n's public library) to the owner's n8n.
 * Its steps arrive without credentials, since the ones a template names belong to whoever made it.
 */
export async function pushFile(file: unknown): Promise<{ results: PushResult[]; label: string; error?: string }> {
  const { target, key, label, error } = ready();
  if (!target || !key) return { results: [], label, error };
  const made = toCreateBody(file, { dropCredentials: true });
  if (!made.value) return { results: [], label, error: `That workflow ${made.error}.` };
  const results: PushResult[] = [];
  return { results, label, error: await pushAll(target, key, [{ ...made.value, added: "Added, switched off, with no credentials connected. Connect your own in n8n, then turn it on there." }], results) };
}
