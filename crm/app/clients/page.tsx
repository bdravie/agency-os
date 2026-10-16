import Link from "next/link";
import { Users } from "lucide-react";
import { query } from "@/lib/db";
import { saveService } from "@/lib/actions";
import { gbp } from "@/lib/quote";
import { dateOnly } from "@/lib/format";
import { EmptyState, PageHeader, Stat } from "@/components/ui";
import ToastForm from "@/components/ToastForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Clients" };

const iso = (d: Date | string | null) => (d ? new Date(d).toISOString().slice(0, 10) : "");

export default async function Clients() {
  const rows = await query<any>(
    `SELECT s.id, s.company_id, s.status, s.setup_fee_gbp, s.monthly_fee_gbp, s.start_date, s.next_review_date, c.name AS company, o.name AS service
       FROM client_services s JOIN companies c ON c.id = s.company_id LEFT JOIN offers o ON o.id = s.offer_id
      ORDER BY (s.status = 'Active') DESC, c.name, s.id`);
  const active = rows.filter((r: any) => r.status === "Active");
  const mrr = active.reduce((sum: number, r: any) => sum + Number(r.monthly_fee_gbp), 0);
  const clients = new Set(active.map((r: any) => r.company_id)).size;
  const tracked = new Map((await query<{ id: number; company_id: number }>(`SELECT DISTINCT ON (company_id) id, company_id FROM outcomes ORDER BY company_id, id DESC`)).map((r) => [r.company_id, r.id]));
  const byCompany = new Map<number, any[]>();
  for (const r of rows) byCompany.set(r.company_id, [...(byCompany.get(r.company_id) ?? []), r]);

  return (
    <>
      <PageHeader title="Clients" description="Who you work for, what they pay, and when to review." />
      <section className="stats">
        <Stat label="Monthly recurring revenue" value={gbp(mrr)} hint={`${gbp(mrr * 12)} a year · active services only`} />
        <Stat label="Active clients" value={clients} hint={`${active.length} active service${active.length === 1 ? "" : "s"}`} />
      </section>
      {byCompany.size === 0 && <div className="card"><EmptyState title="No clients yet" icon={<Users size={22} />}>When a quote is marked accepted, the client appears here with its review tasks.</EmptyState></div>}
      <div className="stack">
        {[...byCompany.entries()].map(([companyId, services]) => (
          <section key={companyId} className="card">
            <div className="row-between">
              <h2 style={{ margin: 0 }}><Link href={`/companies/${companyId}`}>{services[0].company}</Link></h2>
              <span className="row" style={{ gap: 14 }}><Link href={`/enablement/${companyId}`} className="muted">Training</Link>
              {tracked.has(companyId) ? <Link href={`/outcomes/${tracked.get(companyId)}`} className="muted">Results</Link> : <Link href={`/outcomes/new?company=${companyId}`} className="muted">Start tracking results</Link>}</span>
            </div>
            {services.map((s: any) => (
              <ToastForm key={s.id} action={saveService} success="Client updated" className="row" style={{ padding: "8px 0", borderTop: "1px solid var(--line-soft)" }}>
                <input type="hidden" name="id" value={s.id} />
                <span style={{ flex: 1, minWidth: 220 }}><b>{s.service}</b><br /><span className="muted">{gbp(s.monthly_fee_gbp)}/mo · setup {gbp(s.setup_fee_gbp)} · started {dateOnly(s.start_date)}</span></span>
                <select name="status" defaultValue={s.status} aria-label="Status"><option>Active</option><option>Paused</option><option>Ended</option></select>
                <label className="muted">Next review <input type="date" name="next_review_date" defaultValue={iso(s.next_review_date)} /></label>
                <button className="secondary">Save</button>
              </ToastForm>
            ))}
          </section>
        ))}
      </div>
    </>
  );
}
