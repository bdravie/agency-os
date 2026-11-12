import Link from "next/link";
import { Phone, Plus } from "lucide-react";
import { query } from "@/lib/db";
import { dateOnly } from "@/lib/format";
import { KIND_LABEL, kindOf } from "@/lib/callEdit";
import SectionTabs from "@/components/SectionTabs";
import { EmptyState, PageHeader, Pill } from "@/components/ui";
import NeedsYouCard from "@/components/NeedsYouCard";

export const dynamic = "force-dynamic";
export const metadata = { title: "Calls" };

export default async function Calls({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const asked = (await searchParams).tab;
  const tab = asked && ["analysed", "saved", "failed"].includes(asked) ? asked : "all";
  const rows = await query<any>(
    `SELECT c.id, c.title, c.status, c.kind, c.occurred_at, c.follow_up_on, c.follow_up_assumed, c.company_id, c.deal_id, co.name AS company,
            (SELECT count(*) FROM call_objections o WHERE o.call_id = c.id) AS objections
       FROM calls c JOIN companies co ON co.id = c.company_id ORDER BY c.occurred_at DESC, c.id DESC LIMIT 200`);
  const countOf = (s: string) => rows.filter((r: any) => r.status === s).length;
  const visible = tab === "all" ? rows : rows.filter((r: any) => r.status === tab);
  return (
    <>
      <PageHeader
        title="Calls"
        description="Log phone calls, video calls and in-person meetings: upload a transcript or paste your notes (you can edit notes later), and let AI pull out the pains, budget signals, objections and next step. Objections build up in the Objection Library."
        actions={<Link href="/calls/new" className="btn"><Plus size={16} aria-hidden /> Log a call or meeting</Link>}
      />
      <NeedsYouCard href="/calls" />
      <SectionTabs
        label="Calls views"
        current={tab}
        tabs={[
          { key: "all", label: "All", href: "/calls", count: rows.length },
          { key: "analysed", label: "Analysed", href: "/calls?tab=analysed", count: countOf("analysed") },
          { key: "saved", label: "Saved", href: "/calls?tab=saved", count: countOf("saved"), hot: countOf("saved") > 0 },
          { key: "failed", label: "Failed", href: "/calls?tab=failed", count: countOf("failed") },
        ]}
        right={[
          { key: "objections", label: "Objection Library", href: "/objections" },
        ]}
      />
      <div className="card table-wrap">
        {visible.length === 0 ? (
          <EmptyState title="No calls in this view" icon={<Phone size={22} />}>Try another tab, open a deal and click <b>Log a call or meeting</b>, or use the button above.</EmptyState>
        ) : (
          <table>
            <thead><tr><th>Call</th><th>Client</th><th>Type</th><th>Date</th><th>Status</th><th className="num">Objections</th><th>Follow-up</th></tr></thead>
            <tbody>{visible.map((c: any) => (
              <tr key={c.id}>
                <td><Link href={`/calls/${c.id}`} style={{ fontWeight: 600 }}>{c.title}</Link></td>
                <td><Link href={`/companies/${c.company_id}`}>{c.company}</Link></td>
                <td className="muted">{KIND_LABEL[kindOf(c.kind)]}</td>
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
