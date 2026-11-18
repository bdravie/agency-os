// CQC register as a Lead Sourcer source (docs/LEAD_SOURCER_PLAN.md, step 4). Pure rules: reading the care directory CSV, which rows are kept,
// which fit a niche and an area. No fetching or database here, so it can be tested. The fetching is in cqc.ts.
import { parseCsv } from "./csv.ts";
import { hasKeyword, type RelevanceRules } from "./nicheRelevance.ts";

/** Where CQC lists its downloads; the directory file's name changes every week, so the link is read from this page. */
export const CQC_DATA_PAGE = "https://www.cqc.org.uk/about-us/transparency/using-cqc-data";
export const ATTRIBUTION = "Contains CQC data © Care Quality Commission, Open Government Licence v3.0";
/** How long a download is reused before the next search fetches a new one. CQC usually publishes weekly. */
export const REFRESH_DAYS = 7;

export type CqcNiche = { serviceTypes: string[]; nameMustMatch: boolean; maxProviderLocations: number };

/** The `cqc:` block of a niche in config/niches.yaml, or null when the niche is not one CQC regulates. */
export function readCqcConfig(n: any): CqcNiche | null {
  const c = n?.cqc;
  const types = Array.isArray(c?.service_types) ? c.service_types.map((t: unknown) => String(t).trim()).filter(Boolean).slice(0, 10) : [];
  if (!types.length) return null;
  const max = Number(c.max_provider_locations);
  return { serviceTypes: types, nameMustMatch: c.name_must_match === true, maxProviderLocations: Number.isInteger(max) && max > 0 ? Math.min(max, 1000) : 2 };
}

/** A provider the outreach rules allow: a limited company, LLP or PLC (a dentist's own name or "… Partnership" is not). */
export const isLimitedProvider = (name: string) => /\b(limited|ltd|llp|plc)\.?\s*$/i.test(name.trim());

/** CQC lists numbers without their leading 0 ("1132751249"); a UK number is put back to 11 digits. Anything else is dropped. */
export function cqcPhone(raw: string | null | undefined): string | null {
  const d = (raw ?? "").replace(/\D/g, "");
  if (/^0\d{9,10}$/.test(d)) return d;
  if (/^[1-9]\d{9}$/.test(d)) return `0${d}`;
  if (/^44\d{10}$/.test(d)) return `0${d.slice(2)}`;
  return null;
}

/** A website's bare domain ("https://www.smile.co.uk/home" -> "smile.co.uk"), or null. */
export function cqcDomain(raw: string | null | undefined): string | null {
  const t = (raw ?? "").trim();
  if (!t) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(t) ? t : `https://${t}`);
    const host = u.hostname.toLowerCase().replace(/^www\./, "");
    return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host) && !/(^|\.)(facebook|instagram|linkedin|google|nhs)\./.test(`${host}.`) ? host : null;
  } catch { return null; }
}

/** The directory CSV link on CQC's data page (relative links are made absolute), or null. */
export function findDirectoryUrl(html: string, base = CQC_DATA_PAGE): string | null {
  const m = html.match(/href=["']([^"']*CQC_directory\.csv)["']/i);
  if (!m) return null;
  try { const u = new URL(m[1].replace(/&amp;/g, "&"), base); return u.protocol === "https:" && /(^|\.)cqc\.org\.uk$/.test(u.hostname) ? u.toString() : null; } catch { return null; }
}

/** "This data was produced on 04 November 2026" -> "2026-11-04", or null. */
export function fileDate(text: string): string | null {
  const m = text.slice(0, 2000).match(/produced on (\d{1,2}) ([A-Za-z]+) (\d{4})/);
  if (!m) return null;
  const month = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"].indexOf(m[2].toLowerCase());
  return month < 0 ? null : `${m[3]}-${String(month + 1).padStart(2, "0")}-${m[1].padStart(2, "0")}`;
}

export type CqcLocation = {
  location_id: string; name: string; also_known_as: string | null; address: string | null; postcode: string | null; phone: string | null; website: string | null; domain: string | null;
  service_types: string[]; local_authority: string | null; region: string | null; provider_id: string | null; provider_name: string; provider_locations: number;
};

