import { redirect } from "next/navigation";

// Find contacts is now the Enrich tab of Lead Sourcer.
export default async function Research({ searchParams }: { searchParams: Promise<{ scope?: string; limit?: string }> }) {
  const sp = await searchParams;
  redirect(`/sourcer?tab=enrich${sp.scope ? `&scope=${encodeURIComponent(sp.scope)}` : ""}${sp.limit ? `&limit=${encodeURIComponent(sp.limit)}` : ""}`);
}
