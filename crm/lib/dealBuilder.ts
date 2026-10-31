// Pure rules for building a deal from services, packages and custom services. No database, so it can be tested on its own.
import { BILLING, type Billing } from "./dealOffers.ts";

export type BuilderLine = {
  offerId: number | null;          // null = a custom service
  name: string;                    // the custom service's name (ignored when offerId is set)
  billing: string; price: number; durationDays: number | null; bundleName: string | null;
};
export type CleanLine = { offerId: number | null; customName: string | null; billing: Billing; price: number; durationDays: number | null; bundleName: string | null };

export const MAX_LINES = 30;
const isBilling = (b: string): b is Billing => BILLING.some((x) => x.code === b);
const round2 = (n: number) => Math.round(n * 100) / 100;

/** Checks what the browser sent. Returns clean lines, or the first problem in words the owner can act on. */
export function cleanLines(lines: unknown, knownBilling: Map<number, string>): { lines: CleanLine[] } | { error: string } {
  if (!Array.isArray(lines) || lines.length === 0) return { error: "Add at least one service or package first." };
  if (lines.length > MAX_LINES) return { error: `A deal can carry up to ${MAX_LINES} lines.` };
  const out: CleanLine[] = [];
  for (const raw of lines as Partial<BuilderLine>[]) {
    const price = Number(raw.price);
    if (!Number.isFinite(price) || price < 0) return { error: "Every price must be a number of 0 or more." };
    const days = raw.durationDays == null ? null : Math.round(Number(raw.durationDays));
    if (days !== null && (!Number.isFinite(days) || days <= 0)) return { error: "Days must be at least 1." };
    const bundleName = typeof raw.bundleName === "string" && raw.bundleName.trim() ? raw.bundleName.trim().slice(0, 80) : null;
    if (raw.offerId != null) {
      const billing = knownBilling.get(Number(raw.offerId));
      if (!billing || !isBilling(billing)) return { error: "One of the services is no longer available. Reload the page and try again." };
      out.push({ offerId: Number(raw.offerId), customName: null, billing, price: round2(price), durationDays: days, bundleName });
    } else {
      const name = String(raw.name ?? "").trim();
      if (!name) return { error: "Give every custom service a name." };
      if (name.length > 80) return { error: "Custom service names can be up to 80 characters." };
      const billing = String(raw.billing ?? "");
      if (!isBilling(billing)) return { error: `Pick how "${name}" is billed.` };
      out.push({ offerId: null, customName: name, billing, price: round2(price), durationDays: days, bundleName: null });
    }
  }
  return { lines: out };
}

/** A sensible deal title when none is typed: the package name, or the first service, plus "and more" for a mixed deal. */
export function suggestTitle(lines: { name: string; bundleName: string | null }[]): string {
  if (lines.length === 0) return "";
  const bundles = [...new Set(lines.map((l) => l.bundleName).filter(Boolean))] as string[];
  const first = bundles[0] ?? lines[0].name;
  const others = bundles.length > 1 ? bundles.length - 1 : bundles.length === 1 ? lines.filter((l) => !l.bundleName).length : lines.length - 1;
  return others > 0 ? `${first} + ${others} more` : first;
}
