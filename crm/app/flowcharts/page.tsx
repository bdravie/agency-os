import Link from "next/link";
import { Workflow } from "lucide-react";
import FlowchartList from "@/components/flowcharts/FlowchartList";
import { EmptyState, PageHeader } from "@/components/ui";
import { flowchartStore } from "@/lib/flowcharts";

export const dynamic = "force-dynamic";

export default async function Flowcharts({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const q = ((await searchParams).q ?? "").trim().slice(0, 200);
  const rows = await flowchartStore.list(q);
  return (
    <>
      <PageHeader
        title="Flowcharts"
        description="Map a process as a diagram, then export it for a proposal, a client or your own notes."
        actions={<Link href="/flowcharts/new" className="btn">New flowchart</Link>}
      />
      <form className="filters" role="search" aria-label="Search flowcharts" style={{ marginBottom: 16 }}>
        <input name="q" defaultValue={q} placeholder="Search titles and diagram text" aria-label="Search flowcharts" />
        <button className="secondary">Search</button>
        {q && <Link href="/flowcharts" className="muted">Clear</Link>}
      </form>
      <div className="card fc">
        {rows.length ? <FlowchartList rows={rows} /> : (
          <EmptyState title={q ? "Nothing matches that search" : "No flowcharts yet"} icon={<Workflow size={22} />}>
            {q ? "Try different words, or clear the search." : <>Start from a template with <Link href="/flowcharts/new">New flowchart</Link>.</>}
          </EmptyState>
        )}
      </div>
    </>
  );
}
