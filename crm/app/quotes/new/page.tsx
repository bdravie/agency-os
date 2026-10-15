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
  return (
    <>
      <PageHeader back={{ href: "/quotes", label: "Quotes" }} title="New quote" description={`${deal.company}: ${deal.title}`} />
      <QuoteBuilder dealId={dealId} offers={offers} initialIds={deal.offer_id ? [deal.offer_id] : []} />
    </>
  );
}
