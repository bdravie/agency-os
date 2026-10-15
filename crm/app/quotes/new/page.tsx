import Link from "next/link";
import { notFound } from "next/navigation";
import { query } from "@/lib/db";
import QuoteBuilder from "@/components/QuoteBuilder";

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
      <p><Link href="/quotes">← Quotes</Link></p>
      <h1>New quote</h1>
      <p className="muted">{deal.company}: {deal.title}</p>
      <QuoteBuilder dealId={dealId} offers={offers} initialIds={deal.offer_id ? [deal.offer_id] : []} />
    </>
  );
}
