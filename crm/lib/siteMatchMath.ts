// Matching a Google Maps result to Companies House through its own website (docs/LEAD_SOURCER_PLAN.md, step 3). A UK limited company must show
// its registered number on its website, so a clinic that trades as "Smile Studio" but is registered as "ABC Holdings Ltd" can still be matched
// without guessing from the name. Pure: no fetching here, so it can be tested.
import { normaliseNumber } from "./companiesHouse.ts";
import { postcodeDistrict } from "./apifyMath.ts";

const NUM = String.raw`((?:SC|NI|OC|SO|NC|R0)?\s?\d{6,8})(?![\d-])`;
// Each pattern needs a company-number phrase right before the number, so phone numbers, VAT numbers and prices are not picked up.
const PATTERNS = [
  new RegExp(String.raw`company\s*(?:registration\s*)?(?:no|number|num|reg(?:istration)?)\.?\s*(?:is\s*)?[:.#-]?\s*` + NUM, "gi"),
  new RegExp(String.raw`registered\s+(?:in|at)\s+(?:england|wales|scotland|northern\s+ireland|the\s+uk|the\s+united\s+kingdom)[^0-9]{0,60}?` + NUM, "gi"),
  new RegExp(String.raw`reg(?:istered)?\.?\s*(?:co(?:mpany)?\.?\s*)?(?:no|number)\.?\s*[:.#-]?\s*` + NUM, "gi"),
];

/** The page as plain text: tags, scripts and styles removed, common entities decoded, spaces collapsed. */
export function pageText(html: string): string {
  return html.replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ").replace(/&amp;/gi, "&").replace(/&#0?58;/g, ":").replace(/&#0?46;/g, ".").replace(/\s+/g, " ");
}

/** Company numbers the page states, in the order they appear, normalised ("1234567" -> "01234567"), at most 3. */
export function companyNumbersIn(html: string): string[] {
  const text = pageText(html), found: { at: number; n: string }[] = [];
  for (const re of PATTERNS) for (const m of text.matchAll(re)) {
    const n = normaliseNumber(m[1]);
    if (n && !/^0+$/.test(n)) found.push({ at: m.index ?? 0, n });
  }
  return [...new Set(found.sort((a, b) => a.at - b.at).map((f) => f.n))].slice(0, 3);
}

const STOP = new Set(["the", "and", "of", "ltd", "limited", "llp", "plc", "uk", "group", "holdings", "services", "company", "co", "clinic", "clinics", "practice", "dental", "aesthetics", "studio"]);
const keyWords = (s: string) => s.toLowerCase().replace(/&/g, " ").split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !STOP.has(w));

export type Profile = { name: string; address: string | null; sic: string[] };
export type Place = { title: string; postcode: string | null; domain: string | null };

/**
 * Whether the company a website names is plausibly the business on Google Maps, and why. A site can show another company's number
 * (a web designer's footer, a GDC registration), so at least one of these must hold: the registered name shares a distinctive word with the
 * Maps name or the website address, the registered office is in the same postcode area, or the company's industry code is one of the niche's.
 */
export function sameBusiness(profile: Profile, place: Place, nicheSics: string[]): { ok: boolean; why: string } {
  const reg = keyWords(profile.name);
  const theirs = [...keyWords(place.title), ...keyWords((place.domain ?? "").replace(/\.(co\.uk|org\.uk|com|uk|net|org|clinic|dental)$/i, ""))];
  const domainFlat = (place.domain ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const shared = reg.find((w) => theirs.includes(w) || (w.length >= 4 && domainFlat.includes(w)));
  if (shared) return { ok: true, why: `the registered name shares "${shared}"` };
  const d = postcodeDistrict(place.postcode);
  if (d && postcodeDistrict(profile.address ?? "") === d) return { ok: true, why: `registered office in ${d}, the same area` };
  const sic = profile.sic.find((s) => nicheSics.includes(s));
  if (sic) return { ok: true, why: `its industry code ${sic} is this niche's` };
  return { ok: false, why: "the name, area and industry code all differ" };
}

export type FoundBy = Record<string, "google maps" | "website" | "apify" | "name match" | "website guess" | "web search" | "google places" | "cqc register">;

/**
 * Which step found each detail of a Google Maps result (an apify_results row), for the activity log, so the hit rate per step can be counted:
 * Maps itself, the CRM's free read of the business's website, or Apify's paid contact add-on.
 */
export function mapsFoundBy(r: { domain?: string | null; phone?: string | null; emails?: string[] | null; socials?: Record<string, unknown> | null; ch_number?: string | null; match?: string | null;
  site_read?: { emails?: number; socials?: string[]; contact_url?: string | null } | null }): FoundBy {
  const s = r.site_read ?? {}, out: FoundBy = {};
  if (r.domain) out.website = "google maps";
  if (r.phone) out.phone = "google maps";
  if ((r.emails ?? []).length) out.email = (s.emails ?? 0) > 0 ? "website" : "apify";
  for (const k of ["linkedin", "instagram", "facebook"]) if ((r.socials ?? {})[k]) out[k] = (s.socials ?? []).includes(k) ? "website" : "apify";
  if (s.contact_url) out.contact_page = "website";
  if (r.ch_number) out.company_number = r.match === "website" ? "website" : "name match";
  return out;
}
