import { query } from "./db";
import { logActivity } from "./activity";
import { robotsAllows, safeDomain } from "./websites";
import { analyseHtml } from "./sitecheck";
import { fetchPublicHtml } from "./safeFetch";
import { braveSearch } from "./websearch";
import { creditUsage } from "./usage";
import { maskContacts } from "./transcript";
import { analysePage, deriveFindings, mergePages, pickLinks, type Finding, type PageFacts, type PageRead, type SiteFacts, type SiteSignals } from "./researchAnalysis";

// Free research on one company: reads up to four pages of its OWN public website (respecting robots.txt, one second apart) and works out
// the gaps. Optionally adds a web search (uses your search quota). Never contacts the company and never reads social platforms.
const UA = "AgencyOSBot";
const MAX_PAGES = 4;

export type WebHit = { title: string; host: string; snippet: string };
export type Research = { id: number; company_id: number; domain: string | null; site: SiteFacts | null; findings: Finding[]; web: WebHit[] | null; limits: string[]; created_at: string };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const mergeSignals = (a: SiteSignals, b: SiteSignals): SiteSignals => Object.fromEntries([...new Set([...Object.keys(a), ...Object.keys(b)])].map((k) => [k, !!((a as any)[k] || (b as any)[k])]));

async function readSite(domain: string): Promise<{ site: SiteFacts | null; limits: string[]; error: string | null }> {
  const limits: string[] = [], pagesRead: PageRead[] = [], pages: { path: string; facts: PageFacts }[] = [];
  let signals: SiteSignals = {};
  if (!safeDomain(domain)) return { site: null, limits, error: "The saved website address isn't a normal public address" };
  const take = async (path: string, host: string): Promise<string | null> => {
    if (!(await robotsAllows(host, path))) { pagesRead.push({ path, ok: false, note: "blocked by robots.txt, or robots.txt could not be fetched" }); limits.push(`${path === "/" ? "The home page" : path} was not read: the site's robots.txt disallows automated tools, or could not be fetched.`); return null; }
    const r = await fetchPublicHtml(`https://${host}${path}`, { userAgent: UA, timeoutMs: 9000 });
    if (!r.ok || !r.html) { pagesRead.push({ path, ok: false, note: r.reason }); if (path === "/") limits.push(`Couldn't load the home page: ${r.reason ?? "unknown error"}.`); return null; }
    pagesRead.push({ path, ok: true });
    pages.push({ path, facts: analysePage(r.html) });
    const g = analyseHtml(r.html, host);
    signals = mergeSignals(signals, g.signals);
    return r.html;
  };
  let host = domain;
  let home = await take("/", host);
  if (!home && !pagesRead.some((p) => p.note?.includes("robots.txt"))) { host = domain.startsWith("www.") ? domain.slice(4) : `www.${domain}`; pagesRead.length = 0; limits.length = 0; home = await take("/", host); }
  if (!home) return { site: null, limits, error: limits[0]?.replace(/\.$/, "") ?? pagesRead[0]?.note ?? "The site could not be loaded" };
  for (const path of pickLinks(home, host, MAX_PAGES - 1)) { await sleep(1000); await take(path, host); }
  limits.push("Social media pages were not read (the platforms block automated reading), so social is judged only by whether the website links to it.");
  limits.push("Google reviews and ratings were not checked.");
  return { site: mergePages(pages, signals, pagesRead), limits, error: null };
}

