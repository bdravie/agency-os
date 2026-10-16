import { classifyCompany } from "./compliance.ts";
import { tidyName } from "./apifyMath.ts";
import type { SourcerFilters, Source } from "./sourcerFilters.ts";

// Merges what each source found into one list: one row per business, whichever sources found it. Pure, so it is testable.

export type ChStaged = { number: string; name: string; postcode: string | null; address: string | null; type: string | null; status: string | null; fit: number | null; notes: string | null;
  est: number | null; employees: number | null; incorporatedOn: string | null; skip: string | null; added: boolean };
export type MapsStaged = { placeId: string; title: string; address: string | null; city: string | null; postcode: string | null; phone: string | null; website: string | null; domain: string | null;
  rating: number | null; reviews: number | null; categories: string[]; mapsUrl: string | null; emails: string[]; closed: string | null; chNumber: string | null; chName: string | null;
  chType: string | null; chStatus: string | null; eligible: string | null; skip: string | null; added: boolean };

export type Eligible = "eligible" | "not_eligible" | "unmatched";
export type SourcerRow = {
  key: string; name: string; sources: Source[]; chNumber: string | null; chType: string | null; chStatus: string | null; eligible: Eligible;
  postcode: string | null; city: string | null; address: string | null; phone: string | null; website: string | null; domain: string | null; emails: string[];
  rating: number | null; reviews: number | null; categories: string[]; mapsUrl: string | null; mapsPlaceId: string | null;
  fit: number | null; fitNotes: string | null; est: number | null; employees: number | null; ageYears: number | null; skip: string | null; added: boolean;
};

const ageYears = (inc: string | null, today: string) => (inc ? Math.floor((Date.parse(today) - Date.parse(inc)) / (365.25 * 86_400_000)) : null);

/** One row per business. A Google Maps result that was matched to a Companies House number joins that company's row. */
export function mergeRows(ch: ChStaged[], maps: MapsStaged[], today: string): SourcerRow[] {
  const byNumber = new Map<string, SourcerRow>();
  const out: SourcerRow[] = [];
  for (const c of ch) {
    const row: SourcerRow = { key: `c:${c.number}`, name: tidyName(c.name), sources: ["ch"], chNumber: c.number, chType: c.type, chStatus: c.status, eligible: classifyCompany(c.type, c.status).status,
      postcode: c.postcode, city: null, address: c.address, phone: null, website: null, domain: null, emails: [], rating: null, reviews: null, categories: [], mapsUrl: null, mapsPlaceId: null,
      fit: c.fit, fitNotes: c.notes, est: c.est, employees: c.employees, ageYears: ageYears(c.incorporatedOn, today), skip: c.skip, added: c.added };
    byNumber.set(c.number, row); out.push(row);
  }
  for (const m of maps) {
    if (m.closed === "permanent") continue;
    const eligible: Eligible = m.eligible === "eligible" || m.eligible === "not_eligible" ? m.eligible : "unmatched";
    const into = m.chNumber ? byNumber.get(m.chNumber) : undefined;
    const details = { phone: m.phone, website: m.website, domain: m.domain, emails: m.emails, rating: m.rating, reviews: m.reviews, categories: m.categories, mapsUrl: m.mapsUrl, mapsPlaceId: m.placeId };
    if (into) {
      Object.assign(into, details, { sources: ["ch", "maps"] as Source[], city: m.city, postcode: into.postcode ?? m.postcode, address: into.address ?? m.address, skip: into.skip ?? m.skip, added: into.added || m.added });
      continue;
    }
    out.push({ key: `m:${m.placeId}`, name: m.chName ? tidyName(m.chName) : tidyName(m.title), sources: ["maps"], chNumber: m.chNumber, chType: m.chType, chStatus: m.chStatus, eligible,
      postcode: m.postcode, city: m.city, address: m.address, ...details, fit: null, fitNotes: null, est: null, employees: null, ageYears: null, skip: m.skip, added: m.added });
  }
  return out;
}

export type Dropped = Record<string, number>;

/** Applies the form's filters. A value a source can't tell us (a revenue Companies House doesn't hold, a rating for a company Maps didn't find) is kept only if "include unknown" is on. */
export function applyFilters(rows: SourcerRow[], f: SourcerFilters): { kept: SourcerRow[]; dropped: Dropped } {
  const dropped: Dropped = {};
  const drop = (why: string) => { dropped[why] = (dropped[why] ?? 0) + 1; return false; };
  const range = (v: number | null, min: number | null, max: number | null, what: string) => (v === null ? (f.includeUnknown ? true : drop(`${what} unknown`)) : (min !== null && v < min) || (max !== null && v > max) ? drop(`${what} outside your range`) : true);
  const kept = rows.filter((r) => {
    if (f.types === "limited" && r.eligible !== "eligible") return drop(r.eligible === "unmatched" ? "not matched to a limited company (sole trader or trading name?)" : "not an active limited company");
    if ((f.revMin !== null || f.revMax !== null) && !range(r.est, f.revMin, f.revMax, "revenue")) return false;
    if ((f.empMin !== null || f.empMax !== null) && !range(r.employees, f.empMin, f.empMax, "employees")) return false;
    if (f.ageMin !== null && !range(r.ageYears, f.ageMin, null, "age")) return false;
    const mapsKnown = r.sources.includes("maps");
    if (f.website === "has") { if (!mapsKnown) { if (!f.includeUnknown) return drop("website unknown"); } else if (!r.domain) return drop("no website"); }
    if (f.website === "none") { if (!mapsKnown) { if (!f.includeUnknown) return drop("website unknown"); } else if (r.domain) return drop("has a website"); }
    if (f.rating !== "any") {
      if (r.rating === null) { if (!f.includeUnknown) return drop("rating unknown"); }
      else if (f.rating === "lt4" ? r.rating >= 4 : r.rating < (f.rating === "45" ? 4.5 : 4)) return drop("rating outside your range");
    }
    if (f.reviewsMin !== null && !range(r.reviews, f.reviewsMin, null, "reviews")) return false;
    return true;
  });
  return { kept, dropped };
}
