import Link from "next/link";
import { FileText } from "lucide-react";
import { query } from "@/lib/db";
import { gbp } from "@/lib/quote";
import { dateOnly } from "@/lib/format";
import { Badge, EmptyState, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Quotes" };

export default async function Quotes() {
  const rows = await query<any>(
    `SELECT q.id, q.status, q.total_setup_gbp, q.total_monthly_gbp, q.created_at, d.title, c.name AS company
       FROM quotes q LEFT JOIN deals d ON d.id = q.deal_id LEFT JOIN companies c ON c.id = d.company_id ORDER BY q.created_at DESC LIMIT 100`);
  return (
    <>
      <PageHeader title="Quotes" description="To create one, open a company and click Create quote next to its deal." />
      <div className="card table-wrap">
        {rows.length === 0 ? (
          <EmptyState title="No quotes yet" icon={<FileText size={22} />}>Quotes you create from a deal appear here.</EmptyState>
        ) : (
          <table>
            <thead><tr><th>Quote</th><th>Company</th><th className="num">Setup</th><th className="num">Monthly</th><th>Status</th><th>Created</th></tr></thead>
            <tbody>
              {rows.map((q: any) => (
                <tr key={q.id}>
                  <td><Link href={`/quotes/${q.id}`} style={{ fontWeight: 600 }}>#{q.id}</Link> <span className="muted">{q.title}</span></td>
                  <td>{q.company}</td>
                  <td className="num">{gbp(q.total_setup_gbp)}</td><td className="num">{gbp(q.total_monthly_gbp)}</td>
                  <td><Badge value={q.status} /></td><td className="muted">{dateOnly(q.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
