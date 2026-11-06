import { Trash2 } from "lucide-react";
import { query } from "@/lib/db";
import { dateOnly } from "@/lib/format";
import { deletionLabel, statusLabel } from "@/lib/proposalStatus";
import { proposalName } from "@/lib/proposalName";
import { EmptyState, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Proposal deletion log" };

export default async function DeletedProposals() {
  const rows = await query<any>(
    `SELECT id, deleted_at, proposal_id, job_title, company_name, status, category, note FROM proposal_deletions ORDER BY deleted_at DESC LIMIT 500`);
  const count = (c: string) => rows.filter((r: any) => r.category === c).length;
  return (
    <>
      <PageHeader
        back={{ href: "/proposals", label: "Proposals" }}
        title="Deletion log"
        description={`${rows.length} proposals deleted · ${count("admin_mistake")} admin mistakes · ${count("not_a_fit")} not a fit · ${count("job_gone")} job gone`}
      />
      <div className="card table-wrap">
        {rows.length === 0 ? (
          <EmptyState title="Nothing deleted yet" icon={<Trash2 size={22} />}>Proposals you delete appear here with the reason you gave.</EmptyState>
        ) : (
          <table>
            <thead><tr><th>Deleted</th><th>Proposal</th><th>Why</th><th>Note</th><th>Was</th></tr></thead>
            <tbody>
              {rows.map((r: any) => (
                <tr key={r.id}>
                  <td className="muted">{dateOnly(r.deleted_at)}</td>
                  <td><b>{proposalName({ id: r.proposal_id, job_title: r.job_title, company_name: r.company_name })}</b></td>
                  <td><span className={`badge tone-${r.category === "admin_mistake" ? "neutral" : "warn"}`}>{deletionLabel(r.category)}</span></td>
                  <td style={{ maxWidth: 360 }}>{r.note}</td>
                  <td className="muted">{statusLabel(r.status)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
