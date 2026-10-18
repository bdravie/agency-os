import Link from "next/link";
import { query } from "@/lib/db";
import { listNiches } from "@/lib/leadConfig";
import { getBudget } from "@/lib/launch";
import { creditUsage } from "@/lib/usage";
import EnrichTab from "@/components/EnrichTab";
import FindCompanyPanel from "@/components/FindCompanyPanel";
import SourcerPanel from "@/components/SourcerPanel";
import "./sourcer.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Lead Sourcer" };

export default async function Sourcer({ searchParams }: { searchParams: Promise<{ tab?: string; scope?: string; limit?: string }> }) {
  const sp = await searchParams;
  const tab = sp.tab === "enrich" ? "enrich" : sp.tab === "company" ? "company" : "search";
  return (
    <div className="sx">
      <header className="sx-head">
        <div>
          <h1 className="sx-title">Lead Sourcer</h1>
          <p className="sx-lede">Search every source at once, narrow the results, and add the businesses worth approaching. Then fill in how to reach them.</p>
        </div>
        <Link href="/companies" className="btn secondary">Companies in the CRM</Link>
      </header>
      <nav className="sx-tabs" role="tablist" aria-label="Lead Sourcer">
        <Link href="/sourcer" role="tab" aria-selected={tab === "search"}>Search</Link>
        <Link href="/sourcer?tab=company" role="tab" aria-selected={tab === "company"}>Find one company</Link>
        <Link href="/sourcer?tab=enrich" role="tab" aria-selected={tab === "enrich"}>Enrich</Link>
      </nav>
      {tab === "enrich" ? <EnrichTab scope={sp.scope} limit={sp.limit} /> : tab === "company" ? <CompanyTab /> : <SearchTab />}
    </div>
  );
}

async function SearchTab() {
  const [niches, budget, [latest]] = await Promise.all([listNiches(), getBudget(), query<{ id: number }>(`SELECT id FROM sourcer_runs ORDER BY id DESC LIMIT 1`)]);
  return <SourcerPanel niches={niches} budget={budget} latestRunId={latest ? Number(latest.id) : null} />;
}

async function CompanyTab() {
  const [niches, usage] = await Promise.all([listNiches(), creditUsage()]);
  return <FindCompanyPanel niches={niches} search={{ enabled: usage.search.enabled, left: Math.max(0, usage.search.cap - usage.search.used) }} />;
}
