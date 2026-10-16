import { query } from "@/lib/db";
import { quotePdf } from "@/lib/quote-pdf";
import type { LineItem } from "@/lib/quote";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return new Response("Not found", { status: 404 });
  const [q] = await query<any>(
    `SELECT q.*, d.title, c.name AS company FROM quotes q LEFT JOIN deals d ON d.id = q.deal_id LEFT JOIN companies c ON c.id = d.company_id WHERE q.id = $1`, [id]);
  if (!q) return new Response("Not found", { status: 404 });
  const fmt = (d: Date | string) => new Date(d).toLocaleDateString("en-GB", { dateStyle: "long" });
  const bytes = await quotePdf({
    id, company: q.company ?? "", title: q.title ?? "", items: q.line_items as LineItem[], discount: Number(q.discount_gbp),
    scope: q.scope, timeline: q.timeline, validUntil: q.valid_until ? fmt(q.valid_until) : null, created: fmt(q.created_at),
    brand: process.env.BUSINESS_NAME ?? "Your Agency", sender: process.env.SENDER_NAME ?? null,
    deposit_link: q.payment_link, subscription_link: q.subscription_link,
  });
  return new Response(Buffer.from(bytes), { headers: { "content-type": "application/pdf", "content-disposition": `inline; filename="quote-${id}.pdf"` } });
}
