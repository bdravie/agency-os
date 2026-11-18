import { classifyCompany } from "./compliance.ts";
import { tidyName } from "./apifyMath.ts";
import type { SourcerFilters, Source } from "./sourcerFilters.ts";

// Merges what each source found into one list: one row per business, whichever sources found it. Pure, so it is testable.

export type ChStaged = { number: string; name: string; postcode: string | null; address: string | null; type: string | null; status: string | null; fit: number | null; notes: string | null;
  est: number | null; employees: number | null; incorporatedOn: string | null; skip: string | null; added: boolean };
export type MapsStaged = { placeId: string; title: string; address: string | null; city: string | null; postcode: string | null; phone: string | null; website: string | null; domain: string | null;
  rating: number | null; reviews: number | null; categories: string[]; mapsUrl: string | null; emails: string[]; closed: string | null; chNumber: string | null; chName: string | null;
  chType: string | null; chStatus: string | null; eligible: string | null; skip: string | null; added: boolean };
/** A CQC register result (cqc_results): the trading name, the registered provider, and its Companies House match. */
export type CqcStaged = { id: number; locationId: string; name: string; provider: string; address: string | null; postcode: string | null; phone: string | null; website: string | null; domain: string | null;
  serviceTypes: string[]; localAuthority: string | null; chNumber: string | null; chName: string | null; chType: string | null; chStatus: string | null; eligible: string | null; skip: string | null; added: boolean };

export type Eligible = "eligible" | "not_eligible" | "unmatched";
export type SourcerRow = {
  key: string; name: string; sources: Source[]; chNumber: string | null; chType: string | null; chStatus: string | null; eligible: Eligible;
  postcode: string | null; city: string | null; address: string | null; phone: string | null; website: string | null; domain: string | null; emails: string[];
  rating: number | null; reviews: number | null; categories: string[]; mapsUrl: string | null; mapsPlaceId: string | null;
  fit: number | null; fitNotes: string | null; est: number | null; employees: number | null; ageYears: number | null; skip: string | null; added: boolean;
  /** The CQC result joined to this row, and the registered company's name when it differs from the one shown. */
  cqcId: number | null; registered: string | null;
};

const ageYears = (inc: string | null, today: string) => (inc ? Math.floor((Date.parse(today) - Date.parse(inc)) / (365.25 * 86_400_000)) : null);

