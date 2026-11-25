// n8n's public template library (the same address n8n's own app reads its templates from). Only ever called from a click:
// a search is up to five small requests (three phrases, and two shorter ones if those find little), choosing a template is one. Replies pass through the allow-list in n8nTemplatesMath.ts,
// and a template's file is turned into an outline (workflowParse.ts) and then dropped. Set N8N_TEMPLATES=off to switch it off.
import { cleanHits, ROWS_PER_SEARCH, type TemplateHit } from "./n8nTemplatesMath.ts";
import { parseWorkflow, type ParsedWorkflow } from "./workflowParse.ts";

const BASE = "https://api.n8n.io/api/templates";
const TIMEOUT_MS = 12_000, MAX_BYTES = 3_000_000, CACHE_MS = 6 * 60 * 60 * 1000;

export const templatesOn = () => !/^(off|false|0|no)$/i.test(process.env.N8N_TEMPLATES?.trim() ?? "");
export const templateDailyCap = () => Number(process.env.N8N_TEMPLATE_DAILY_CAP ?? 150) || 150;

// Replies are kept for a few hours so the same search or template is not asked for twice. `fresh` says whether a request was really made.
const g = globalThis as unknown as { _n8nCache?: Map<string, { at: number; value: unknown }> };
const cache = (g._n8nCache ??= new Map());

async function get(pathAndQuery: string): Promise<{ json: any; fresh: boolean }> {
  const hit = cache.get(pathAndQuery);
  if (hit && Date.now() - hit.at < CACHE_MS) return { json: hit.value, fresh: false };
  const res = await fetch(`${BASE}${pathAndQuery}`, { headers: { accept: "application/json", "user-agent": "crm-template-lookup" }, signal: AbortSignal.timeout(TIMEOUT_MS), redirect: "error", cache: "no-store" });
  if (res.status === 404) throw new Error("n8n's library has no template with that number.");
  if (!res.ok) throw new Error(`n8n's template library answered ${res.status}.`);
  const body = await res.text();
  if (body.length > MAX_BYTES) throw new Error("That template is too large to read here.");
  const json = JSON.parse(body);
  if (cache.size > 200) cache.clear();
  cache.set(pathAndQuery, { at: Date.now(), value: json });
  return { json, fresh: true };
}

/** One search. Free templates only; nothing about who made them is kept. */
export async function searchTemplates(phrase: string): Promise<{ hits: TemplateHit[]; fresh: boolean }> {
  const { json, fresh } = await get(`/search?search=${encodeURIComponent(phrase)}&rows=${ROWS_PER_SEARCH}&page=1`);
  return { hits: cleanHits(json), fresh };
}

/**
 * One free template's own workflow file, for Send to my n8n: it is passed straight on to the owner's n8n and not kept here.
 * Nothing about who made the template is read. Counts as one request, like opening it.
 */
export async function fetchTemplateFile(id: number): Promise<{ file: Record<string, unknown>; fresh: boolean }> {
  const { json, fresh } = await get(`/workflows/${id}`);
  const t = json?.workflow;
  if (Number(t?.price) > 0 || t?.purchaseUrl) throw new Error("That is a paid template, so it can't be sent from here. Buy it on n8n and import it there.");
  if (!t?.workflow || typeof t.workflow !== "object") throw new Error("That template could not be read.");
  return { file: { ...t.workflow, name: typeof t?.name === "string" && t.name.trim() ? t.name : `n8n template ${id}` }, fresh };
}

/** One template, as an outline of its steps. The file itself is not kept. */
export async function fetchTemplate(id: number): Promise<{ name: string; workflow: ParsedWorkflow; fresh: boolean }> {
  const { json, fresh } = await get(`/workflows/${id}`);
  const t = json?.workflow;
  if (Number(t?.price) > 0 || t?.purchaseUrl) throw new Error("That is a paid template, so it can't be read here. Buy it on n8n, then paste its JSON.");
  const parsed = parseWorkflow({ name: typeof t?.name === "string" ? t.name : "", ...(t?.workflow ?? {}) });
  if (!parsed.workflow) throw new Error(parsed.error ?? "That template could not be read.");
  return { name: parsed.workflow.name || `n8n template ${id}`, workflow: parsed.workflow, fresh };
}