async function searchWeb(c: { id: number; name: string; domain: string | null; postcode: string | null }, limits: string[]): Promise<WebHit[] | null> {
  const usage = await creditUsage();
  if (!usage.search.enabled) { limits.push("The web search was not run: SEARCH_API_KEY is not set."); return null; }
  const room = usage.search.cap - usage.search.used;
  if (room < 2) { limits.push(`The web search was not run: today's cap of ${usage.search.cap} searches is nearly used.`); return null; }
  const town = (c.postcode ?? "").split(" ")[0];
  const hits: WebHit[] = [];
  const key = c.name.toLowerCase().replace(/\b(limited|ltd\.?|llp|plc)\b/g, "").replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w.length > 2);
  for (const q of [`"${c.name}" reviews`, `"${c.name}" ${town}`.trim()]) {
    try {
      for (const h of await braveSearch(q)) {
        let host = ""; try { host = new URL(h.url).hostname.replace(/^www\./, ""); } catch { continue; }
        if (host === (c.domain ?? "").replace(/^www\./, "") || hits.some((x) => x.host === host) || /companieshouse|company-information\.service/.test(host)) continue;
        if (!key.some((w) => `${h.title} ${h.url}`.toLowerCase().includes(w))) continue;
        hits.push({ title: maskContacts(h.title).text.slice(0, 120), host, snippet: maskContacts(h.description ?? "").text.slice(0, 220) });
      }
      await logActivity("search_lookup", { company_id: c.id, channel: "search", body: `Offer research: ${q}` });
    } catch (e) { limits.push(`The web search failed: ${e instanceof Error ? e.message : "unknown error"}.`); break; }
  }
  return hits.slice(0, 8);
}

function mapRow(r: any): Research {
  return { id: Number(r.id), company_id: Number(r.company_id), domain: r.domain, site: r.site, findings: r.findings, web: r.web, limits: r.limits, created_at: new Date(r.created_at).toISOString() };
}

export async function latestResearch(companyId: number): Promise<Research | null> {
  const [r] = await query<any>(`SELECT * FROM company_research WHERE company_id = $1 ORDER BY id DESC LIMIT 1`, [companyId]);
  return r ? mapRow(r) : null;
}

/** True if the company's record was edited after this research ran, e.g. a website or social link added since. The research is a snapshot, so it would still describe the old record. */
export async function companyChangedSince(companyId: number, r: Research): Promise<boolean> {
  const [c] = await query<{ changed: boolean }>(`SELECT updated_at > $2::timestamptz AS changed FROM companies WHERE id = $1`, [companyId, r.created_at]);
  return !!c?.changed;
}

export async function runResearch(companyId: number, opts: { web: boolean }): Promise<Research> {
  const [c] = await query<any>(`SELECT c.id, c.name, c.domain, c.postcode, c.linkedin_url, c.instagram_url, c.facebook_url, g.opted_out, g.suppressed FROM companies c JOIN lead_gate g ON g.company_id = c.id WHERE c.id = $1`, [companyId]);
  if (!c) throw new Error("Company not found.");
  if (c.opted_out || c.suppressed) throw new Error("This company has opted out or is on your suppression list, so no outreach research is done.");
  let site: SiteFacts | null = null, limits: string[] = [], error: string | null = null;
  if (c.domain) ({ site, limits, error } = await readSite(c.domain));
  else limits.push("There is no website saved for this company, so only the CRM's own details were used.");
  const web = opts.web ? await searchWeb(c, limits) : null;
  if (!opts.web) limits.push("The web search was not run (tick the box to include it).");
  const findings = deriveFindings(site, { hasDomain: !!c.domain, thisYear: new Date().getFullYear(), storedSocial: { facebook: !!c.facebook_url, instagram: !!c.instagram_url, linkedin: !!c.linkedin_url }, siteError: error });
  const [row] = await query<any>(`INSERT INTO company_research (company_id, domain, site, findings, web, limits) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [companyId, c.domain, site ? JSON.stringify(site) : null, JSON.stringify(findings), web ? JSON.stringify(web) : null, JSON.stringify(limits)]);
  await logActivity("company_researched", { company_id: companyId, body: `${findings.filter((f) => f.kind === "gap").length} possible gaps found${site ? ` across ${site.pagesRead.filter((p) => p.ok).length} page(s)` : " (no readable website)"}` });
  return mapRow(row);
}
