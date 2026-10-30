import Link from "next/link";
import { Trash2 } from "lucide-react";
import { query } from "@/lib/db";
import { gbp } from "@/lib/quote";
import { dateOnly } from "@/lib/format";
import { deletionLabel } from "@/lib/dealDeletion";
import { stageLabel } from "@/lib/stages";
import { EmptyState, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Deletion log" };

export default async function DeletedDeals() {
  const rows = await query<any>(
    `SELECT id, deleted_at, title, company_id, company_name, stage, setup_gbp::float AS setup, monthly_gbp::float AS monthly, category, note
       FROM deal_deletions ORDER BY deleted_at DESC LIMIT 500`);
  const by = (c: string) => rows.filter((r: any) => r.category === c);
  const wasted = by("wasted_lead");
  return (
    <>
      <PageHeader
        back={{ href: "/deals", label: "Deals" }}
        title="Deletion log"
        description={`${rows.length} deals removed · ${by("admin_mistake").length} admin mistakes · ${wasted.length} wasted leads (${gbp(wasted.reduce((s: number, r: any) => s + r.setup, 0))} setup + ${gbp(wasted.reduce((s: number, r: any) => s + r.monthly, 0))}/mo in value that went nowhere)`}
      />
      <div className="card table-wrap">
        {rows.length === 0 ? (
          <EmptyState title="Nothing deleted yet" icon={<Trash2 size={22} />}>Deals you delete appear here with the reason you gave.</EmptyState>
        ) : (
          <table>
            <thead><tr><th>Deleted</th><th>Deal</th><th>Why</th><th>Note</th><th>Was in</th><th className="num">Value</th></tr></thead>
            <tbody>
              {rows.map((r: any) => (
                <tr key={r.id}>
                  <td className="muted">{dateOnly(r.deleted_at)}</td>
                  <td><b>{r.title}</b>{r.company_id && !r.title.startsWith(r.company_name ?? "\u0000") && <div className="muted"><Link href={`/companies/${r.company_id}`}>{r.company_name}</Link></div>}</td>
                  <td><span className={`badge tone-${r.category === "wasted_lead" ? "warn" : "neutral"}`}>{deletionLabel(r.category)}</span></td>
                  <td style={{ maxWidth: 360 }}>{r.note}</td>
                  <td className="muted">{stageLabel(r.stage)}</td>
                  <td className="num">{gbp(r.setup)} + {gbp(r.monthly)}/mo</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
