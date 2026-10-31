// Pure checks for config/offers.yaml, shared by the seeder. No database, so it can be tested on its own.
export type CatalogueOffer = {
  name?: string; billing?: string | null; includes?: string[];
  price_min_gbp?: number | null; price_max_gbp?: number | null; setup_price_gbp?: number; monthly_price_gbp?: number;
  deliverables?: string[]; default_duration_days?: number | null;
};

const BILLING = ["one_off", "setup", "monthly"];
export const isPackage = (o: CatalogueOffer) => Array.isArray(o.includes);

/** Problems with one offer from the yaml (empty list = fine). Mirrors agency.seed_offers.validate, plus the package rules. */
export function validateOffer(o: CatalogueOffer, all: CatalogueOffer[] = []): string[] {
  if (!o.name) return ["missing name"];
  const problems: string[] = [];
  if (isPackage(o)) {
    if (o.billing) problems.push("a package has no billing of its own: its price is the sum of its services");
    if (!o.includes!.length) problems.push("a package needs at least one service");
    if (new Set(o.includes).size !== o.includes!.length) problems.push("a service is listed twice");
    for (const n of o.includes!) {
      const s = all.find((x) => x.name === n);
      if (!s) problems.push(`"${n}" is not an offer in the file`);
      else if (isPackage(s)) problems.push(`"${n}" is a package: packages cannot contain packages`);
      else if (!s.billing) problems.push(`"${n}" has no billing type, so it cannot be a service`);
    }
    return problems;
  }
  const b = o.billing ?? null;
  if (b !== null && !BILLING.includes(b)) problems.push(`billing must be one of ${BILLING.join(", ")}`);
  const lo = o.price_min_gbp ?? null, hi = o.price_max_gbp ?? null;
  if ((lo === null) !== (hi === null)) problems.push("set both price_min_gbp and price_max_gbp, or neither");
  if (lo !== null && hi !== null) {
    if (lo > hi) problems.push("price_min_gbp is above price_max_gbp");
    const dflt = b === "monthly" ? o.monthly_price_gbp : o.setup_price_gbp;
    if (dflt !== undefined && (dflt < lo || dflt > hi)) problems.push(`default price ${dflt} is outside ${lo}-${hi}`);
  }
  if (b && !o.deliverables?.length) problems.push("a core offer needs a deliverables checklist");
  if (o.default_duration_days != null && o.default_duration_days <= 0) problems.push("default_duration_days must be positive");
  return problems;
}
