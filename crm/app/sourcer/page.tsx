import Link from "next/link";
import { query } from "@/lib/db";
import { listNiches } from "@/lib/leadConfig";
import { getBudget } from "@/lib/launch";
import { creditUsage } from "@/lib/usage";
import EnrichTab from "@/components/EnrichTab";
import FindCompanyPanel from "@/components/FindCompanyPanel";
import SectionTabs from "@/components/SectionTabs";
import { listSavedSearches } from "@/lib/savedSearchActions";
import SourcerPanel from "@/components/SourcerPanel";
import WeeklyList from "@/components/WeeklyList";
import { loadWeeklyList } from "@/lib/weeklyList";
import { parseSort } from "@/lib/weeklyListMath";
import "./sourcer.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Lead Sourcer" };

export default async function Sourcer({ searchParams }: { searchParams: Promise<{ tab?: string; scope?: string; limit?: string; sort?: string; niches?: string }> }) {
  const sp = await searchParams;
  const tab = sp.tab === "enrich" ? "enrich" : sp.tab === "company" ? "company" : sp.tab === "week" ? "week" : "search";
  return (
    <div className="sx">
      <header className="sx-head">
        <div>
          <h1 className="sx-title">Lead Sourcer</h1>
          <p className="sx-lede">Search every source at once, narrow the results, and add the businesses worth approaching. Then fill in how to reach them.</p>
        </div>
        <Link href="/companies" className="btn secondary">Companies in the CRM</Link>
      </header>
      <SectionTabs
        label="Lead Sourcer"
        current={tab}
        tabs={[
          { key: "search", label: "Search", href: "/sourcer" },
          { key: "company", label: "Find one company", href: "/sourcer?tab=company" },
          { key: "enrich", label: "Enrich", href: "/sourcer?tab=enrich" },
          { key: "week", label: "This week", href: "/sourcer?tab=week" },
        ]}
      />
      {tab === "enrich" ? <EnrichTab scope={sp.scope} limit={sp.limit} niches={sp.niches} /> : tab === "company" ? <CompanyTab /> : tab === "week" ? <WeekTab sort={sp.sort} /> : <SearchTab />}
    </div>
  );
}

async function SearchTab() {
  const [niches, budget, saved, [latest]] = await Promise.all([listNiches(), getBudget(), listSavedSearches(), query<{ id: number }>(`SELECT id FROM sourcer_runs ORDER BY id DESC LIMIT 1`)]);
  return <SourcerPanel niches={niches} budget={budget} latestRunId={latest ? Number(latest.id) : null} saved={saved} />;
}

async function WeekTab({ sort }: { sort?: string }) {
  return <WeeklyList view={await loadWeeklyList()} sort={parseSort(sort)} />;
}

async function CompanyTab() {
  const [niches, usage] = await Promise.all([listNiches(), creditUsage()]);
  return <FindCompanyPanel niches={niches} search={{ enabled: usage.search.enabled, left: Math.max(0, usage.search.cap - usage.search.used) }} />;
}
