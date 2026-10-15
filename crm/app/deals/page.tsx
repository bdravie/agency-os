import { query } from "@/lib/db";
import { STAGES } from "@/lib/stages";
import { gbp } from "@/lib/quote";
import Board from "@/components/Board";
import { PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Deals" };

export default async function Deals() {
  const rows = await query<any>(
    `SELECT d.id, d.title, d.stage::text AS stage, d.company_id, c.name AS company_name,
            d.setup_value_gbp::float AS setup, d.monthly_value_gbp::float AS monthly
       FROM deals d LEFT JOIN companies c ON c.id = d.company_id
      ORDER BY d.updated_at DESC`);
  const open = rows.filter((r: any) => r.stage !== "Won" && r.stage !== "Lost");
  return (
    <>
      <PageHeader
        title="Deals"
        description={`${open.length} open · ${gbp(open.reduce((s: number, r: any) => s + r.setup, 0))} setup and ${gbp(open.reduce((s: number, r: any) => s + r.monthly, 0))}/mo in the pipeline. Use ◀ ▶ or drag a card to change its stage. Add deals from a company page.`}
      />
      <Board initial={rows} stages={STAGES} />
    </>
  );
}
