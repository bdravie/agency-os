import { ShieldBan } from "lucide-react";
import { query } from "@/lib/db";
import { removeSuppressionAction } from "@/lib/complianceActions";
import { dateOnly } from "@/lib/format";
import ConfirmButton from "@/components/ConfirmButton";
import SuppressionAddForm from "@/components/SuppressionAddForm";
import { EmptyState, PageHeader, Pill, Stat } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Suppression list" };

const SOURCE: Record<string, string> = { manual: "Added by hand", opt_out: "Opted out", import: "Pasted list" };

export default async function Suppression({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const q = ((await searchParams).q ?? "").trim();
  const [rows, [totals]] = await Promise.all([
    query<any>(`SELECT id, domain, email, phone, company_number, reason, source, added_at FROM suppression
                 WHERE $1 = '' OR concat_ws(' ', domain, email, phone, company_number, reason) ILIKE '%' || $1 || '%' ORDER BY added_at DESC, id DESC LIMIT 200`, [q]),
    query<any>(`SELECT count(*) AS total, count(*) FILTER (WHERE source = 'opt_out') AS opted_out,
                       (SELECT count(*) FROM lead_gate WHERE suppressed) AS leads_blocked FROM suppression`),
  ]);
  return (
    <>
      <PageHeader title="Suppression list" description="Everyone you must never contact. Every draft, list and logged send checks it first, whatever channel." />
      <section className="stats">
        <Stat label="On the list" value={Number(totals.total)} hint="emails, websites, phones, company numbers" />
        <Stat label="From opt-outs" value={Number(totals.opted_out)} hint="added automatically when a lead opts out" />
        <Stat label="Leads blocked by it" value={Number(totals.leads_blocked)} hint="companies matching an entry" />
      </section>
      <div className="stack">
        <section className="card"><h2>Add entries</h2><SuppressionAddForm /></section>
        <section className="card">
          <div className="row-between"><h2 style={{ margin: 0 }}>The list</h2>
            <form className="row" style={{ gap: 8 }}><input name="q" defaultValue={q} placeholder="Search" aria-label="Search the list" /><button className="secondary">Search</button></form></div>
          {rows.length === 0 ? <EmptyState title={q ? "No matches" : "Nothing on the list yet"} icon={<ShieldBan size={22} />}>Opt-outs are added here automatically. You can also paste addresses above.</EmptyState> : (
            <div className="table-wrap"><table>
              <thead><tr><th>Entry</th><th>Type</th><th>Reason</th><th>How</th><th>Added</th><th /></tr></thead>
              <tbody>{rows.map((r: any) => {
                const [type, value] = r.email ? ["Email", r.email] : r.domain ? ["Website", r.domain] : r.phone ? ["Phone", r.phone] : ["Company number", r.company_number];
                return (
                  <tr key={r.id}><td><b>{value}</b></td><td><Pill label={type} tone="neutral" /></td><td className="muted">{r.reason ?? "-"}</td><td className="muted">{SOURCE[r.source]}</td><td className="muted">{dateOnly(r.added_at)}</td>
                    <td><form action={removeSuppressionAction}><input type="hidden" name="id" value={r.id} /><ConfirmButton className="link" message="Remove this entry? Only do this if the person has asked to be contacted again.">Remove</ConfirmButton></form></td></tr>
                );
              })}</tbody>
            </table></div>
          )}
          {rows.length === 200 && <p className="muted" style={{ marginBottom: 0 }}>Showing the newest 200. Use search to find an older one.</p>}
        </section>
      </div>
    </>
  );
}
