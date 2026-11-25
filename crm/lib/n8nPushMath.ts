// Pure rules for Send to my n8n (no network, no files), so they can be tested on their own.
// A demo's workflow file is turned into exactly what n8n's public API accepts when creating a workflow (checked against n8n's docs,
// 25 Nov 2026: POST /api/v1/workflows needs name, nodes, connections and settings, and refuses any field it does not list).
// Nothing here switches a workflow on: the CRM only ever adds it, and the owner turns it on in n8n.

export type N8nTarget = { base: string; label: string; local: boolean };

/**
 * Where the owner's n8n is, from N8N_API_URL (their own local n8n when it is not set). A local address may be plain http;
 * anything else (n8n Cloud, a server) must be https, so the API key is never sent in the clear.
 */
export function n8nTarget(raw: string | null | undefined): { target?: N8nTarget; error?: string } {
  const text = (raw ?? "").trim() || "http://localhost:5678";
  let u: URL;
  try { u = new URL(text); } catch { return { error: "N8N_API_URL is not a web address. It should look like http://localhost:5678 or https://yourname.app.n8n.cloud." }; }
  const local = u.hostname === "localhost" || u.hostname === "127.0.0.1";
  if (u.protocol !== "https:" && !(local && u.protocol === "http:")) return { error: "N8N_API_URL must start with https:// (only your own computer's n8n, localhost, may use http://)." };
  if (u.username || u.password) return { error: "Take the name and password out of N8N_API_URL. The API key goes in N8N_API_KEY." };
  const path = u.pathname.replace(/\/api\/v1\/?$/, "").replace(/\/+$/, "");
  return { target: { base: `${u.origin}${path}`, label: u.host, local } };
}

/** What n8n's API accepts on a node and in a workflow's settings. Anything else in a file is left out, because n8n refuses unknown fields. */
export const NODE_KEYS = ["id", "name", "webhookId", "disabled", "notesInFlow", "notes", "type", "typeVersion", "executeOnce", "alwaysOutputData", "retryOnFail", "maxTries", "waitBetweenTries", "onError", "position", "parameters", "credentials"] as const;
export const SETTINGS_KEYS = ["saveExecutionProgress", "saveManualExecutions", "saveDataErrorExecution", "saveDataSuccessExecution", "executionTimeout", "errorWorkflow", "timezone", "executionOrder", "callerPolicy", "callerIds"] as const;

export type CreateBody = { name: string; nodes: Record<string, unknown>[]; connections: Record<string, unknown>; settings: Record<string, unknown> };
export type Prepared = { body: CreateBody; oldId: string | null; errorWorkflow: string | null };

const pick = (o: Record<string, unknown>, keys: readonly string[]) => Object.fromEntries(keys.filter((k) => o[k] !== undefined && o[k] !== null).map((k) => [k, o[k]]));
const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/**
 * A workflow file as the body for n8n's "create a workflow". Read-only fields (id, active, versionId, meta, tags, pinned test data)
 * are dropped, so it always arrives switched off. With `dropCredentials` (a public template) the steps' credential links are left off too. The file's own id and the id of its error workflow are handed back separately:
 * n8n gives a new workflow a new id, so a link between two workflows has to be re-pointed (see `orderForImport`).
 */
export function toCreateBody(json: unknown, o: { dropCredentials?: boolean } = {}): { value?: Prepared; error?: string } {
  if (!isObject(json) || !Array.isArray(json.nodes) || !isObject(json.connections)) return { error: "is not an n8n workflow file (it has no nodes and connections)" };
  const name = typeof json.name === "string" ? json.name.trim().slice(0, 128) : "";
  if (!name) return { error: "has no name" };
  if (!json.nodes.length || json.nodes.length > 300 || json.nodes.some((n) => !isObject(n) || typeof n.name !== "string" || typeof n.type !== "string")) return { error: "has a step n8n could not read" };
  const settings = pick(isObject(json.settings) ? json.settings : {}, SETTINGS_KEYS);
  const errorWorkflow = typeof settings.errorWorkflow === "string" && settings.errorWorkflow ? settings.errorWorkflow : null;
  delete settings.errorWorkflow;
  if (!settings.executionOrder) settings.executionOrder = "v1";
  // A public template's steps name its maker's own credentials, which mean nothing in another n8n: they are left off, and the owner connects theirs.
  const keys = o.dropCredentials ? NODE_KEYS.filter((k) => k !== "credentials") : NODE_KEYS;
  return { value: { body: { name, nodes: json.nodes.map((n) => pick(n as Record<string, unknown>, keys)), connections: json.connections, settings }, oldId: typeof json.id === "string" && json.id ? json.id : null, errorWorkflow } };
}

/** The order to add a demo's workflows in: one that another names as its error workflow goes first, so the link can be re-pointed at its new id. */
export function orderForImport<T extends Prepared>(items: T[]): T[] {
  const needed = new Set(items.map((i) => i.errorWorkflow).filter(Boolean));
  return [...items.filter((i) => i.oldId && needed.has(i.oldId)), ...items.filter((i) => !(i.oldId && needed.has(i.oldId)))];
}

/** A plain reason when n8n did not take a request. */
export function n8nProblem(status: number, body: string, label: string): string {
  if (status === 401 || status === 403) return `n8n at ${label} refused the API key. In n8n, open Settings > n8n API, create a new key, put it in the env file as N8N_API_KEY and restart the CRM.`;
  if (status === 404) return `n8n at ${label} has no API at that address. Check N8N_API_URL (it should be the address you open n8n on).`;
  let said = "";
  try { const j = JSON.parse(body); said = typeof j?.message === "string" ? j.message : ""; } catch { /* not JSON */ }
  return `n8n at ${label} did not accept it (${status})${said ? `: ${said.slice(0, 200)}` : ""}.`;
}

/** A plain reason when n8n could not be reached at all. */
export const n8nUnreachable = (t: N8nTarget) =>
  t.local ? `n8n did not answer at ${t.label}. Start it in Terminal with: npx n8n. Then try again.` : `n8n did not answer at ${t.label}. Check the address in N8N_API_URL and that the instance is running.`;

export type PushResult = { name: string; status: "added" | "already" | "failed"; url: string | null; note: string };
/** One line saying how a send went. */
export function pushSummary(results: PushResult[], label: string): string {
  const n = (s: PushResult["status"]) => results.filter((r) => r.status === s).length;
  const parts = [n("added") && `${n("added")} added`, n("already") && `${n("already")} already there`, n("failed") && `${n("failed")} not added`].filter(Boolean);
  return `${parts.join(", ")} in n8n at ${label}.`;
}
