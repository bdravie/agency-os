import Link from "next/link";
import { query } from "@/lib/db";
import { saveService } from "@/lib/actions";
import { gbp } from "@/lib/quote";

export const dynamic = "force-dynamic";

const day = (d: Date | string | null) => (d ? new Date(d).toLocaleDateString("en-GB", { dateStyle: "medium" }) : "");
const iso = (d: Date | string | null) => (d ? new Date(d).toISOString().slice(0, 10) : "");

export default async function Clients() {
  const rows = await query<any>(
    `SELECT s.id, s.company_id, s.status, s.setup_fee_gbp, s.monthly_fee_gbp, s.start_date, s.next_review_date, c.name AS company, o.name AS service
       FROM client_services s JOIN companies c ON c.id = s.company_id LEFT JOIN offers o ON o.id = s.offer_id
      ORDER BY (s.status = 'Active') DESC, c.name, s.id`);
  const active = rows.filter((r: any) => r.status === "Active");
  const mrr = active.reduce((sum: number, r: any) => sum + Number(r.monthly_fee_gbp), 0);
  const clients = new Set(active.map((r: any) => r.company_id)).size;
  const byCompany = new Map<number, any[]>();
  for (const r of rows) byCompany.set(r.company_id, [...(byCompany.get(r.company_id) ?? []), r]);

  return (
    <>
      <h1>Clients</h1>
      <div className="grid" style={{ marginBottom: 16 }}>
        <section className="card"><h2>Monthly recurring revenue</h2><div style={{ fontSize: 32, fontWeight: 700 }}>{gbp(mrr)}</div><p className="muted">Active services only · {gbp(mrr * 12)} a year</p></section>
        <section className="card"><h2>Active clients</h2><div style={{ fontSize: 32, fontWeight: 700 }}>{clients}</div><p className="muted">{active.length} active service{active.length === 1 ? "" : "s"}</p></section>
      </div>
      {byCompany.size === 0 && <p className="muted">No clients yet. When a quote is marked accepted, the client appears here.</p>}
      {[...byCompany.entries()].map(([companyId, services]) => (
        <section key={companyId} className="card" style={{ marginBottom: 12 }}>
          <h2><Link href={`/companies/${companyId}`}>{services[0].company}</Link></h2>
          {services.map((s: any) => (
            <form key={s.id} action={saveService} style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", padding: "6px 0", borderBottom: "1px solid var(--line)" }}>
              <input type="hidden" name="id" value={s.id} />
              <span style={{ flex: 1, minWidth: 200 }}><b>{s.service}</b><br /><span className="muted">{gbp(s.monthly_fee_gbp)}/mo · setup {gbp(s.setup_fee_gbp)} · started {day(s.start_date)}</span></span>
              <select name="status" defaultValue={s.status}><option>Active</option><option>Paused</option><option>Ended</option></select>
              <label className="muted">Next review <input type="date" name="next_review_date" defaultValue={iso(s.next_review_date)} /></label>
              <button>Save</button>
            </form>
          ))}
        </section>
      ))}
    </>
  );
}
