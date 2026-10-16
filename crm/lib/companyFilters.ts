// The Companies list sort and filters. Every option is a fixed choice (nothing from the address bar is put into SQL as text),
// and anything typed (the area) goes in as a parameter. Pure, so it can be tested.

export const SORTS = [
  { key: "", label: "Follow-ups first, then best fit" },
  { key: "recent", label: "Recently added" },
  { key: "suitable", label: "Most suitable" },
  { key: "revenue", label: "Highest estimated revenue" },
  { key: "rating", label: "Best Google rating" },
  { key: "name", label: "Name A to Z" },
] as const;

export const FILTERS = {
  added: { label: "Added", options: [["", "Any time"], ["today", "Today"], ["7", "Last 7 days"], ["30", "Last 30 days"]] },
  tier: { label: "Suitability", options: [["", "Any"], ["a", "A: most suitable"], ["ab", "A or B"], ["hideskip", "Hide skipped"]] },
  source: { label: "Source", options: [["", "Any"], ["ch", "Companies House"], ["maps", "Google Maps (Apify)"], ["other", "Added by hand, imported or demo"]] },
  contact: { label: "Contact details", options: [["", "Any"], ["site", "Has a website"], ["email", "Has a generic email"], ["phone", "Has a phone"], ["route", "Any way to reach them"]] },
  rev: { label: "Est. revenue", options: [["", "Any"], ["50", "£50k or more"], ["100", "£100k or more"], ["250", "£250k or more"]] },
  rating: { label: "Google rating", options: [["", "Any"], ["45", "4.5 or more"], ["4", "4.0 or more"], ["lt4", "Under 4.0 (room to improve)"]] },
} as const;

export type FilterKey = keyof typeof FILTERS;
export type ListParams = { sort?: string; area?: string } & Partial<Record<FilterKey, string>>;

const allowed = (key: FilterKey, v: string | undefined) => (FILTERS[key].options.some(([k]) => k === (v ?? "")) ? v ?? "" : "");
const CLAUSES: Record<FilterKey, Record<string, string>> = {
  added: { today: "created_at >= current_date", "7": "created_at > now() - interval '7 days'", "30": "created_at > now() - interval '30 days'" },
  tier: { a: "tier = 'A'", ab: "tier IN ('A', 'B')", hideskip: "tier <> 'Skip'" },
  source: { ch: "source = 'Companies House'", maps: "source = 'Apify Google Maps'", other: "source IS DISTINCT FROM 'Companies House' AND source IS DISTINCT FROM 'Apify Google Maps'" },
  contact: { site: "domain IS NOT NULL", email: "generic_email IS NOT NULL", phone: "phone IS NOT NULL",
    route: "(generic_email IS NOT NULL OR linkedin_url IS NOT NULL OR instagram_url IS NOT NULL OR facebook_url IS NOT NULL OR contact_url IS NOT NULL)" },
  rev: { "50": "est_revenue_gbp >= 50000", "100": "est_revenue_gbp >= 100000", "250": "est_revenue_gbp >= 250000" },
  rating: { "45": "maps_rating >= 4.5", "4": "maps_rating >= 4", lt4: "maps_rating < 4" },
};
const ORDERS: Record<string, string> = {
  "": "(followup_due IS NULL), followup_due, fit_score DESC NULLS LAST, created_at DESC",
  recent: "created_at DESC, id DESC",
  suitable: "suitability DESC, fit_score DESC NULLS LAST, created_at DESC",
  revenue: "est_revenue_gbp DESC NULLS LAST, suitability DESC",
  rating: "maps_rating DESC NULLS LAST, maps_reviews DESC NULLS LAST, suitability DESC",
  name: "lower(name), id",
};

/** Letters, numbers, spaces and a few separators only, so a typed area can't act as a wildcard. */
export const cleanArea = (s: string | undefined) => (s ?? "").replace(/[^A-Za-z0-9 .'-]/g, "").replace(/\s+/g, " ").trim().slice(0, 40);

/** The extra WHERE clauses (each AND-ed), their parameters (numbered from `firstParam`) and the ORDER BY for the chosen sort. */
export function buildListQuery(p: ListParams, firstParam: number): { where: string[]; params: unknown[]; order: string; active: string[] } {
  const where: string[] = [], params: unknown[] = [], active: string[] = [];
  for (const key of Object.keys(FILTERS) as FilterKey[]) {
    const v = allowed(key, p[key]);
    if (v && CLAUSES[key][v]) { where.push(`(${CLAUSES[key][v]})`); active.push(key); }
  }
  const area = cleanArea(p.area);
  if (area) {
    const n = firstParam + params.length;
    where.push(`(postcode ILIKE $${n} || '%' OR city ILIKE '%' || $${n} || '%' OR address ILIKE '%' || $${n} || '%')`);
    params.push(area); active.push("area");
  }
  const sort = p.sort !== undefined && p.sort in ORDERS ? p.sort : "";
  return { where, params, order: ORDERS[sort], active };
}
