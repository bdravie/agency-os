import Link from "next/link";
import { FileSignature, Plus } from "lucide-react";
import { query } from "@/lib/db";
import { dateOnly } from "@/lib/format";
import { Badge, EmptyState, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Proposals" };

const fitTone = (n: number | null) => (n === null ? "neutral" : n >= 8 ? "good" : n >= 6 ? "warn" : "bad");

export default async function Proposals({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status = "" } = await searchParams;
  const rows = await query<any>(
    `SELECT id, job_title, fit_score, status, created_at, connects_used FROM proposals
      WHERE ($1 = '' OR status = $1) ORDER BY created_at DESC LIMIT 200`, [status]);
  return (
    <>
      <PageHeader
        title="Proposals"
        description="Upwork proposals: paste a job post, review the draft, copy it, then track the result."
        actions={<Link href="/proposals/new" className="btn"><Plus size={16} aria-hidden /> New proposal</Link>}
      />
      <div className="pills" style={{ marginBottom: 16 }} aria-label="Filter by status">
        {["", "Draft", "Sent", "Interview", "Won", "Lost"].map((s) => (
          <Link key={s} href={s ? `/proposals?status=${s}` : "/proposals"} className={`pill${s === status ? " on" : ""}`}>{s || "All"}</Link>
        ))}
      </div>
      <div className="card table-wrap">
        {rows.length === 0 ? (
          <EmptyState title="No proposals yet" icon={<FileSignature size={22} />}>Click New proposal and paste a job post.</EmptyState>
        ) : (
          <table>
            <thead><tr><th>Job</th><th>Fit</th><th>Status</th><th className="num">Connects</th><th>Created</th></tr></thead>
            <tbody>
              {rows.map((p: any) => (
                <tr key={p.id}>
                  <td><Link href={`/proposals/${p.id}`} style={{ fontWeight: 600 }}>{p.job_title || `Proposal #${p.id}`}</Link></td>
                  <td>{p.fit_score !== null && <span className={`badge tone-${fitTone(p.fit_score)}`}>{p.fit_score}/10</span>}</td>
                  <td><Badge value={p.status} /></td>
                  <td className="num">{p.connects_used}</td>
                  <td className="muted">{dateOnly(p.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
