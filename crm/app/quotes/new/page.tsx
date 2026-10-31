import { notFound } from "next/navigation";
import { query } from "@/lib/db";
import QuoteBuilder from "@/components/QuoteBuilder";
import { PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function NewQuote({ searchParams }: { searchParams: Promise<{ deal?: string }> }) {
  const dealId = Number((await searchParams).deal);
  if (!Number.isInteger(dealId)) notFound();
  const [deal] = await query<any>(
    `SELECT d.id, d.title, d.offer_id, c.name AS company FROM deals d LEFT JOIN companies c ON c.id = d.company_id WHERE d.id = $1`, [dealId]);
  if (!deal) notFound();
  const offers = (await query<any>(`SELECT id, name, outcome, setup_price_gbp::float AS setup, monthly_price_gbp::float AS monthly FROM offers WHERE active AND NOT is_bundle ORDER BY niche NULLS LAST, name`));
  const lines = await query<any>(`SELECT offer_id, billing, price_gbp::float AS price, credit_gbp::float AS credit FROM deal_offers WHERE deal_id = $1 ORDER BY id`, [dealId]);
  const custom = lines.filter((l: any) => l.offer_id === null);
  lines.splice(0, lines.length, ...lines.filter((l: any) => l.offer_id !== null));
  const ids = [...new Set(lines.map((l: any) => l.offer_id))] as number[];
  const prices: Record<number, { setup: number; monthly: number }> = {};
  for (const l of lines) { const p = (prices[l.offer_id] ??= { setup: 0, monthly: 0 }); if (l.billing === "monthly") p.monthly += l.price; else p.setup += l.price; }
  const credit = lines.reduce((s: number, l: any) => s + l.credit, 0);
  return (
    <>
      <PageHeader back={{ href: "/quotes", label: "Quotes" }} title="New quote" description={`${deal.company}: ${deal.title}`} />
      {custom.length > 0 && <p className="card" role="note" style={{ marginBottom: 14 }}>This deal has {custom.length} custom service{custom.length === 1 ? "" : "s"} ({custom.map((l: any) => `£${l.price.toLocaleString("en-GB")}`).join(", ")}) that a quote cannot carry yet. Creating a quote here will not change the deal's one-off and monthly values, so add the custom amounts to the quote by hand.</p>}
      <QuoteBuilder dealId={dealId} offers={offers} initialIds={ids.length ? ids : deal.offer_id ? [deal.offer_id] : []} initialPrices={prices} initialDiscount={credit} />
    </>
  );
}
