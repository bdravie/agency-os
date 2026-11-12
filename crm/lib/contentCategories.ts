import { query } from "./db";
import { loadContentConfig } from "./content";
import { nicheLabel } from "./contentConfigMath";
import { slugifyNicheKey } from "./categoryTimeSeries";
import { BRAND_COLOUR_OPTIONS, type ContentCategory } from "./categoryTypes";

export { slugifyNicheKey, BRAND_COLOUR_OPTIONS, type ContentCategory };

export async function listContentCategories(includeInactive = false): Promise<ContentCategory[]> {
  try {
    const rows = await query<any>(
      `SELECT id, key, label, colour, active FROM content_categories ${includeInactive ? "" : "WHERE active = true"} ORDER BY id`
    );
    if (rows.length > 0) {
      return rows.map((r: any) => ({
        id: Number(r.id),
        key: String(r.key),
        label: String(r.label),
        colour: String(r.colour || "var(--accent)"),
        active: Boolean(r.active),
      }));
    }
  } catch {
    // If the table does not exist yet before migration is run, fall back cleanly
  }

  // Fallback to config/niches.yaml
  try {
    const config = await loadContentConfig();
    return config.niches.map((n, idx) => ({
      id: idx + 1,
      key: n,
      label: nicheLabel(n),
      colour: idx === 0 ? "var(--accent)" : idx === 1 ? "var(--cyan)" : idx === 2 ? "var(--violet)" : "var(--good)",
      active: true,
    }));
  } catch {
    return [
      { id: 1, key: "trades", label: "Trades", colour: "var(--accent)", active: true },
      { id: 2, key: "dental", label: "Dental", colour: "var(--cyan)", active: true },
      { id: 3, key: "aesthetics", label: "Aesthetics", colour: "var(--violet)", active: true },
    ];
  }
}