/** One row per business. A Google Maps or CQC result that was matched to a Companies House number joins that company's row. */
export function mergeRows(ch: ChStaged[], maps: MapsStaged[], today: string, cqc: CqcStaged[] = []): SourcerRow[] {
  const byNumber = new Map<string, SourcerRow>();
  const out: SourcerRow[] = [];
  for (const c of ch) {
    const row: SourcerRow = { key: `c:${c.number}`, name: tidyName(c.name), sources: ["ch"], chNumber: c.number, chType: c.type, chStatus: c.status, eligible: classifyCompany(c.type, c.status).status,
      postcode: c.postcode, city: null, address: c.address, phone: null, website: null, domain: null, emails: [], rating: null, reviews: null, categories: [], mapsUrl: null, mapsPlaceId: null,
      fit: c.fit, fitNotes: c.notes, est: c.est, employees: c.employees, ageYears: ageYears(c.incorporatedOn, today), skip: c.skip, added: c.added, cqcId: null, registered: null };
    byNumber.set(c.number, row); out.push(row);
  }
  for (const m of maps) {
    if (m.closed === "permanent") continue;
    const eligible: Eligible = m.eligible === "eligible" || m.eligible === "not_eligible" ? m.eligible : "unmatched";
    const into = m.chNumber ? byNumber.get(m.chNumber) : undefined;
    const details = { phone: m.phone, website: m.website, domain: m.domain, emails: m.emails, rating: m.rating, reviews: m.reviews, categories: m.categories, mapsUrl: m.mapsUrl, mapsPlaceId: m.placeId };
    if (into && into.mapsPlaceId === null) {   // a Companies House result: Maps brings the contact details it lacks
      Object.assign(into, details, { sources: [...into.sources, "maps"] as Source[], city: m.city, postcode: into.postcode ?? m.postcode, address: into.address ?? m.address, skip: into.skip ?? m.skip, added: into.added || m.added });
      continue;
    }
    if (into) {   // a second Google Maps place of the same company (a group's other branch): fill gaps only. Its sources stay as they are, so it is never mistaken for a Companies House result.
      into.phone ??= m.phone; into.website ??= m.website; into.domain ??= m.domain; into.mapsUrl ??= m.mapsUrl; into.city ??= m.city;
      if (!into.emails.length) into.emails = m.emails;
      if (!into.categories.length) into.categories = m.categories;
      into.skip = into.skip ?? m.skip; into.added = into.added || m.added;
      continue;
    }
    const row: SourcerRow = { key: `m:${m.placeId}`, name: m.chName ? tidyName(m.chName) : tidyName(m.title), sources: ["maps"], chNumber: m.chNumber, chType: m.chType, chStatus: m.chStatus, eligible,
      postcode: m.postcode, city: m.city, address: m.address, ...details, fit: null, fitNotes: null, est: null, employees: null, ageYears: null, skip: m.skip, added: m.added, cqcId: null, registered: null };
    if (m.chNumber) byNumber.set(m.chNumber, row);
    out.push(row);
  }
  for (const q of cqc) {
    const eligible: Eligible = q.eligible === "eligible" || q.eligible === "not_eligible" ? q.eligible : "unmatched";
    const into = q.chNumber ? byNumber.get(q.chNumber) : undefined;
    if (into) {   // the same company found another way, or a second practice the same company runs: fill gaps only
      into.phone ??= q.phone; into.website ??= q.website; into.domain ??= q.domain; into.postcode ??= q.postcode; into.address ??= q.address;
      if (!into.sources.includes("cqc")) into.sources = [...into.sources, "cqc"];
      if (!into.categories.length) into.categories = q.serviceTypes.slice(0, 2);
      into.cqcId ??= q.id; into.skip = into.skip ?? q.skip; into.added = into.added || q.added;
      continue;
    }
    const registered = q.chName ?? q.provider;
    const row: SourcerRow = { key: `q:${q.locationId}`, name: q.name, sources: ["cqc"], chNumber: q.chNumber, chType: q.chType, chStatus: q.chStatus, eligible,
      postcode: q.postcode, city: q.localAuthority, address: q.address, phone: q.phone, website: q.website, domain: q.domain, emails: [], rating: null, reviews: null, categories: q.serviceTypes.slice(0, 2),
      mapsUrl: null, mapsPlaceId: null, fit: null, fitNotes: null, est: null, employees: null, ageYears: null, skip: q.skip, added: q.added, cqcId: q.id,
      registered: registered && registered.toLowerCase().replace(/[^a-z0-9]/g, "") !== q.name.toLowerCase().replace(/[^a-z0-9]/g, "") ? tidyName(registered) : null };
    if (q.chNumber) byNumber.set(q.chNumber, row);
    out.push(row);
  }
  return out;
}

/** Splits ticked rows by how they are added: rows that began as a Companies House result (key `c:`) go through that search's own add,
 *  everything else (Google Maps, CQC, or both) is added from its own staged result. Keyed on where the row began, not on its sources list. */
export function splitForAdd<T extends Pick<SourcerRow, "key" | "chNumber">>(rows: T[]): { ch: T[]; others: T[] } {
  const isCh = (r: T) => r.key.startsWith("c:") && !!r.chNumber;
  return { ch: rows.filter(isCh), others: rows.filter((r) => !isCh(r)) };
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
    // A website is known from Google Maps, or from CQC when it lists one (CQC leaving it blank doesn't mean there is none).
    const siteKnown = r.sources.includes("maps") || !!r.domain;
    if (f.website === "has") { if (!siteKnown) { if (!f.includeUnknown) return drop("website unknown"); } else if (!r.domain) return drop("no website"); }
    if (f.website === "none") { if (!siteKnown) { if (!f.includeUnknown) return drop("website unknown"); } else if (r.domain) return drop("has a website"); }
    if (f.rating !== "any") {
      if (r.rating === null) { if (!f.includeUnknown) return drop("rating unknown"); }
      else if (f.rating === "lt4" ? r.rating >= 4 : r.rating < (f.rating === "45" ? 4.5 : 4)) return drop("rating outside your range");
    }
    if (f.reviewsMin !== null && !range(r.reviews, f.reviewsMin, null, "reviews")) return false;
    return true;
  });
  return { kept, dropped };
}
