import Link from "next/link";
import { query } from "@/lib/db";
import { createCompany, findWebsitesAction } from "@/lib/actions";
import ActionForm from "@/components/ActionForm";

export const dynamic = "force-dynamic";

type SP = { q?: string; niche?: string; status?: string };

export default async function Companies({ searchParams }: { searchParams: Promise<SP> }) {
  const { q = "", niche = "", status = "" } = await searchParams;
  const [rows, niches, statuses] = await Promise.all([
    query<{ id: number; name: string; domain: string | null; niche: string | null; status: string; phone: string | null }>(
      `SELECT id, name, domain, niche, status, phone FROM companies
        WHERE ($1 = '' OR name ILIKE '%' || $1 || '%' OR domain ILIKE '%' || $1 || '%')
          AND ($2 = '' OR niche = $2) AND ($3 = '' OR status = $3)
        ORDER BY updated_at DESC LIMIT 200`, [q, niche, status]),
    query<{ niche: string }>(`SELECT DISTINCT niche FROM companies WHERE niche IS NOT NULL ORDER BY 1`),
    query<{ status: string }>(`SELECT DISTINCT status FROM companies ORDER BY 1`),
  ]);

  return (
    <>
      <h1>Companies</h1>
      <form className="card" style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <input name="q" defaultValue={q} placeholder="Search name or domain" autoFocus style={{ flex: 1, minWidth: 200 }} />
        <select name="niche" defaultValue={niche}><option value="">All niches</option>{niches.map((n) => <option key={n.niche}>{n.niche}</option>)}</select>
        <select name="status" defaultValue={status}><option value="">All statuses</option>{statuses.map((s) => <option key={s.status}>{s.status}</option>)}</select>
        <button>Filter</button>
        <Link href="/companies/import">Import CSV</Link>
        <a href="/api/companies/export">Export CSV</a>
      </form>

      <details className="card" style={{ marginBottom: 16 }}>
        <summary>Add company</summary>
        <form action={createCompany} style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
          <input name="name" placeholder="Company name" required />
          <input name="domain" placeholder="example.com" />
          <input name="phone" placeholder="Phone" />
          <input name="niche" placeholder="Niche (e.g. hvac)" />
          <button>Add</button>
        </form>
      </details>

      <details className="card" style={{ marginBottom: 16 }}>
        <summary>Find websites automatically (Google Places)</summary>
        <p className="muted">Looks up limited companies with no website, a few at a time, with a daily cap. Results are marked unverified: check each one before emailing.</p>
        <ActionForm action={findWebsitesAction} label="Find websites" busyLabel="Looking up… (about 1 second each)" style={{ maxWidth: 360 }}>
          <input name="limit" type="number" min="1" max="25" defaultValue="10" />
        </ActionForm>
      </details>

      <div className="card">
        <table>
          <thead><tr><th>Name</th><th>Domain</th><th>Niche</th><th>Status</th><th>Phone</th></tr></thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id}>
                <td><Link href={`/companies/${c.id}`}>{c.name}</Link></td>
                <td>{c.domain}</td><td>{c.niche}</td><td>{c.status}</td><td>{c.phone}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={5} className="muted">No companies found.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
