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
  const offers = (await query<any>(`SELECT id, name, outcome, setup_price_gbp::float AS setup, monthly_price_gbp::float AS monthly FROM offers WHERE active ORDER BY niche NULLS LAST, name`));
  const lines = await query<any>(`SELECT offer_id, billing, price_gbp::float AS price, credit_gbp::float AS credit FROM deal_offers WHERE deal_id = $1 ORDER BY id`, [dealId]);
  const ids = [...new Set(lines.map((l: any) => l.offer_id))] as number[];
  const prices: Record<number, { setup: number; monthly: number }> = {};
  for (const l of lines) { const p = (prices[l.offer_id] ??= { setup: 0, monthly: 0 }); if (l.billing === "monthly") p.monthly += l.price; else p.setup += l.price; }
  const credit = lines.reduce((s: number, l: any) => s + l.credit, 0);
  return (
    <>
      <PageHeader back={{ href: "/quotes", label: "Quotes" }} title="New quote" description={`${deal.company}: ${deal.title}`} />
      <QuoteBuilder dealId={dealId} offers={offers} initialIds={ids.length ? ids : deal.offer_id ? [deal.offer_id] : []} initialPrices={prices} initialDiscount={credit} />
    </>
  );
}
