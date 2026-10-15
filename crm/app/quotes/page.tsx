import Link from "next/link";
import { query } from "@/lib/db";
import { gbp } from "@/lib/quote";

export const dynamic = "force-dynamic";

export default async function Quotes() {
  const rows = await query<any>(
    `SELECT q.id, q.status, q.total_setup_gbp, q.total_monthly_gbp, q.created_at, d.title, c.name AS company
       FROM quotes q LEFT JOIN deals d ON d.id = q.deal_id LEFT JOIN companies c ON c.id = d.company_id ORDER BY q.created_at DESC LIMIT 100`);
  return (
    <>
      <h1>Quotes</h1>
      <p className="muted">Create a quote from a company's deal (use <b>Create quote</b> next to the deal on the company page).</p>
      <div className="card">
        <table>
          <thead><tr><th>#</th><th>Company</th><th>Deal</th><th>Setup</th><th>Monthly</th><th>Status</th></tr></thead>
          <tbody>
            {rows.map((q: any) => (
              <tr key={q.id}>
                <td><Link href={`/quotes/${q.id}`}>#{q.id}</Link></td><td>{q.company}</td><td>{q.title}</td>
                <td>{gbp(q.total_setup_gbp)}</td><td>{gbp(q.total_monthly_gbp)}</td><td>{q.status}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={6} className="muted">No quotes yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
