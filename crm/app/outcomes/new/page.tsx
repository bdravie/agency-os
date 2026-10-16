import { notFound } from "next/navigation";
import { query } from "@/lib/db";
import { todayIso } from "@/lib/outcomeData";
import CompanyPicker from "@/components/CompanyPicker";
import OutcomeStartForm from "@/components/OutcomeStartForm";
import { PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Start tracking results" };

export default async function NewOutcome({ searchParams }: { searchParams: Promise<{ company?: string }> }) {
  const companyId = Number((await searchParams).company) || null;
  const [company] = companyId ? await query<{ name: string }>(`SELECT name FROM companies WHERE id = $1`, [companyId]) : [];
  if (companyId && !company) notFound();
  const [deal] = companyId ? await query<{ id: number }>(`SELECT id FROM deals WHERE company_id = $1 AND stage = 'Won' ORDER BY updated_at DESC LIMIT 1`, [companyId]) : [];
  const today = todayIso();
  return (
    <>
      <PageHeader back={{ href: "/outcomes", label: "Outcomes" }} title="Start tracking results" description={company ? `Baseline for ${company.name}.` : "Choose the client."} />
      {companyId && company
        ? <OutcomeStartForm companyId={companyId} dealId={deal?.id ?? null} company={company.name} kickoff={today} today={today} />
        : <CompanyPicker action="/outcomes/new" tip="Pick a client you are kicking off. Their won deal is linked automatically." />}
    </>
  );
}
