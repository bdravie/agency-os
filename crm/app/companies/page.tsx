import Link from "next/link";
import { Building2, Check, Download, Upload } from "lucide-react";
import { query } from "@/lib/db";
import { createCompany, findWebsitesAction } from "@/lib/actions";
import { ago } from "@/lib/format";
import ActionForm from "@/components/ActionForm";
import { Badge, EmptyState, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Companies" };

type SP = { q?: string; niche?: string; status?: string };

export default async function Companies({ searchParams }: { searchParams: Promise<SP> }) {
  const { q = "", niche = "", status = "" } = await searchParams;
  const [rows, niches, statuses, total] = await Promise.all([
    query<any>(
      `SELECT id, name, domain, generic_email, niche, status, created_at FROM companies
        WHERE ($1 = '' OR name ILIKE '%' || $1 || '%' OR domain ILIKE '%' || $1 || '%')
          AND ($2 = '' OR niche = $2) AND ($3 = '' OR status = $3)
        ORDER BY updated_at DESC LIMIT 200`, [q, niche, status]),
    query<{ niche: string }>(`SELECT DISTINCT niche FROM companies WHERE niche IS NOT NULL ORDER BY 1`),
    query<{ status: string; n: string }>(`SELECT status, count(*) AS n FROM companies GROUP BY 1 ORDER BY 2 DESC`),
    query<{ n: string }>(`SELECT count(*) AS n FROM companies`),
  ]);
  const href = (s: string) => `/companies?${new URLSearchParams({ ...(q && { q }), ...(niche && { niche }), ...(s && { status: s }) })}`;

  return (
    <>
      <PageHeader
        title="Companies"
        description={`${total[0].n} in your CRM. Open one to see its website, outreach email and history.`}
        actions={
          <>
            <Link href="/companies/import" className="btn secondary"><Upload size={16} aria-hidden /> Import CSV</Link>
            <a href="/api/companies/export" className="btn secondary"><Download size={16} aria-hidden /> Export</a>
          </>
        }
      />

      <div className="pills" style={{ marginBottom: 12 }} aria-label="Filter by status">
        <Link href={href("")} className={`pill${status === "" ? " on" : ""}`}>All</Link>
        {statuses.map((s) => (
          <Link key={s.status} href={href(s.status)} className={`pill${status === s.status ? " on" : ""}`}>{s.status} <span className="muted">{s.n}</span></Link>
        ))}
      </div>

      <form className="filters">
        <input name="q" defaultValue={q} placeholder="Search name or website" aria-label="Search companies" autoFocus />
        <select name="niche" defaultValue={niche} aria-label="Niche"><option value="">All niches</option>{niches.map((n) => <option key={n.niche}>{n.niche}</option>)}</select>
        {status && <input type="hidden" name="status" value={status} />}
        <button className="secondary">Search</button>
      </form>

      <div className="grid" style={{ marginBottom: 16 }}>
        <details className="card">
          <summary>Add a company</summary>
          <form action={createCompany} className="row" style={{ marginTop: 12 }}>
            <input name="name" placeholder="Company name" required style={{ flex: 1, minWidth: 160 }} />
            <input name="domain" placeholder="Website (example.com)" />
            <input name="phone" placeholder="Phone" />
            <input name="niche" placeholder="Niche (e.g. hvac)" />
            <button>Add</button>
          </form>
        </details>
        <details className="card">
          <summary>Find websites automatically</summary>
          <p className="muted" style={{ marginTop: 8 }}>Uses Google Places for limited companies with no website, a few at a time with a daily cap. Check each result before using it.</p>
          <ActionForm action={findWebsitesAction} label="Find websites" busyLabel="Looking up… (about 1 second each)" style={{ maxWidth: 260 }}>
            <input name="limit" type="number" min="1" max="25" defaultValue="10" aria-label="How many" />
          </ActionForm>
        </details>
      </div>

      <div className="card table-wrap">
        {rows.length === 0 ? (
          <EmptyState title="No companies match" icon={<Building2 size={22} />}>Try clearing the filters, or add or import some.</EmptyState>
        ) : (
          <table>
            <thead><tr><th>Company</th><th>Niche</th><th>Status</th><th>Website</th><th>Email</th><th>Added</th></tr></thead>
            <tbody>
              {rows.map((c: any) => (
                <tr key={c.id}>
                  <td><Link href={`/companies/${c.id}`} style={{ fontWeight: 600 }}>{c.name}</Link></td>
                  <td className="muted">{c.niche}</td>
                  <td><Badge value={c.status} /></td>
                  <td>{c.domain ? <a href={`https://${c.domain}`} target="_blank" rel="noreferrer" className="muted">{c.domain}</a> : <span className="muted">–</span>}</td>
                  <td>{c.generic_email ? <span className="row" style={{ gap: 4, color: "var(--good)" }}><Check size={14} aria-hidden /> <span className="muted">{c.generic_email}</span></span> : <span className="muted">–</span>}</td>
                  <td className="muted">{ago(c.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
