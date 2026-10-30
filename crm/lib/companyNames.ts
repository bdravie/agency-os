// Editing what a company is called and where it is. Pure rules, so they can be tested; the database is only touched in the action.

export type NamesInput = { trading_name?: string | null; name?: string | null; address?: string | null; postcode?: string | null };
export type NamesClean = { trading_name: string | null; name: string; address: string | null; postcode: string | null };

const clean = (v: unknown, max: number) => String(v ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
const POSTCODE = /^[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}$/i;

/** Normalises the form, or returns what is wrong with it. A blank trading name means "none" and is allowed. */
export function cleanNames(input: NamesInput): { value: NamesClean } | { error: string } {
  const name = clean(input.name, 120);
  if (name.length < 2) return { error: "The registered name (the legal name) can't be empty." };
  const trading = clean(input.trading_name, 120);
  if (trading && trading.length < 2) return { error: "The trading name is too short." };
  const postcode = clean(input.postcode, 10).toUpperCase();
  if (postcode && !POSTCODE.test(postcode)) return { error: "That doesn't look like a UK postcode (for example LS13 4NX)." };
  const tidy = postcode ? postcode.replace(/^(.+?)\s?(\d[A-Z]{2})$/, "$1 $2") : "";
  return { value: { name, trading_name: trading && trading.toLowerCase() !== name.toLowerCase() ? trading : null, address: clean(input.address, 200) || null, postcode: tidy || null } };
}

/** What changed, in words, for the activity log. */
export function describeChange(before: NamesClean, after: NamesClean): string | null {
  const bits: string[] = [];
  if (before.name !== after.name) bits.push(`registered name "${before.name}" → "${after.name}"`);
  if ((before.trading_name ?? "") !== (after.trading_name ?? "")) bits.push(after.trading_name ? `trading name ${before.trading_name ? `"${before.trading_name}" → ` : "set to "}"${after.trading_name}"` : `trading name "${before.trading_name}" removed`);
  if ((before.address ?? "") !== (after.address ?? "")) bits.push("address updated");
  if ((before.postcode ?? "") !== (after.postcode ?? "")) bits.push(`postcode ${before.postcode ?? "none"} → ${after.postcode ?? "none"}`);
  return bits.length ? bits.join("; ") : null;
}
