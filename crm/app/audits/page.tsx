import Link from "next/link";
import { ClipboardCheck } from "lucide-react";
import { query } from "@/lib/db";
import { ago } from "@/lib/format";
import { EmptyState, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Audits" };

const STATUS: Record<string, string> = { intake: "Intake", report_drafted: "Report drafted", delivered: "Delivered" };

export default async function Audits() {
  const rows = await query<any>(
    `SELECT a.id, a.title, a.status, a.updated_at, a.company_id, a.deal_id, c.name AS company,
            (SELECT count(*) FROM audit_tasks t WHERE t.audit_id = a.id) AS tasks,
            (SELECT count(*) FROM company_documents d WHERE d.audit_id = a.id) AS pdfs
       FROM audits a JOIN companies c ON c.id = a.company_id ORDER BY a.updated_at DESC LIMIT 100`);
  return (
    <>
      <PageHeader title="Audits" description="AI Opportunity Audits: list a client's recurring tasks, see them scored and ranked, then turn the top three into a two-page report. Start one from a deal or a company." />
      <div className="card table-wrap">
        {rows.length === 0 ? (
          <EmptyState title="No audits yet" icon={<ClipboardCheck size={22} />}>Open a deal and click <b>Start an audit</b>, or do it from a company page.</EmptyState>
        ) : (
          <table>
            <thead><tr><th>Audit</th><th>Client</th><th className="num">Tasks</th><th>Status</th><th className="num">PDFs</th><th>Updated</th></tr></thead>
            <tbody>{rows.map((a: any) => (
              <tr key={a.id}>
                <td><Link href={`/audits/${a.id}`} style={{ fontWeight: 600 }}>{a.title}</Link></td>
                <td><Link href={`/companies/${a.company_id}`}>{a.company}</Link></td>
                <td className="num">{a.tasks}</td><td>{STATUS[a.status]}</td><td className="num">{a.pdfs}</td><td className="muted">{ago(a.updated_at)}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </div>
    </>
  );
}
