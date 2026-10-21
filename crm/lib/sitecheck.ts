import { genericEmails, robotsAllows, safeDomain } from "./websites";
import { normaliseSocial } from "./contact";
import { normaliseMethod } from "./contactMethods.ts";
import { domainBases, nameWords, pageNamesCompany, socialCandidates } from "./siteLinks.ts";
import { fetchPublicHtml } from "./safeFetch";

// Free checks that read a company's own public website. No paid API, no Google API. Run only when you click.
const UA = "AgencyOSBot";
const words = nameWords;

/** A handful of likely domains for a company name, e.g. "Pluto Creative Labs" -> plutocreativelabs.co.uk, pluto-creative-labs.com… */
export function candidateDomains(name: string): string[] {
  return domainBases(name).flatMap((b) => [".co.uk", ".com", ".uk"].map((t) => `${b}${t}`)).filter(safeDomain).slice(0, 9);
}

export async function fetchPage(domain: string, path = "/"): Promise<string | null> {
  if (!safeDomain(domain) || !(await robotsAllows(domain, path))) return null;
  return (await fetchPublicHtml(`https://${domain}${path}`, { userAgent: UA, timeoutMs: 7000 })).html;
}

export type Verified = "company number" | "name";

/** The page must prove it belongs to this company: UK sites must show the company number; otherwise a full-name match is a weaker yes. */
export function verifyPage(html: string, c: { name: string; company_number: string | null }): Verified | null {
  if (c.company_number && c.company_number.length >= 6 && html.replace(/\s/g, "").includes(c.company_number)) return "company number";
  return pageNamesCompany(html, c.name) ? "name" : null;
}

export async function guessWebsite(c: { name: string; company_number: string | null }): Promise<{ domain: string; verified: Verified } | null> {
  const found: { domain: string; verified: Verified }[] = [];
  const list = candidateDomains(c.name);
  for (let i = 0; i < list.length; i += 3) {
    const batch = await Promise.all(list.slice(i, i + 3).map(async (d) => {
      const html = await fetchPage(d);
      const v = html ? verifyPage(html, c) : null;
      return v ? { domain: d, verified: v } : null;
    }));
    found.push(...batch.filter((x): x is { domain: string; verified: Verified } => !!x));
    if (found.some((f) => f.verified === "company number")) break;
  }
  return found.find((f) => f.verified === "company number") ?? found[0] ?? null;
}

const SIGNALS: Record<string, RegExp> = {
  meta_pixel: /connect\.facebook\.net\/[^"']*fbevents\.js|fbq\(\s*['"]init['"]/i,
  google_ads: /googleadservices\.com|googleads\.g\.doubleclick\.net|['"]AW-\d{6,}/i,
  ga4: /['"]G-[A-Z0-9]{6,}['"]|googletagmanager\.com\/gtag\/js\?id=G-/i,
  gtm: /googletagmanager\.com\/gtm\.js|GTM-[A-Z0-9]{4,}/i,
  linkedin_insight: /snap\.licdn\.com|_linkedin_partner_id/i,
  tiktok_pixel: /analytics\.tiktok\.com/i,
  hubspot: /js\.hs-scripts\.com|hs-analytics/i,
};

export type SiteFindings = {
  emails: string[]; linkedin: string | null; instagram: string | null; facebook: string | null; tiktok: string | null; youtube: string | null; x: string | null; contact_url: string | null;
  signals: Record<string, boolean>; pages: number;
};

export function analyseHtml(html: string, domain: string): Omit<SiteFindings, "pages"> {
  const signals: Record<string, boolean> = Object.fromEntries(Object.entries(SIGNALS).map(([k, re]) => [k, re.test(html)]));
  signals.runs_ads = signals.meta_pixel || signals.google_ads || signals.linkedin_insight || signals.tiktok_pixel;
  const out = { emails: genericEmails(html, domain), linkedin: null as string | null, instagram: null as string | null, facebook: null as string | null, tiktok: null as string | null, youtube: null as string | null, x: null as string | null, contact_url: null as string | null, signals };
  // Every social address anywhere in the page (links, JSON-LD sameAs, scripts); each must still pass the company-page check.
  const found = socialCandidates(html);
  for (const kind of ["linkedin", "instagram", "facebook"] as const) for (const url of found[kind]) { const r = normaliseSocial(kind, url); if (r.value) { out[kind] = r.value; break; } }
  for (const kind of ["tiktok", "youtube", "x"] as const) for (const url of found[kind]) { const r = normaliseMethod(kind, url); if (r.value) { out[kind] = r.value; break; } }
  for (const m of html.matchAll(/href=["']([^"'#]+)["']/gi)) {
    const href = m[1];
    if (!out.contact_url && /\/contact/i.test(href)) {
      try { const u = new URL(href, `https://${domain}`); if (u.hostname.replace(/^www\./, "") === domain.replace(/^www\./, "")) out.contact_url = u.toString(); } catch { /* ignore */ }
    }
  }
  return out;
}

/** Read the homepage and, if needed, the contact page. Returns what it found; nothing is saved here. */
export async function checkSite(domain: string): Promise<SiteFindings | null> {
  const home = await fetchPage(domain, "/");
  if (!home) return null;
  const f: SiteFindings = { ...analyseHtml(home, domain), pages: 1 };
  for (const path of ["/contact", "/contact-us", "/about"]) {
    if (f.emails.length && f.linkedin && f.contact_url) break;
    const html = await fetchPage(domain, path);
    if (!html) continue;
    const g = analyseHtml(html, domain);
    f.pages++;
    f.emails = [...new Set([...f.emails, ...g.emails])];
    f.linkedin ??= g.linkedin; f.instagram ??= g.instagram; f.facebook ??= g.facebook; f.tiktok ??= g.tiktok; f.youtube ??= g.youtube; f.x ??= g.x;
    f.contact_url ??= g.contact_url ?? (path.startsWith("/contact") ? `https://${domain}${path}` : null);
    f.signals = Object.fromEntries(Object.keys(f.signals).map((k) => [k, f.signals[k] || g.signals[k]]));
  }
  return f;
}
