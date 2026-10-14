"use client";

import Link from "next/link";
import { useActionState } from "react";
import { importCompanies, type ImportResult } from "@/lib/actions";

export default function ImportPage() {
  const [result, action, pending] = useActionState<ImportResult | null, FormData>(importCompanies, null);
  return (
    <>
      <h1>Import companies</h1>
      <form action={action} className="card" style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 520 }}>
        <p className="muted">
          CSV with a header row. Columns read: name (required), domain or website, phone, address, postcode, niche, company_number, source.
          Company-level data only: any contact names or personal emails in the file are ignored. Duplicates (same domain) are merged
          and suppressed domains are skipped.
        </p>
        <input type="file" name="file" accept=".csv,text/csv" required />
        <button disabled={pending}>{pending ? "Importing…" : "Import"}</button>
        {result && (
          <p>{result.message ?? `Done: ${result.created} created, ${result.merged} merged, ${result.skipped} skipped.`}</p>
        )}
        <Link href="/companies">Back to companies</Link>
      </form>
    </>
  );
}
