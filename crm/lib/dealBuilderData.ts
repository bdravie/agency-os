import { query } from "./db";

export type BuilderService = { id: number; name: string; billing: string; price: number; min: number | null; max: number | null; days: number | null };
export type BuilderPackage = { id: number; name: string; outcome: string | null; services: BuilderService[] };

/** The active services and packages the deal builder offers, with default prices from the catalogue. */
export async function loadBuilderCatalogue(): Promise<{ services: BuilderService[]; packages: BuilderPackage[] }> {
  const rows = await query<any>(
    `SELECT id, name, outcome, billing, is_bundle, sort_order, price_min_gbp::float AS min, price_max_gbp::float AS max, default_duration_days AS days,
            (CASE WHEN billing = 'monthly' THEN monthly_price_gbp ELSE setup_price_gbp END)::float AS price
       FROM offers WHERE active AND (is_bundle OR billing IS NOT NULL) ORDER BY sort_order, name`);
  const services: BuilderService[] = rows.filter((r: any) => !r.is_bundle).map((r: any) => ({ id: r.id, name: r.name, billing: r.billing, price: r.price, min: r.min, max: r.max, days: r.days }));
  const links = await query<{ bundle_id: number; component_id: number }>(`SELECT bundle_id, component_id FROM offer_components`);
  const byId = new Map(services.map((s) => [s.id, s]));
  const packages: BuilderPackage[] = rows.filter((r: any) => r.is_bundle).map((r: any) => ({
    id: r.id, name: r.name, outcome: r.outcome,
    services: links.filter((l) => l.bundle_id === r.id).map((l) => byId.get(l.component_id)).filter((s): s is BuilderService => !!s).sort((a, b) => services.indexOf(a) - services.indexOf(b)),
  })).filter((p: BuilderPackage) => p.services.length > 0);
  return { services, packages };
}
