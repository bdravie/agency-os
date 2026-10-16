import { notFound, redirect } from "next/navigation";
import { query } from "@/lib/db";
import CompanyPicker from "@/components/CompanyPicker";
import { PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Open a client's training" };

export default async function NewEnablement({ searchParams }: { searchParams: Promise<{ company?: string }> }) {
  const id = Number((await searchParams).company) || null;
  if (id) {
    const [c] = await query(`SELECT 1 FROM companies WHERE id = $1`, [id]);
    if (!c) notFound();
    redirect(`/enablement/${id}`);
  }
  return (
    <>
      <PageHeader back={{ href: "/enablement", label: "Enablement" }} title="Open a client's training" description="Choose the client." />
      <CompanyPicker action="/enablement/new" tip="Tip: retained clients are listed on the Enablement page, so you can open them from there." />
    </>
  );
}
