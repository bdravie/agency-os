// The Lead Sourcer search form: the choices on offer, reading them safely from a submitted form, and turning them into what each source needs.
// Every option is a fixed choice, so nothing typed can change what is searched beyond the niche, the place and the search phrase.

export type Source = "ch" | "maps";
export type Website = "any" | "has" | "none";
export type Rating = "any" | "4" | "45" | "lt4";

export type SourcerFilters = {
  niche: string; location: string; term: string; sources: Source[]; types: "limited" | "all";
  revMin: number | null; revMax: number | null; empMin: number | null; empMax: number | null; ageMin: number | null;
  website: Website; rating: Rating; reviewsMin: number | null; includeUnknown: boolean; limit: number; contacts: boolean;
};

const num = (opts: number[]) => (v: string | null) => { const n = Number(v); return v !== null && v !== "" && opts.includes(n) ? n : null; };
export const OPTIONS = {
  revMin: [50_000, 100_000, 250_000, 500_000, 1_000_000], revMax: [250_000, 500_000, 1_000_000, 5_000_000],
  empMin: [2, 5, 10, 25], empMax: [10, 25, 50, 250], ageMin: [2, 5, 10, 20], reviewsMin: [10, 25, 50, 100], limit: [25, 50, 100],
};
export const money = (n: number) => (n >= 1_000_000 ? `£${n / 1_000_000}m` : `£${n / 1000}k`);

export type Parsed = { ok: true; filters: SourcerFilters } | { ok: false; error: string };

/** Reads the form. Unknown or out-of-range values become "no filter", never an error or a guess. */
export function parseSourcerForm(get: (k: string) => string | null): Parsed {
  const sources = (["ch", "maps"] as const).filter((s) => get(`src_${s}`) === "on");
  if (sources.length === 0) return { ok: false, error: "Choose at least one place to look." };
  const niche = (get("niche") ?? "").trim();
  if (!niche) return { ok: false, error: "Choose a niche." };
  const location = (get("location") ?? "").trim();
  if (!location) return { ok: false, error: "Enter a town or area, e.g. Leeds." };
  const revMin = num(OPTIONS.revMin)(get("revMin")), revMax = num(OPTIONS.revMax)(get("revMax"));
  if (revMin !== null && revMax !== null && revMin > revMax) return { ok: false, error: "The minimum revenue is above the maximum." };
  const empMin = num(OPTIONS.empMin)(get("empMin")), empMax = num(OPTIONS.empMax)(get("empMax"));
  if (empMin !== null && empMax !== null && empMin > empMax) return { ok: false, error: "The minimum employees is above the maximum." };
  return { ok: true, filters: {
    niche, location, term: (get("term") ?? "").trim().slice(0, 80), sources, types: get("types") === "all" ? "all" : "limited",
    revMin, revMax, empMin, empMax, ageMin: num(OPTIONS.ageMin)(get("ageMin")),
    website: (["has", "none"] as const).find((w) => w === get("website")) ?? "any", rating: (["4", "45", "lt4"] as const).find((r) => r === get("rating")) ?? "any",
    reviewsMin: num(OPTIONS.reviewsMin)(get("reviewsMin")), includeUnknown: get("includeUnknown") === "on", limit: num(OPTIONS.limit)(get("limit")) ?? 50, contacts: get("contacts") === "on",
  } };
}

/** Companies House only knows size after a health check, so a size filter needs more candidates to end up with the number asked for. */
export const hasSizeFilter = (f: SourcerFilters) => f.revMin !== null || f.revMax !== null || f.empMin !== null || f.empMax !== null;
export const chLimit = (f: SourcerFilters) => Math.min(100, hasSizeFilter(f) ? f.limit * 2 : f.limit);
/** Google Maps places cost credits, so never more than 50, and fewer if the budget says so. */
export const mapsPlaces = (f: SourcerFilters) => Math.min(50, f.limit);
export const mapsWebsite = (f: SourcerFilters): "allPlaces" | "withWebsite" | "withoutWebsite" => (f.website === "has" ? "withWebsite" : f.website === "none" ? "withoutWebsite" : "allPlaces");
export const mapsStars = (f: SourcerFilters): "" | "four" | "fourAndHalf" => (f.rating === "4" ? "four" : f.rating === "45" ? "fourAndHalf" : "");