const COLS = { name: "Name", aka: "Also known as", address: "Address", postcode: "Postcode", phone: "Phone number", website: "Service's website (if available)",
  types: "Service types", provider: "Provider name", la: "Local authority", region: "Region", location: "CQC Location ID (for office use only)", providerId: "CQC Provider ID (for office use only)" };

/**
 * Reads the directory and keeps the rows the CRM may hold: a provider that is a limited company, LLP or PLC, offering one of `keepTypes`.
 * Only these columns are read; the file has no named people. Each kept row carries how many locations its provider has in the whole file.
 */
export function parseDirectory(text: string, keepTypes: string[]): { read: number; kept: CqcLocation[]; missing: string[] } {
  const rows = parseCsv(text);
  const h = rows.findIndex((r) => r[0]?.trim() === "Name" && r.includes(COLS.provider));
  if (h < 0) return { read: 0, kept: [], missing: Object.values(COLS) };
  const idx = Object.fromEntries(Object.entries(COLS).map(([k, v]) => [k, rows[h].indexOf(v)])) as Record<keyof typeof COLS, number>;
  const missing = Object.entries(idx).filter(([, i]) => i < 0).map(([k]) => COLS[k as keyof typeof COLS]);
  if (missing.length) return { read: 0, kept: [], missing };
  const data = rows.slice(h + 1).filter((r) => r.length >= rows[h].length - 1);
  const providerCount = new Map<string, number>();
  for (const r of data) { const p = (r[idx.provider] ?? "").trim(); providerCount.set(p, (providerCount.get(p) ?? 0) + 1); }
  const want = new Set(keepTypes);
  const cell = (r: string[], k: keyof typeof COLS, max = 300) => { const v = (r[idx[k]] ?? "").trim(); return v ? v.slice(0, max) : null; };
  const kept: CqcLocation[] = [];
  for (const r of data) {
    const provider = cell(r, "provider", 200), id = cell(r, "location", 40), name = cell(r, "name", 200);
    if (!provider || !id || !name || !isLimitedProvider(provider)) continue;
    const types = [...new Set((cell(r, "types", 400) ?? "").split("|").map((t) => t.trim()).filter(Boolean))];
    if (!types.some((t) => want.has(t))) continue;
    const website = cell(r, "website");
    kept.push({ location_id: id, name, also_known_as: cell(r, "aka", 200), address: cell(r, "address"), postcode: cell(r, "postcode", 12)?.toUpperCase() ?? null, phone: cqcPhone(cell(r, "phone", 30)),
      website: website && cqcDomain(website) ? website : null, domain: cqcDomain(website), service_types: types, local_authority: cell(r, "la", 80), region: cell(r, "region", 80),
      provider_id: cell(r, "providerId", 40), provider_name: provider, provider_locations: providerCount.get(provider) ?? 1 });
  }
  return { read: data.length, kept, missing: [] };
}

/** Whether a row is in the area typed ("Leeds", "LS6", "West Yorkshire"): its local authority, its address, its postcode or its region. */
export function inArea(r: Pick<CqcLocation, "address" | "postcode" | "local_authority" | "region">, area: string): boolean {
  const a = area.trim().toLowerCase();
  if (!a) return false;
  const pc = (r.postcode ?? "").replace(/\s/g, "").toLowerCase(), want = a.replace(/\s/g, "");
  if (/^[a-z]{1,2}\d/.test(want) && pc.startsWith(want)) return true;
  return [r.local_authority, r.region].some((v) => (v ?? "").toLowerCase() === a)
    || (r.address ?? "").toLowerCase().split(",").some((part) => part.trim() === a || part.trim().startsWith(`${a} `));
}

/** Whether a row fits a niche: one of its service types, not a chain, and (when the niche says so) a name with one of its include words. */
export function fitsNiche(r: Pick<CqcLocation, "service_types" | "provider_locations" | "name" | "also_known_as">, cfg: CqcNiche, rules: RelevanceRules): "ok" | "type" | "chain" | "name" {
  if (!r.service_types.some((t) => cfg.serviceTypes.includes(t))) return "type";
  if (r.provider_locations > cfg.maxProviderLocations) return "chain";
  if (cfg.nameMustMatch && !rules.include.some((k) => hasKeyword(`${r.name} ${r.also_known_as ?? ""}`, k))) return "name";
  return "ok";
}
