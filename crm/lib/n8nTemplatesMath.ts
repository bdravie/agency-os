// Pure rules for n8n's public template library (no network here), so they can be tested on their own.
// Everything the library returns passes through an allow-list: a template's id, name, a short description and the apps it uses.
// The creator's name, bio, links and picture are never read, and paid templates are left out.

export type TemplateHit = { id: number; name: string; summary: string; apps: string[] };

export const TEMPLATE_PAGE = (id: number) => `https://n8n.io/workflows/${id}`;
export const MAX_SEARCHES = 3, MAX_BROADER = 2, ROWS_PER_SEARCH = 10, ENOUGH_HITS = 6;

const CONTACT = /[\w.+-]+@[\w-]+\.[\w.-]+|\+?\d[\d\s().-]{8,}\d/g;
const tidy = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/https?:\/\/\S+/g, "").replace(CONTACT, "").replace(/[#*_`>|]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max) : "");
const CORE = /^(sticky note|code|edit fields.*|set|if|switch|merge|filter|wait|no operation.*|http request|webhook|schedule trigger|manual trigger|split out|aggregate|loop over items.*|respond to webhook|limit|sort|function|date & time|html|markdown|execute workflow.*)$/i;

/** A search phrase the library can take: plain words only, a handful of them. */
export function cleanSearch(v: unknown): string {
  return typeof v === "string" ? v.toLowerCase().replace(/[^a-z0-9& -]+/g, " ").replace(/\s+/g, " ").trim().split(" ").slice(0, 6).join(" ").slice(0, 60) : "";
}

/** Up to three different search phrases. */
export const cleanSearches = (v: unknown): string[] => [...new Set((Array.isArray(v) ? v : []).map(cleanSearch).filter((s) => s.length >= 3))].slice(0, MAX_SEARCHES);

/**
 * n8n's search only returns templates holding every word, so a long phrase often finds one or none. These are shorter versions
 * of the phrases already tried (their first two and last two words), for one more go when the first came back thin.
 */
export function broaden(tried: string[], limit = MAX_BROADER): string[] {
  const out: string[] = [];
  for (const pick of [(w: string[]) => w.slice(-2), (w: string[]) => w.slice(0, 2)]) {
    for (const phrase of tried) {
      const words = phrase.split(" ");
      const shorter = words.length > 2 ? pick(words).join(" ") : "";
      if (shorter && !tried.includes(shorter) && !out.includes(shorter)) out.push(shorter);
    }
  }
  return out.slice(0, limit);
}

/** The search reply, cut down to what may be kept. Paid templates and anything without an id or a name are dropped. */
export function cleanHits(reply: any): TemplateHit[] {
  return (Array.isArray(reply?.workflows) ? reply.workflows : []).flatMap((w: any): TemplateHit[] => {
    const id = Number(w?.id), name = tidy(w?.name, 140);
    if (!Number.isInteger(id) || id <= 0 || !name || Number(w?.price) > 0 || w?.purchaseUrl) return [];
    const apps = [...new Set((Array.isArray(w?.nodes) ? w.nodes : []).map((n: any) => tidy(n?.displayName, 40)).filter((a: string) => a && !CORE.test(a)))].slice(0, 8) as string[];
    return [{ id, name, summary: tidy(w?.description, 320), apps }];
  });
}

/** The template number from a link to n8n's own library (https://n8n.io/workflows/1750-some-name/), or from the number alone. */
export function templateIdFromUrl(raw: string): number | null {
  const s = raw.trim();
  if (/^\d{1,7}$/.test(s)) return Number(s);
  let u: URL;
  try { u = new URL(s); } catch { return null; }
  if (u.protocol !== "https:" || !/^(www\.)?n8n\.io$/i.test(u.hostname)) return null;
  const m = u.pathname.match(/^\/workflows\/(\d{1,7})(?:[-/]|$)/);
  return m ? Number(m[1]) : null;
}

/** True when the text is a link rather than a file's contents. */
export const looksLikeUrl = (raw: string) => /^https?:\/\/\S+$/i.test(raw.trim());
