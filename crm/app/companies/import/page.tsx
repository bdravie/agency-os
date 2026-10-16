"use client";

import { useActionState } from "react";
import { importCompanies, type ImportResult } from "@/lib/actions";
import { PageHeader } from "@/components/ui";

export default function ImportPage() {
  const [result, action, pending] = useActionState<ImportResult | null, FormData>(importCompanies, null);
  return (
    <>
      <PageHeader back={{ href: "/companies", label: "Companies" }} title="Import companies" description="Upload a CSV with a header row. Duplicates (same website) are merged and suppressed websites are skipped." />
      <form action={action} className="card stack" style={{ gap: 12, maxWidth: 560 }}>
        <p className="muted">
          Columns read: <b>name</b> (required), website or domain, phone, address, postcode, niche, company_number, source.
          Company-level data only: any contact names or personal emails in the file are ignored.
        </p>
        <input type="file" name="file" accept=".csv,text/csv" aria-label="CSV file" required />
        <button disabled={pending} style={{ alignSelf: "flex-start" }}>{pending ? "Importing…" : "Import"}</button>
        {result && <p role="status">{result.message ?? `Done: ${result.created} created, ${result.merged} merged, ${result.skipped} skipped.`}</p>}
      </form>
    </>
  );
}
