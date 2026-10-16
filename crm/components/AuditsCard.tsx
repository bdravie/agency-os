import Link from "next/link";
import { ClipboardCheck, FileText } from "lucide-react";
import { query } from "@/lib/db";
import { startAudit } from "@/lib/auditActions";
import { ago } from "@/lib/format";

const STATUS: Record<string, string> = { intake: "Intake", report_drafted: "Report drafted", delivered: "Delivered" };

// Audits for a client or deal, and the files saved against the client record.
export default async function AuditsCard({ companyId, dealId, withDocuments }: { companyId: number; dealId?: number; withDocuments?: boolean }) {
  const [audits, docs] = await Promise.all([
    query<any>(`SELECT id, title, status, updated_at FROM audits WHERE ${dealId ? "deal_id = $1" : "company_id = $1"} ORDER BY id DESC`, [dealId ?? companyId]),
    withDocuments ? query<any>(`SELECT id, filename, kind, created_at, size_bytes FROM company_documents WHERE company_id = $1 ORDER BY created_at DESC LIMIT 20`, [companyId]) : Promise.resolve([]),
  ]);
  return (
    <section className="card" id="audit">
      <div className="row-between">
        <h2 style={{ margin: 0 }}>{withDocuments ? "Audits & documents" : "Audit"}</h2>
        <form action={startAudit}>
          <input type="hidden" name="company_id" value={companyId} />
          {dealId && <input type="hidden" name="deal_id" value={dealId} />}
          <button className="secondary"><ClipboardCheck size={15} aria-hidden /> {audits.length ? "New audit" : "Start an audit"}</button>
        </form>
      </div>
      {audits.length === 0 && <p className="muted" style={{ marginTop: 10 }}>No audit yet. An audit lists the client&apos;s recurring tasks, ranks them, and drafts a two-page report.</p>}
      <ul style={{ marginTop: 8 }}>{audits.map((a: any) => (
        <li key={a.id} className="row-between"><Link href={`/audits/${a.id}`}>{a.title}</Link><span className="muted">{STATUS[a.status]} · {ago(a.updated_at)}</span></li>
      ))}</ul>
      {withDocuments && docs.length > 0 && (
        <>
          <div className="field-label" style={{ marginTop: 14 }}>Saved documents</div>
          <ul>{docs.map((d: any) => (
            <li key={d.id} className="row-between">
              <span className="row" style={{ gap: 6 }}><FileText size={14} aria-hidden /><a href={`/documents/${d.id}`} target="_blank" rel="noreferrer">{d.filename}</a></span>
              <span className="muted">{ago(d.created_at)} · {Math.round(d.size_bytes / 1024)} KB</span>
            </li>
          ))}</ul>
        </>
      )}
    </section>
  );
}
