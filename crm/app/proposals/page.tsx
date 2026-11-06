import Link from "next/link";
import { BookOpen, ExternalLink, FileSignature, Plus } from "lucide-react";
import { query } from "@/lib/db";
import { dateOnly } from "@/lib/format";
import { Badge, EmptyState, PageHeader } from "@/components/ui";
import { proposalName } from "@/lib/proposalName";
import NeedsYouCard from "@/components/NeedsYouCard";
import { comparePitches, COMPARE_MIN_SENT, type CompareRow, type ModeStats } from "@/lib/loomPitchMath";
import { PROPOSAL_STATUSES } from "@/lib/proposalStatus";

export const dynamic = "force-dynamic";
export const metadata = { title: "Proposals" };

const fitTone = (n: number | null) => (n === null ? "neutral" : n >= 8 ? "good" : n >= 6 ? "warn" : "bad");

export default async function Proposals({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status = "" } = await searchParams;
  const rows = await query<any>(
    `SELECT id, job_title, company_name, job_url, fit_score, status, created_at, connects_used, pitch_mode FROM proposals
      WHERE ($1 = '' OR status = $1) ORDER BY created_at DESC LIMIT 200`, [status]);
  const compare = comparePitches(await query<CompareRow>(`SELECT pitch_mode, status, loom_url, loom_recorded_at FROM proposals`));
  const statLine = (label: string, m: ModeStats) => (
    <tr><td style={{ fontWeight: 600 }}>{label}</td><td className="num">{m.sent}</td><td className="num">{m.viewed}</td><td className="num">{m.replied}</td><td className="num">{m.hired}</td><td className="num">{m.replyRate === null ? "Not enough yet" : `${m.replyRate}%`}</td></tr>
  );
  return (
    <>
      <PageHeader
        title="Proposals"
        description="Upwork proposals: paste a job post, review the draft, copy it, then track the result."
        actions={<div className="row"><Link href="/proposals/library" className="btn secondary"><BookOpen size={16} aria-hidden /> Proof and answers</Link><Link href="/proposals/new" className="btn"><Plus size={16} aria-hidden /> New proposal</Link></div>}
      />
      <NeedsYouCard href="/proposals" />
      <div className="pills" style={{ marginBottom: 16 }} aria-label="Filter by status">
        {["", ...PROPOSAL_STATUSES].map((s) => (
          <Link key={s} href={s ? `/proposals?status=${s}` : "/proposals"} className={`pill${s === status ? " on" : ""}`}>{s || "All"}</Link>
        ))}
      </div>
      <div className="card table-wrap">
        {rows.length === 0 ? (
          <EmptyState title="No proposals yet" icon={<FileSignature size={22} />}>Click New proposal and paste a job post.</EmptyState>
        ) : (
          <table>
            <thead><tr><th>Job</th><th>Fit</th><th>Status</th><th className="num">Connects</th><th>Created</th><th>Link</th></tr></thead>
            <tbody>
              {rows.map((p: any) => (
                <tr key={p.id}>
                  <td><Link href={`/proposals/${p.id}`} style={{ fontWeight: 600 }}>{proposalName(p)}</Link>{p.pitch_mode === "loom" && <span className="badge tone-violet" style={{ marginLeft: 8 }}>Loom</span>}</td>
                  <td>{p.fit_score !== null && <span className={`badge tone-${fitTone(p.fit_score)}`}>{p.fit_score}/10</span>}</td>
                  <td><Badge value={p.status} /></td>
                  <td className="num">{p.connects_used}</td>
                  <td className="muted">{dateOnly(p.created_at)}</td>
                  <td>{/^https?:\/\//i.test(p.job_url ?? "") && <a href={p.job_url} target="_blank" rel="noreferrer" className="row" style={{ gap: 4 }} aria-label={`Open ${proposalName(p)} on Upwork`}>Upwork <ExternalLink size={13} aria-hidden /></a>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {(compare.loom.sent > 0 || compare.plain.sent > 0) && (
        <section className="card table-wrap" style={{ marginTop: 16 }} aria-labelledby="compare-h">
          <h2 id="compare-h">Loom pitches against plain proposals</h2>
          <table>
            <thead><tr><th>Type</th><th className="num">Sent</th><th className="num">Viewed</th><th className="num">Replied</th><th className="num">Hired</th><th className="num">Reply rate</th></tr></thead>
            <tbody>{statLine("Loom pitch", compare.loom)}{statLine("Plain", compare.plain)}</tbody>
          </table>
          <p className="muted">{compare.enough ? "Reply rate counts Replied, Interview and Won against everything sent." : `A rate shows once a type has ${COMPARE_MIN_SENT} sent, because fewer can't tell you much.`} A Loom pitch counts once its link is added. Older proposals with a pitch pack Loom are left out.</p>
        </section>
      )}
    </>
  );
}
