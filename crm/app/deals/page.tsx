import { query } from "@/lib/db";
import { STAGES } from "@/lib/actions";
import Board from "@/components/Board";

export const dynamic = "force-dynamic";

export default async function Deals() {
  const rows = await query<any>(
    `SELECT d.id, d.title, d.stage::text AS stage, d.company_id, c.name AS company_name,
            d.setup_value_gbp::float AS setup, d.monthly_value_gbp::float AS monthly
       FROM deals d LEFT JOIN companies c ON c.id = d.company_id
      ORDER BY d.updated_at DESC`);
  return (
    <>
      <h1>Deals</h1>
      <p className="muted">Drag a card to another column to change its stage. Add deals from a company page.</p>
      <Board initial={rows} stages={STAGES} />
    </>
  );
}
