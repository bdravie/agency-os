import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

// Everything the quick-view panel needs for one deal. Login is enforced by middleware.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return Response.json({ error: "Not found" }, { status: 404 });
  const [deal] = await query<any>(
    `SELECT d.id, d.title, d.stage::text AS stage, d.setup_value_gbp::float AS setup, d.monthly_value_gbp::float AS monthly,
            d.source, d.expected_close::text AS expected_close, d.lost_reason, d.lost_note, d.channel, d.created_at, d.updated_at, d.company_id, d.contact_id,
            c.name AS company_name, c.domain, c.generic_email, c.status AS company_status
       FROM deals d LEFT JOIN companies c ON c.id = d.company_id WHERE d.id = $1`, [id]);
  if (!deal) return Response.json({ error: "Not found" }, { status: 404 });
  const [tasks, quotes, activity, contact, offers] = await Promise.all([
    query<any>(`SELECT id, title, due_at FROM tasks WHERE deal_id = $1 AND done_at IS NULL ORDER BY due_at NULLS LAST`, [id]),
    query<any>(`SELECT id, status, total_setup_gbp::float AS setup, total_monthly_gbp::float AS monthly, created_at FROM quotes WHERE deal_id = $1 ORDER BY created_at DESC`, [id]),
    query<any>(`SELECT id, type, body, occurred_at FROM activities WHERE deal_id = $1 OR (company_id = $2 AND $2 IS NOT NULL) ORDER BY occurred_at DESC LIMIT 8`, [id, deal.company_id]),
    deal.contact_id ? query<any>(`SELECT name, role, email, phone FROM contacts WHERE id = $1`, [deal.contact_id]) : Promise.resolve([]),
    query<any>(`SELECT l.id, o.name, l.billing, l.price_gbp::float AS price, l.credit_gbp::float AS credit, l.status, l.checklist FROM deal_offers l JOIN offers o ON o.id = l.offer_id WHERE l.deal_id = $1 ORDER BY l.id`, [id]),
  ]);
  return Response.json({ deal, tasks, quotes, activity, offers, contact: contact[0] ?? null });
}
