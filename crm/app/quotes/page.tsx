import Link from "next/link";
import { FileText } from "lucide-react";
import { query } from "@/lib/db";
import { gbp } from "@/lib/quote";
import { dateOnly } from "@/lib/format";
import SectionTabs from "@/components/SectionTabs";
import { Badge, EmptyState, PageHeader } from "@/components/ui";
import NeedsYouCard from "@/components/NeedsYouCard";

export const dynamic = "force-dynamic";
export const metadata = { title: "Quotes" };

export default async function Quotes({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const asked = (await searchParams).tab;
  const tab = asked && ["draft", "sent", "accepted", "declined"].includes(asked.toLowerCase()) ? asked.toLowerCase() : "all";
  const rows = await query<any>(
    `SELECT q.id, q.status, q.total_setup_gbp, q.total_monthly_gbp, q.created_at, d.title, c.name AS company
       FROM quotes q LEFT JOIN deals d ON d.id = q.deal_id LEFT JOIN companies c ON c.id = d.company_id ORDER BY q.created_at DESC LIMIT 100`);
  const countOf = (s: string) => rows.filter((r: any) => String(r.status).toLowerCase() === s).length;
  const visible = tab === "all" ? rows : rows.filter((r: any) => String(r.status).toLowerCase() === tab);
  return (
    <>
      <PageHeader title="Quotes" description="To create one, open a company and click Create quote next to its deal." />
      <NeedsYouCard href="/quotes" />
      <SectionTabs
        label="Quotes views"
        current={tab}
        tabs={[
          { key: "all", label: "All", href: "/quotes", count: rows.length },
          { key: "draft", label: "Draft", href: "/quotes?tab=draft", count: countOf("draft"), hot: countOf("draft") > 0 },
          { key: "sent", label: "Sent", href: "/quotes?tab=sent", count: countOf("sent") },
          { key: "accepted", label: "Accepted", href: "/quotes?tab=accepted", count: countOf("accepted") },
          { key: "declined", label: "Declined", href: "/quotes?tab=declined", count: countOf("declined") },
        ]}
      />
      <div className="card table-wrap">
        {visible.length === 0 ? (
          <EmptyState title="No quotes in this view" icon={<FileText size={22} />}>Quotes you create from a deal appear here.</EmptyState>
        ) : (
          <table>
            <thead><tr><th>Quote</th><th>Company</th><th className="num">Setup</th><th className="num">Monthly</th><th>Status</th><th>Created</th></tr></thead>
            <tbody>
              {visible.map((q: any) => (
                <tr key={q.id}>
                  <td><Link href={`/quotes/${q.id}`} style={{ fontWeight: 600 }}>#{q.id}</Link> <span className="muted">{q.title}</span></td>
                  <td>{q.company}</td>
                  <td className="num">{gbp(q.total_setup_gbp)}</td><td className="num">{gbp(q.total_monthly_gbp)}</td>
                  <td><Badge value={q.status} /></td><td className="muted">{dateOnly(q.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
