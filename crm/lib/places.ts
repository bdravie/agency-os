import { normaliseDomain } from "./csv";
import { safeDomain } from "./websites";

// Google Places API (New) Text Search. One request per company; the caller enforces a daily cap.
const NOT_A_WEBSITE = ["facebook.com", "instagram.com", "linkedin.com", "twitter.com", "x.com", "tiktok.com", "youtube.com", "yell.com", "companieshouse.gov.uk", "gov.uk"];
const STOP = new Set(["ltd", "limited", "llp", "plc", "uk", "the", "and", "&", "group", "company", "co"]);

export const dailyCap = () => Number(process.env.PLACES_DAILY_CAP ?? 30) || 30;

const tokens = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((t) => t && !STOP.has(t));

/** A place matches if its address contains the postcode's outward part and the names share a distinctive word. */
export function isMatch(company: { name: string; postcode: string | null }, place: { name: string; address: string }): boolean {
  const out = company.postcode?.trim().split(/\s+/)[0]?.toUpperCase();
  if (out && !place.address.toUpperCase().includes(out)) return false;
  const a = new Set(tokens(company.name));
  return tokens(place.name).some((t) => a.has(t));
}

export type PlaceResult = { domain: string; matchedName: string; phone: string | null };

export async function lookupWebsite(company: { name: string; postcode: string | null }): Promise<PlaceResult | null> {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) throw new Error("GOOGLE_PLACES_API_KEY is not set");
  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "content-type": "application/json", "X-Goog-Api-Key": key,
      "X-Goog-FieldMask": "places.displayName,places.formattedAddress,places.websiteUri,places.nationalPhoneNumber",
    },
    body: JSON.stringify({ textQuery: [company.name, company.postcode].filter(Boolean).join(" "), regionCode: "GB", pageSize: 3 }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`Google Places said ${res.status}. If it is 429, your daily quota is used up.`);
  const data = (await res.json()) as { places?: { displayName?: { text?: string }; formattedAddress?: string; websiteUri?: string; nationalPhoneNumber?: string }[] };
  for (const p of data.places ?? []) {
    const domain = normaliseDomain(p.websiteUri);
    if (!domain || !safeDomain(domain) || NOT_A_WEBSITE.some((d) => domain === d || domain.endsWith("." + d))) continue;
    if (isMatch(company, { name: p.displayName?.text ?? "", address: p.formattedAddress ?? "" })) {
      return { domain, matchedName: p.displayName?.text ?? "", phone: p.nationalPhoneNumber ?? null };
    }
  }
  return null;
}
