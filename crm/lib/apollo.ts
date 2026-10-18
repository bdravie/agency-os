// Thin client for the Apollo REST API. The key only ever travels in a header from the server, and never appears in an error message.
// APOLLO_API_BASE exists only so the code can be tested against a stand-in server.
const base = () => (process.env.APOLLO_API_BASE?.trim() || "https://api.apollo.io").replace(/\/$/, "");
export const apolloKey = () => process.env.APOLLO_API_KEY?.trim() || "";

export class ApolloError extends Error {
  status: number;
  constructor(message: string, status = 0) { super(message); this.status = status; }
}

/** Apollo's own explanation of a refused request, cut short and without the key. */
export function describeApolloError(status: number, body: unknown, key = ""): string {
  const b = body as any;
  let text = [typeof b?.error === "string" ? b.error : b?.error?.message, typeof b?.message === "string" ? b.message : ""].filter(Boolean).join(": ");
  if (key.length > 6) text = text.split(key).join("[hidden]");
  text = text.replace(/\s+/g, " ").trim().slice(0, 240);
  if (status === 401) return "Apollo rejected the key. Check APOLLO_API_KEY.";
  if (status === 403 && /plan/i.test(text)) return `Apollo's plan doesn't include this: ${text}. The key is fine; the search needs a paid Apollo plan.`;
  if (status === 403) return `Apollo says this key can't use that endpoint. Create the key with People API Search and People Enrichment switched on, and without master-key access${text ? ` (${text})` : ""}.`;
  if (status === 422) return `Apollo refused the request${text ? `: ${text}` : ""}.`;
  if (status === 429) return "Apollo is rate-limiting you or you're out of credits. Wait a few minutes, or check your plan.";
  return text ? `Apollo answered ${status}: ${text}` : `Apollo answered ${status}.`;
}

async function call(path: string, init: { query?: Record<string, string>; body?: unknown } = {}): Promise<any> {
  const key = apolloKey();
  if (!key) throw new ApolloError("The server can't see APOLLO_API_KEY. Add it to .env (or as a Codespaces secret) and restart the CRM.");
  const qs = init.query ? `?${new URLSearchParams(init.query)}` : "";
  let res: Response;
  try {
    res = await fetch(`${base()}${path}${qs}`, { method: "POST", headers: { "x-api-key": key, "content-type": "application/json", accept: "application/json", "cache-control": "no-cache" }, body: JSON.stringify(init.body ?? {}), cache: "no-store", signal: AbortSignal.timeout(30_000) });
  } catch { throw new ApolloError("Couldn't reach Apollo. Check your connection and try again."); }
  if (!res.ok) throw new ApolloError(describeApolloError(res.status, await res.json().catch(() => null), key), res.status);
  return res.json();
}

/** People at a company with the roles you care about. Free (0 credits). Returns no emails: Apollo only reveals those through enrichment. */
export async function searchPeople(o: { domain: string; titles: string[]; seniorities: string[]; includeSimilar: boolean; perPage: number }): Promise<unknown> {
  return call("/api/v1/mixed_people/api_search", { body: { q_organization_domains_list: [o.domain], person_titles: o.titles, person_seniorities: o.seniorities, include_similar_titles: o.includeSimilar, page: 1, per_page: o.perPage } });
}

/** Reveals one person's work email (1 credit if an email is found, none if not). Never asks for a personal email or a phone number. */
export async function revealPerson(id: string): Promise<any> {
  const r = await call("/api/v1/people/match", { query: { id, reveal_personal_emails: "false", reveal_phone_number: "false" } });
  return r?.person ?? null;
}
