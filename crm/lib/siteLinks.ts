// Pure helpers for reading a company's own website: how its name becomes likely domains, and which social pages its HTML points to. No imports.

const STOP = new Set(["ltd", "limited", "llp", "plc", "uk", "the", "and", "group", "company", "co", "services", "holdings"]);

/** The meaningful words of a company name. Apostrophes are dropped, not turned into spaces, so "Women's" stays one word. */
export const nameWords = (name: string) => name.toLowerCase().replace(/\(.*?\)/g, " ").replace(/['’`]/g, "").replace(/&/g, " and ").replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w && !STOP.has(w));

/** Domain stems for a name, e.g. "London Women's Clinic" -> londonwomensclinic, london-womens-clinic, londonwomens. */
export function domainBases(name: string): string[] {
  const w = nameWords(name);
  if (w.length === 0) return [];
  return [...new Set([w.join(""), w.join("-"), w.length > 2 ? w.slice(0, 2).join("") : ""].filter((b) => b.length >= 3))];
}

export type SocialCandidates = { instagram: string[]; facebook: string[]; linkedin: string[]; tiktok: string[]; youtube: string[]; x: string[] };
const HOSTS: [keyof SocialCandidates, RegExp][] = [
  ["instagram", /^(?:[a-z-]+\.)?instagram\.com$/], ["facebook", /^(?:[a-z-]+\.)?(?:facebook|fb)\.com$/], ["linkedin", /^(?:[a-z-]+\.)?linkedin\.com$/],
  ["tiktok", /^(?:[a-z-]+\.)?tiktok\.com$/], ["youtube", /^(?:[a-z-]+\.)?youtube\.com$/], ["x", /^(?:[a-z-]+\.)?(?:x|twitter)\.com$/],
];

/** Every social-platform address anywhere in the page: links, JSON-LD "sameAs" lists, meta tags and scripts. The caller checks each one is a real company page. */
export function socialCandidates(html: string): SocialCandidates {
  const out: SocialCandidates = { instagram: [], facebook: [], linkedin: [], tiktok: [], youtube: [], x: [] };
  const text = html.replace(/\\u002F/gi, "/").replace(/\\\//g, "/").replace(/&amp;/g, "&");
  for (const m of text.matchAll(/(?:https?:)?\/\/([a-z0-9.-]+\.[a-z]{2,})(\/[^\s"'<>\\)]*)?/gi)) {
    const h = m[1].toLowerCase();
    const hit = HOSTS.find(([, re]) => re.test(h));
    if (!hit) continue;
    const url = `https://${h}${m[2] ?? ""}`;
    if (!out[hit[0]].includes(url)) out[hit[0]].push(url);
  }
  return out;
}

const ENTITIES: Record<string, string> = { amp: "&", apos: "'", quot: '"', nbsp: " ", rsquo: "'", lsquo: "'", ndash: "-", mdash: "-", pound: "£" };
/** Decodes the HTML entities that matter for matching names ("Women&#39;s", "Smith &amp; Sons"). */
export const decodeEntities = (s: string) => s.replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n))).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16))).replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m);

/** Lower-case letters and numbers only, apostrophes removed, single spaces: the form names are compared in. */
export const matchForm = (s: string) => decodeEntities(s).toLowerCase().replace(/['’‘`]/g, "").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

/** The text a page says about itself: what a visitor reads plus the title, meta tags and JSON-LD (many sites only name themselves there). */
export function pageText(html: string): string {
  const extra: string[] = [];
  for (const m of html.matchAll(/<meta[^>]+content=["']([^"']{2,300})["']/gi)) extra.push(m[1]);
  for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) extra.push(m[1].replace(/\\u0027|\\'/g, "'").replace(/[{}\[\]",:]/g, " "));
  const visible = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ");
  return matchForm(`${visible} ${extra.join(" ")}`);
}

/** Does this page name the company in full? Used to prove a guessed website belongs to it. */
export function pageNamesCompany(html: string, name: string): boolean {
  const full = nameWords(name).join(" ");
  return full.length >= 5 && ` ${pageText(html)} `.includes(` ${full} `);
}
