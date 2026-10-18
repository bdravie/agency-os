import { query } from "./db";
import { logActivity } from "./activity";
import { searchByName } from "./companiesHouse";
import { extractFromText, normaliseWebsite } from "./contact";
import { checkSite, fetchPage, guessWebsite, verifyPage } from "./sitecheck";
import { braveSearch, pickFromResults } from "./websearch";
import { creditUsage } from "./usage";
import { searchLinks, rankCandidates, trust, type FoundLink, type LinkKind, type Ranked } from "./findRank";
import { safeDomain } from "./websites";
import { postcodeDistrict } from "./apifyMath";

// "Find one company": type a name and get its closest website and social pages, checked against Companies House. Free by default; the web search is opt-in and uses your search credits.
// Nothing is saved here. Company pages only: personal profiles are never kept.
export type WebHit = { title: string; host: string; snippet: string };
export type Found = {
  name: string; place: string; ch: { ranked: Ranked[]; best: Ranked | null; error: string | null }; links: FoundLink[]; emails: string[]; contactUrl: string | null; pagesRead: number;
  hits: WebHit[]; webRan: boolean; existing: { id: number; name: string } | null; searchLinks: { label: string; href: string }[]; notes: string[];
  signals: Record<string, boolean> | null;
  web: { ran: boolean; results: number; matched: string[]; query: string | null };
};

const SOCIAL_OR_SEARCH = /(^|\.)(linkedin|facebook|fb|instagram|twitter|x|youtube|tiktok|google|bing|yell|companieshouse|company-information\.service\.gov)\./i;

