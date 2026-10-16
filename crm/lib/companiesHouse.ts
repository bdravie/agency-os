// Free Companies House API: look a company up by number or name to get its type and status.
// Public company data only. Key from COMPANIES_HOUSE_API_KEY. Limit is 600 requests per 5 minutes; callers pace themselves.
const API = "https://api.company-information.service.gov.uk";

export type ChProfile = { number: string; name: string; type: string; status: string; statusDetail: string | null; address: string | null };
export type ChCandidate = { number: string; name: string; type: string | null; status: string | null; address: string | null };

/** "1234567" -> "01234567", "sc 123456" -> "SC123456". Returns null if it can't be a company number. */
export function normaliseNumber(input: string | null | undefined): string | null {
  const t = (input ?? "").replace(/\s+/g, "").toUpperCase();
  if (/^\d{1,8}$/.test(t)) return t.padStart(8, "0");
  return /^[A-Z]{2}\d{6}$/.test(t) ? t : null;
}

/** Names compared without case, punctuation, "&" vs "and", or a trailing Ltd/Limited/LLP/PLC. */
export const normaliseName = (n: string) =>
  n.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim().replace(/\s(limited|ltd|llp|plc)$/, "").trim();

/** Only an exact name match is trusted automatically (active ones first). Anything else is left for you to choose. */
export function pickExact(name: string, candidates: ChCandidate[]): ChCandidate | null {
  const want = normaliseName(name);
  const exact = candidates.filter((c) => normaliseName(c.name) === want);
  const active = exact.filter((c) => c.status === "active");
  if (active.length === 1) return active[0];
  if (active.length === 0 && exact.length === 1) return exact[0];
  return null;   // none, or several: ambiguous
}

async function get(path: string): Promise<{ status: number; json: any }> {
  const key = process.env.COMPANIES_HOUSE_API_KEY?.trim();
  if (!key) throw new Error("COMPANIES_HOUSE_API_KEY is not set. Add it to .env (and to your Codespaces secrets).");
  const res = await fetch(`${API}${path}`, { headers: { authorization: `Basic ${Buffer.from(`${key}:`).toString("base64")}` }, cache: "no-store", signal: AbortSignal.timeout(20_000) });
  if (res.status === 401) throw new Error("Companies House rejected the API key. Check COMPANIES_HOUSE_API_KEY.");
  if (res.status === 429) throw new Error("Companies House rate limit reached (600 requests per 5 minutes). Wait a few minutes and try again.");
  if (res.status >= 500) throw new Error("Companies House is not responding. Try again shortly.");
  return { status: res.status, json: res.status === 200 ? await res.json() : null };
}

const addr = (a: any) => (a ? [a.address_line_1, a.locality, a.postal_code].filter(Boolean).join(", ") || null : null);

export async function fetchProfile(number: string): Promise<ChProfile | null> {
  const { status, json } = await get(`/company/${encodeURIComponent(number)}`);
  if (status === 404 || !json) return null;
  return { number: json.company_number, name: json.company_name, type: String(json.type ?? ""), status: String(json.company_status ?? ""), statusDetail: json.company_status_detail ?? null, address: addr(json.registered_office_address) };
}

export async function searchByName(name: string): Promise<ChCandidate[]> {
  const { json } = await get(`/search/companies?q=${encodeURIComponent(name)}&items_per_page=8`);
  return ((json?.items ?? []) as any[]).map((i) => ({ number: i.company_number, name: i.title, type: i.company_type ?? null, status: i.company_status ?? null, address: i.address_snippet ?? null }));
}
