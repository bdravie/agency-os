import Link from "next/link";
import { Phone, Plus } from "lucide-react";
import { query } from "@/lib/db";
import { dateOnly } from "@/lib/format";
import { EmptyState, PageHeader, Pill } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Calls" };

export default async function Calls() {
  const rows = await query<any>(
    `SELECT c.id, c.title, c.status, c.occurred_at, c.follow_up_on, c.follow_up_assumed, c.company_id, c.deal_id, co.name AS company,
            (SELECT count(*) FROM call_objections o WHERE o.call_id = c.id) AS objections
       FROM calls c JOIN companies co ON co.id = c.company_id ORDER BY c.occurred_at DESC, c.id DESC LIMIT 200`);
  return (
    <>
      <PageHeader
        title="Calls"
        description="Upload a transcript or paste your notes, and let AI pull out the pains, budget signals, objections and next step. Objections build up in the Objection Library."
        actions={<><Link href="/objections" className="btn secondary">Objection Library</Link><Link href="/calls/new" className="btn"><Plus size={16} aria-hidden /> Log a call</Link></>}
      />
      <div className="card table-wrap">
        {rows.length === 0 ? (
          <EmptyState title="No calls yet" icon={<Phone size={22} />}>Open a deal and click <b>Log a call</b>, or use the button above.</EmptyState>
        ) : (
          <table>
            <thead><tr><th>Call</th><th>Client</th><th>Date</th><th>Status</th><th className="num">Objections</th><th>Follow-up</th></tr></thead>
            <tbody>{rows.map((c: any) => (
              <tr key={c.id}>
                <td><Link href={`/calls/${c.id}`} style={{ fontWeight: 600 }}>{c.title}</Link></td>
                <td><Link href={`/companies/${c.company_id}`}>{c.company}</Link></td>
                <td className="muted">{dateOnly(c.occurred_at)}</td>
                <td><Pill label={c.status === "analysed" ? "Analysed" : c.status === "failed" ? "Failed" : "Saved"} tone={c.status === "analysed" ? "good" : c.status === "failed" ? "bad" : "neutral"} /></td>
                <td className="num">{c.status === "analysed" ? c.objections : "–"}</td>
                <td className="muted">{c.follow_up_on ? `${new Date(c.follow_up_on).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}${c.follow_up_assumed ? " (assumed)" : ""}` : "–"}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </div>
    </>
  );
}