export async function findCompanyOnline(i: { name: string; place: string; pasted: string; web: boolean; knownNumber?: string | null }): Promise<Found> {
  const { name, place } = i;
  const notes: string[] = [];
  const links: FoundLink[] = [];
  const add = (kind: LinkKind, value: string | null | undefined, t: { confidence: FoundLink["confidence"]; how: string }) => { if (value && !links.some((l) => l.kind === kind)) links.push({ kind, value, ...t }); };

  // 1. Companies House (free): who is this legally?
  let ranked: Ranked[] = [], best: Ranked | null = null, chError: string | null = null;
  if (i.knownNumber) { /* the company already has a number: no need to search the register, and it is the proof a website must show */ }
  else if (!process.env.COMPANIES_HOUSE_API_KEY?.trim()) chError = "The server can't see COMPANIES_HOUSE_API_KEY, so the company couldn't be checked on the register.";
  else { try { ({ ranked, best } = rankCandidates(name, place, await searchByName(name))); } catch (e) { chError = e instanceof Error ? e.message : "Companies House couldn't be reached."; } }

  // 2. Anything you pasted: company pages and websites are sorted automatically (personal profiles are refused).
  const pasted = extractFromText(i.pasted);
  const given = trust.given();
  add("linkedin", pasted.linkedin, given); add("instagram", pasted.instagram, given); add("facebook", pasted.facebook, given);
  const pastedSite = pasted.websites.map((w) => normaliseWebsite(w).value).find((d): d is string => !!d && !SOCIAL_OR_SEARCH.test(`${d}.`) && safeDomain(d));
  if (pastedSite) add("website", pastedSite, given);

  // 3. Web search (opt-in, uses your search credits): the closest website and social pages.
  let hits: WebHit[] = [], webRan = false, webResults = 0, webQuery: string | null = null;
  let picks: ReturnType<typeof pickFromResults> | null = null;
  if (i.web) {
    const usage = await creditUsage();
    if (!usage.search.enabled) notes.push("The web search wasn't run: SEARCH_API_KEY isn't set.");
    else if (usage.search.used >= usage.search.cap) notes.push(`The web search wasn't run: today's cap of ${usage.search.cap} searches is used up.`);
    else {
      try {
        const area = postcodeDistrict(place) ?? place;   // the postcode area (LS27), not the full postcode: a full postcode narrows the results too far
        webQuery = `"${name}"${area ? ` ${area}` : ""} UK`;
        const raw = await braveSearch(webQuery);
        webRan = true; webResults = raw.length; picks = pickFromResults(raw, name);
        await logActivity("search_lookup", { channel: "search", body: `Find one company: ${name}` });
        hits = raw.slice(0, 6).map((h) => { let host = ""; try { host = new URL(h.url).hostname.replace(/^www\./, ""); } catch { /* skip */ } return { title: h.title.slice(0, 120), host, snippet: (h.description ?? "").replace(/<[^>]+>/g, "").slice(0, 200) }; }).filter((h) => h.host);
      } catch (e) { notes.push(`The web search failed: ${(e instanceof Error ? e.message : "unknown error").replace(/\.$/, "")}.`); }
    }
  }

  // 4. A website: the one you gave, else the closest guess from the name (a guess only counts if the page shows the company number or full name), else the best search result.
  const chNumber = best?.candidate.number ?? i.knownNumber ?? null;
  if (!links.some((l) => l.kind === "website")) {
    const guess = await guessWebsite({ name, company_number: chNumber }).catch(() => null);
    if (guess) add("website", guess.domain, guess.verified === "company number" ? trust.verifiedByNumber() : trust.verifiedByName());
  }
  if (!links.some((l) => l.kind === "website") && picks?.websites.length) {
    for (const d of picks.websites) {
      const html = safeDomain(d) ? await fetchPage(d) : null;
      const v = html ? verifyPage(html, { name, company_number: chNumber }) : null;
      if (v) { add("website", d, trust.fromSearch(v)); break; }
    }
    if (!links.some((l) => l.kind === "website")) add("website", picks.websites[0], trust.fromSearch(null));
  }
  if (!links.some((l) => l.kind === "website")) notes.push("No website found by guessing from the name. Paste it above, or use the search links below.");

  // 5. Read the website (free): social pages it links to, and generic emails.
  let emails: string[] = [], contactUrl: string | null = null, pagesRead = 0, signals: Record<string, boolean> | null = null;
  const site = links.find((l) => l.kind === "website");
  if (site) {
    const f = await checkSite(site.value).catch(() => null);
    if (f) {
      pagesRead = f.pages; emails = f.emails.slice(0, 3); contactUrl = f.contact_url; signals = f.signals;
      add("linkedin", f.linkedin, trust.linkedFromSite()); add("instagram", f.instagram, trust.linkedFromSite()); add("facebook", f.facebook, trust.linkedFromSite());
    } else notes.push("Their website couldn't be read (it may block automated readers).");
  }
  if (picks) { add("linkedin", picks.linkedin, trust.fromSearch(null)); add("instagram", picks.instagram, trust.fromSearch(null)); add("facebook", picks.facebook, trust.fromSearch(null)); }
  if (!links.some((l) => l.kind === "linkedin" || l.kind === "instagram" || l.kind === "facebook")) notes.push("No social pages found yet. Social platforms block automated reading, so use the search links below and paste what you find.");

  // 6. Is it already in the CRM?
  const dom = links.find((l) => l.kind === "website")?.value ?? null;
  const [existing] = await query<{ id: number; name: string }>(
    `SELECT id, name FROM companies WHERE ($1::text IS NOT NULL AND company_number = $1) OR ($2::text IS NOT NULL AND lower(domain) = $2) OR lower(name) = lower($3) ORDER BY id LIMIT 1`, [chNumber, dom, name]);

  return { name, place, ch: { ranked, best, error: chError }, links, emails, contactUrl, pagesRead, hits, webRan, existing: existing ? { id: Number(existing.id), name: existing.name } : null, searchLinks: searchLinks(name, place), notes, signals,
    web: { ran: webRan, results: webResults, matched: picks ? (["website", "linkedin", "instagram", "facebook"] as const).filter((k) => (k === "website" ? picks!.websites.length > 0 : !!picks![k])) : [], query: webQuery } };
}
