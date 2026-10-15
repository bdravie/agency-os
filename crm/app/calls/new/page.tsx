import { notFound } from "next/navigation";
import { query } from "@/lib/db";
import { callsModel } from "@/lib/llm";
import CallUploadForm from "@/components/CallUploadForm";
import CompanyPicker from "@/components/CompanyPicker";
import { PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Log a call" };

export default async function NewCall({ searchParams }: { searchParams: Promise<{ deal?: string; company?: string }> }) {
  const sp = await searchParams;
  const dealId = Number(sp.deal) || null;
  let companyId = Number(sp.company) || null, label = "";
  if (dealId) {
    const [d] = await query<any>(`SELECT d.title, d.company_id, c.name FROM deals d JOIN companies c ON c.id = d.company_id WHERE d.id = $1`, [dealId]);
    if (!d) notFound();
    companyId = d.company_id; label = `${d.name}: ${d.title}`;
  } else if (companyId) {
    const [c] = await query<{ name: string }>(`SELECT name FROM companies WHERE id = $1`, [companyId]);
    if (!c) notFound();
    label = c.name;
  }
  const [{ n }] = await query<{ n: string }>(`SELECT count(*) AS n FROM activities WHERE type = 'call_analysed' AND occurred_at::date = current_date`);
  const usage = { used: Number(n), cap: Number(process.env.CALLS_DAILY_CAP ?? 20) || 20 };
  const company = companyId ? (await query<{ name: string }>(`SELECT name FROM companies WHERE id = $1`, [companyId]))[0]?.name : null;

  return (
    <>
      <PageHeader back={{ href: "/calls", label: "Calls" }} title="Log a call" description={label ? `Against ${label}.` : "Choose the company this call was with."} />
      {companyId && company ? (
        <CallUploadForm companyId={companyId} dealId={dealId} defaultTitle={`Call with ${company}`} model={callsModel()} usage={usage} />
      ) : (
        <CompanyPicker action="/calls/new" />
      )}
    </>
  );
}
