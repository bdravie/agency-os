import Link from "next/link";
import { Plus } from "lucide-react";
import { query } from "@/lib/db";
import { PageHeader } from "@/components/ui";
import NeedsYouCard from "@/components/NeedsYouCard";
import { comparePitches, COMPARE_MIN_SENT, type CompareRow, type ModeStats } from "@/lib/loomPitchMath";
import { isStatus } from "@/lib/proposalStatus";
import ProposalBoard from "@/components/ProposalBoard";

export const dynamic = "force-dynamic";
export const metadata = { title: "Proposals" };

export default async function Proposals({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const asked = (await searchParams).tab;
  const tab = asked === "archived" ? "archived" : isStatus(asked) ? asked : "all";
  const [rows, compareRows, [{ n: deletedCount }]] = await Promise.all([
    query<any>(
      `SELECT id, job_title, company_name, job_url, fit_score, status, pitch_mode, connects_used, to_char(status_changed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS status_changed_at,
              archived_at::text AS archived_at, archive_reason, lost_reason
         FROM proposals ORDER BY created_at DESC LIMIT 500`),
    query<CompareRow>(`SELECT pitch_mode, status, loom_url, loom_recorded_at FROM proposals`),
    query<{ n: string }>(`SELECT count(*) AS n FROM proposal_deletions`),
  ]);
  const compare = comparePitches(compareRows);
  const statLine = (label: string, m: ModeStats) => (
    <tr><td style={{ fontWeight: 600 }}>{label}</td><td className="num">{m.sent}</td><td className="num">{m.viewed}</td><td className="num">{m.replied}</td><td className="num">{m.hired}</td><td className="num">{m.replyRate === null ? "Not enough yet" : `${m.replyRate}%`}</td></tr>
  );
  return (
    <>
      <PageHeader
        title="Proposals"
        description="Upwork proposals: paste a job post, review the draft, copy it, then move it along as it is sent, viewed and answered."
        actions={<Link href="/proposals/new" className="btn"><Plus size={16} aria-hidden /> New proposal</Link>}
      />
      <NeedsYouCard href="/proposals" />
      <ProposalBoard initial={rows} tab={tab} deletedCount={Number(deletedCount)} />
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
