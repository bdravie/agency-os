import Link from "next/link";
import { Radar } from "lucide-react";
import { query } from "@/lib/db";
import { listNiches } from "@/lib/leadConfig";
import { getBudget } from "@/lib/launch";
import EnrichTab from "@/components/EnrichTab";
import FindCompanyPanel from "@/components/FindCompanyPanel";
import { creditUsage } from "@/lib/usage";
import SourcerPanel from "@/components/SourcerPanel";
import { PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Lead Sourcer" };

export default async function Sourcer({ searchParams }: { searchParams: Promise<{ tab?: string; scope?: string; limit?: string }> }) {
  const sp = await searchParams;
  const enrich = sp.tab === "enrich", company = sp.tab === "company";
  return (
    <>
      <PageHeader title="Lead Sourcer" description="Find new businesses from every source in one search, filter them, and add the ones you want. Then fill in how to reach the ones you've added."
        actions={<Link href="/companies" className="btn secondary"><Radar size={16} aria-hidden /> Companies in the CRM</Link>} />
      <div className="seg" role="tablist" aria-label="Lead Sourcer" style={{ marginBottom: 16 }}>
        <Link href="/sourcer" className={enrich || company ? "" : "on"} role="tab" aria-selected={!enrich && !company}>Search</Link>
        <Link href="/sourcer?tab=company" className={company ? "on" : ""} role="tab" aria-selected={company}>Find one company</Link>
        <Link href="/sourcer?tab=enrich" className={enrich ? "on" : ""} role="tab" aria-selected={enrich}>Enrich</Link>
      </div>
      {enrich ? <EnrichTab scope={sp.scope} limit={sp.limit} /> : company ? <CompanyTab /> : <SearchTab />}
    </>
  );
}

async function SearchTab() {
  const [niches, budget, [latest]] = await Promise.all([
    listNiches(), getBudget(),
    query<{ id: number }>(`SELECT id FROM sourcer_runs ORDER BY id DESC LIMIT 1`),
  ]);
  return <SourcerPanel niches={niches} budget={budget} latestRunId={latest ? Number(latest.id) : null} />;
}

async function CompanyTab() {
  const [niches, usage] = await Promise.all([listNiches(), creditUsage()]);
  return <FindCompanyPanel niches={niches} search={{ enabled: usage.search.enabled, left: Math.max(0, usage.search.cap - usage.search.used) }} />;
}
