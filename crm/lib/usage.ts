import { query } from "./db";

// What has been spent today. Paid or Google-API actions only ever run when you click, and stop at these caps.
export type Usage = { places: { used: number; cap: number }; search: { used: number; cap: number; enabled: boolean } };

export async function creditUsage(): Promise<Usage> {
  const [r] = await query<{ places: string; search: string }>(
    `SELECT count(*) FILTER (WHERE type = 'places_lookup') AS places, count(*) FILTER (WHERE type = 'search_lookup') AS search
       FROM activities WHERE type IN ('places_lookup', 'search_lookup') AND occurred_at::date = current_date`);
  return {
    places: { used: Number(r.places), cap: Number(process.env.PLACES_DAILY_CAP ?? 30) || 30 },
    search: { used: Number(r.search), cap: Number(process.env.SEARCH_DAILY_CAP ?? 15) || 15, enabled: !!process.env.SEARCH_API_KEY },
  };
}
