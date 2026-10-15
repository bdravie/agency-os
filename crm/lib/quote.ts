// Quote maths and wording live in code, never in the model. Prices in GBP.
export type LineItem = { offer_id: number; name: string; outcome: string | null; setup_gbp: number; monthly_gbp: number };

export const TERMS = [
  "50% of the setup fee is due upfront to start the build; the remaining 50% is due on go-live.",
  "The monthly fee is charged by card each month from go-live, with a 3-month minimum term.",
  "Prices are in pounds sterling. VAT is added only where applicable.",
  "The service handles business data only (for example ad metrics and sales totals), not your customers' personal data.",
];

export const gbp = (n: number | string) =>
  `£${Number(n).toLocaleString("en-GB", { minimumFractionDigits: Number(n) % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;

export function totals(items: Pick<LineItem, "setup_gbp" | "monthly_gbp">[], discount: number) {
  const setupBefore = items.reduce((s, i) => s + i.setup_gbp, 0);
  const setup = Math.max(0, Math.round((setupBefore - Math.max(0, discount)) * 100) / 100);
  const monthly = Math.round(items.reduce((s, i) => s + i.monthly_gbp, 0) * 100) / 100;
  const deposit = Math.round(setup * 50) / 100;
  return { setupBefore, setup, monthly, deposit, balance: Math.round((setup - deposit) * 100) / 100 };
}
