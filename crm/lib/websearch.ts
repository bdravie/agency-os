import { normaliseSocial } from "./contact";
import { normaliseDomain } from "./csv";
import { normaliseMethod } from "./contactMethods.ts";

// Optional web search (Brave Search API). Uses search credits, so it only runs when you click, within a daily cap.
export type Hit = { url: string; title: string; description?: string };

export async function braveSearch(q: string): Promise<Hit[]> {
  const key = process.env.SEARCH_API_KEY;
  if (!key) throw new Error("SEARCH_API_KEY is not set");
  const base = (process.env.SEARCH_API_BASE?.trim() || "https://api.search.brave.com").replace(/\/$/, "");   // the override is only for testing against a stand-in server
  const res = await fetch(`${base}/res/v1/web/search?q=${encodeURIComponent(q)}&count=10&country=gb`, {
    headers: { accept: "application/json", "x-subscription-token": key }, signal: AbortSignal.timeout(15000),
  });
  if (res.status === 401 || res.status === 403) throw new Error("Brave rejected the key (it may be wrong, expired or for a different plan). Check SEARCH_API_KEY");
  if (res.status === 422) throw new Error("Brave refused the request (check the key's plan allows web search)");
  if (res.status === 429) throw new Error("Brave says you're out of credits or searching too fast. Wait a minute and try again");
  if (!res.ok) throw new Error(`The search service answered ${res.status}`);
  const data = (await res.json()) as { web?: { results?: { url: string; title?: string; description?: string }[] } };
  return (data.web?.results ?? []).map((r) => ({ url: r.url, title: r.title ?? "", description: r.description }));
}

const DIRECTORIES = ["companieshouse", "company-information.service.gov.uk", "endole", "yell.com", "trustpilot", "clutch.co", "glassdoor", "indeed", "crunchbase", "dnb.com", "check-a-company",
  "opencorporates", "linkedin.com", "facebook.com", "instagram.com", "twitter.com", "x.com", "youtube.com", "tiktok.com", "wikipedia", "gov.uk", "companycheck", "northdata", "bizdb", "uk-companies", "companieslist"];

/** Pick company-level social pages and likely websites out of search results. Suggestions only: you check them and save. */
export function pickFromResults(hits: Hit[], name: string) {
  const out = { linkedin: null as string | null, instagram: null as string | null, facebook: null as string | null, tiktok: null as string | null, websites: [] as string[] };
  const key = name.toLowerCase().replace(/\b(limited|ltd\.?|llp|plc)\b/g, "").replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w.length > 2);
  const relevant = (h: Hit) => key.some((w) => `${h.title} ${h.url}`.toLowerCase().includes(w));
  for (const h of hits) {
    if (!relevant(h)) continue;
    for (const kind of ["linkedin", "instagram", "facebook"] as const) {
      if (out[kind]) continue;
      const r = normaliseSocial(kind, h.url);
      if (r.value) out[kind] = r.value;
    }
    if (!out.tiktok) { const t = /tiktok\.com/i.test(h.url) ? normaliseMethod("tiktok", h.url) : null; if (t?.value) out.tiktok = t.value; }
    const d = normaliseDomain(h.url);
    if (d && !DIRECTORIES.some((x) => d.includes(x)) && !out.websites.includes(d) && out.websites.length < 3) out.websites.push(d);
  }
  return out;
}
