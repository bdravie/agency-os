// Thin client for the Apify REST API. The token only ever travels in an Authorization header from the server, and never appears in an error message.
// The base address can be changed with APIFY_API_BASE (used to test against a stand-in server).
export const ACTOR = "compass~crawler-google-places";   // "Google Maps Scraper"
const base = () => (process.env.APIFY_API_BASE?.trim() || "https://api.apify.com").replace(/\/$/, "");
export const apifyToken = () => process.env.APIFY_TOKEN?.trim() || "";

export class ApifyError extends Error {
  status: number;
  constructor(message: string, status = 0) { super(message); this.status = status; }
}

/** Apify's own explanation of a rejected request ({"error": {"type", "message"}}), cut short and without the token. */
export function describeApifyError(status: number, body: unknown, token = ""): string {
  const e = (body as any)?.error;
  let text = [e?.type, e?.message].filter((x) => typeof x === "string" && x).join(": ");
  if (token.length > 6) text = text.split(token).join("[hidden]");
  text = text.replace(/\s+/g, " ").trim().slice(0, 300);
  return text ? `Apify rejected the request (${status}): ${text}` : `Apify answered ${status}.`;
}

async function call(path: string, init: { method?: string; body?: unknown; bare?: boolean } = {}): Promise<any> {
  const token = apifyToken();
  if (!token) throw new ApifyError("The server can't see APIFY_TOKEN. Add it to the .env file in the top-level folder (or as a Codespaces secret) and restart the CRM.");
  let res: Response;
  try {
    res = await fetch(`${base()}${path}`, {
      method: init.method ?? "GET", headers: { authorization: `Bearer ${token}`, ...(init.body ? { "content-type": "application/json" } : {}) },
      body: init.body ? JSON.stringify(init.body) : undefined, cache: "no-store", signal: AbortSignal.timeout(30_000),
    });
  } catch { throw new ApifyError("Couldn't reach Apify. Check your connection and try again."); }
  if (res.status === 401) throw new ApifyError("Apify rejected the token. Check APIFY_TOKEN (console.apify.com → Settings → Integrations).", 401);
  if (res.status === 402 || res.status === 403) throw new ApifyError("Apify says this account has hit its limit or isn't allowed to run that. On the free plan, credits reset at the start of your next billing cycle.", res.status);
  if (res.status === 429) throw new ApifyError("Apify is rate-limiting requests. Wait a minute and try again.", 429);
  if (!res.ok) throw new ApifyError(describeApifyError(res.status, await res.json().catch(() => null), token), res.status);
  const json = await res.json();
  return init.bare ? json : json?.data ?? null;   // most endpoints wrap the answer in {data}; the dataset items endpoint returns the bare list
}

export type ApifyRun = { id: string; status: string; defaultDatasetId?: string; usageTotalUsd?: number; statusMessage?: string };

export async function startRun(input: Record<string, unknown>, o: { maxChargeUsd: number; timeoutSecs: number }): Promise<ApifyRun> {
  return call(`/v2/acts/${ACTOR}/runs?maxTotalChargeUsd=${o.maxChargeUsd}&timeout=${o.timeoutSecs}`, { method: "POST", body: input });
}
export const getRun = (id: string): Promise<ApifyRun> => call(`/v2/actor-runs/${encodeURIComponent(id)}`);
export const abortRun = (id: string) => call(`/v2/actor-runs/${encodeURIComponent(id)}/abort`, { method: "POST" });
export async function getItems(datasetId: string, limit: number): Promise<unknown[]> {
  const items = await call(`/v2/datasets/${encodeURIComponent(datasetId)}/items?format=json&clean=true&limit=${Math.min(Math.max(limit, 1), 300)}`, { bare: true });
  return Array.isArray(items) ? items : [];
}
export type Limits = { maxMonthlyUsd: number; usedUsd: number; cycleEnd: string | null };
/** The account's own monthly allowance and usage, straight from Apify. */
export async function getLimits(): Promise<Limits | null> {
  try {
    const d = await call("/v2/users/me/limits");
    const max = Number(d?.limits?.maxMonthlyUsageUsd), used = Number(d?.current?.monthlyUsageUsd);
    return Number.isFinite(max) && Number.isFinite(used) ? { maxMonthlyUsd: max, usedUsd: used, cycleEnd: d?.monthlyUsageCycle?.endAt ?? null } : null;
  } catch { return null; }
}
