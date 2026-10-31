// Seeds the offers table from ../config/offers.yaml. Insert-only: an offer that already exists is never changed,
// so prices and checklists you have edited in the CRM are safe. Packages (`includes:`) are linked to their services.
// Usage (from crm/):  npx tsx --env-file=../.env scripts/seedOffers.mts [--dry-run]
import { readFileSync } from "node:fs";
import { parse } from "yaml";
import { tx } from "../lib/db.ts";
import { isPackage, validateOffer, type CatalogueOffer } from "../lib/offerCatalogue.ts";

const dry = process.argv.includes("--dry-run");
const items: (CatalogueOffer & Record<string, any>)[] = parse(readFileSync(new URL("../../config/offers.yaml", import.meta.url), "utf8")).offers;
const bad = items.map((o) => [o.name ?? "?", validateOffer(o, items)] as const).filter(([, p]) => p.length);
if (bad.length) { console.error("Fix config/offers.yaml first:\n" + bad.map(([n, p]) => `  ${n}: ${p.join(", ")}`).join("\n")); process.exit(1); }
if (dry) { console.log(`${items.length} offers in the yaml (${items.filter(isPackage).length} packages), all valid. Nothing written.`); process.exit(0); }

const result = await tx(async (c) => {
  let added = 0, linked = 0;
  for (const o of items) {
    const { rows } = await c.query(
      `INSERT INTO offers (name, niche, outcome, setup_price_gbp, monthly_price_gbp, loom_url, demo_path, billing, price_min_gbp, price_max_gbp,
                           default_duration_days, deliverables, sort_order, is_bundle)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13,$14) ON CONFLICT (name) DO NOTHING RETURNING id`,
      [o.name, o.niche ?? null, o.outcome ?? null, o.setup_price_gbp ?? 0, o.monthly_price_gbp ?? 0, o.loom_url || null, o.demo_path || null, o.billing ?? null,
       o.price_min_gbp ?? null, o.price_max_gbp ?? null, o.default_duration_days ?? null, JSON.stringify(o.deliverables ?? []), o.sort_order ?? 100, isPackage(o)]);
    added += rows.length;
  }
  for (const p of items.filter(isPackage)) {
    // Only link a package that is new in this run or has no services yet, so a package you have edited in the CRM is left alone.
    const { rows: [pk] } = await c.query(`SELECT id, is_bundle, (SELECT count(*) FROM offer_components WHERE bundle_id = offers.id) AS n FROM offers WHERE name = $1`, [p.name]);
    if (!pk.is_bundle || Number(pk.n) > 0) continue;
    for (const s of p.includes!) {
      const { rowCount } = await c.query(`INSERT INTO offer_components (bundle_id, component_id) SELECT $1, id FROM offers WHERE name = $2 AND NOT is_bundle`, [pk.id, s]);
      linked += rowCount ?? 0;
    }
  }
  return { added, linked };
});
console.log(`Seeded ${result.added} new offer(s) (${items.length - result.added} already existed and were left alone); ${result.linked} package link(s) made.`);
process.exit(0);
