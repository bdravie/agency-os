import Link from "next/link";
import { Building2, Check, Download, Search, Upload } from "lucide-react";
import { query } from "@/lib/db";
import { createCompany, findWebsitesAction } from "@/lib/actions";
import { nextStep } from "@/lib/nextStep";
import { gateReasons } from "@/lib/compliance";
import { fitTier, leadSettings, listNiches, shortMoney } from "@/lib/leadConfig";
import ActionForm from "@/components/ActionForm";
import VerifyAllButton from "@/components/VerifyAllButton";
import LeadSearchPanel from "@/components/LeadSearchPanel";
import { leadSearchStatus } from "@/lib/leadSearchActions";
import { Badge, EmptyState, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Companies" };

type SP = { q?: string; niche?: string; view?: string; limit?: string };

// The same filters as the counts below, so a pill and its number always agree.
/** Not ruled out by Companies House, an opt-out or the suppression list (unverified leads can still be researched, just not contacted). */
const NOT_BLOCKED = "compliance_status <> 'not_eligible' AND NOT opted_out AND NOT suppressed";

const views = (min: number): { key: string; label: string; where: string }[] => [
  { key: "", label: "All", where: "TRUE" },
  { key: "qualified", label: "Qualified", where: `filing_ok AND est_revenue_gbp >= ${Number(min)}` },
  { key: "ready", label: "Ready to email", where: "status = 'New' AND domain IS NOT NULL AND generic_email IS NOT NULL AND sendable AND filing_ok IS NOT FALSE" },
  { key: "nosite", label: "Needs website", where: `status = 'New' AND domain IS NULL AND ${NOT_BLOCKED} AND filing_ok IS NOT FALSE` },
  { key: "noemail", label: "Needs email", where: `status = 'New' AND domain IS NOT NULL AND generic_email IS NULL AND ${NOT_BLOCKED} AND filing_ok IS NOT FALSE` },
  { key: "unchecked", label: "Not verified", where: "compliance_status = 'unchecked'" },
  { key: "blocked", label: "Blocked", where: "compliance_status = 'not_eligible' OR opted_out OR suppressed" },
  { key: "followup", label: "Follow-ups due", where: "status = 'Contacted' AND followup_due IS NOT NULL AND followup_due < now() + interval '1 day'" },
  { key: "contacted", label: "Contacted", where: "status = 'Contacted'" },
  { key: "replied", label: "Replied", where: "status = 'Replied'" },
  { key: "client", label: "Clients", where: "status = 'Client'" },
  { key: "unknown", label: "Size unknown", where: "filing_ok AND est_revenue_gbp IS NULL" },
  { key: "problems", label: "Filing problems", where: "filing_ok = false" },
];

const BASE = `
  WITH c AS (
    SELECT co.id, co.name, co.domain, co.generic_email, co.niche, co.status, co.is_ltd, co.created_at,
           co.compliance_status, co.company_type, co.company_status, co.opted_out, co.opted_out_at, g.sendable, g.suppressed,
           co.filing_ok, co.fit_score, co.est_revenue_gbp::float AS est_revenue_gbp, co.est_revenue_basis, co.employees, co.accounts_type,
           (SELECT min(t.due_at) FROM tasks t WHERE t.company_id = co.id AND t.done_at IS NULL AND t.title ILIKE '%follow-up%') AS followup_due
      FROM companies co JOIN lead_gate g ON g.company_id = co.id
  )`;

export default async function Companies({ searchParams }: { searchParams: Promise<SP> }) {
  const { q = "", niche = "", view = "", limit: limitParam } = await searchParams;
  const limit = Math.min(Math.max(Number(limitParam) || 25, 25), 200);
  const { minEstRevenue } = await leadSettings();
  const VIEWS = views(minEstRevenue);
  const active = VIEWS.find((v) => v.key === view) ?? VIEWS[0];
  const [rows, niches, counts, searchNiches, latestSearch] = await Promise.all([
    query<any>(
      `${BASE} SELECT * FROM c
        WHERE (${active.where}) AND ($1 = '' OR name ILIKE '%' || $1 || '%' OR domain ILIKE '%' || $1 || '%') AND ($2 = '' OR niche = $2)
        ORDER BY (followup_due IS NULL), followup_due, fit_score DESC NULLS LAST, created_at DESC LIMIT $3`, [q, niche, limit + 1]),
    query<{ niche: string }>(`SELECT DISTINCT niche FROM companies WHERE niche IS NOT NULL ORDER BY 1`),
    query<any>(`${BASE} SELECT ${VIEWS.map((v, i) => `count(*) FILTER (WHERE ${v.where}) AS v${i}`).join(", ")} FROM c`),
    listNiches(),
    leadSearchStatus(0),
  ]);
  const more = rows.length > limit;
  const shown = rows.slice(0, limit);
  const href = (v: string) => `/companies?${new URLSearchParams({ ...(q && { q }), ...(niche && { niche }), ...(v && { view: v }) })}`;

  return (
    <>
      <PageHeader
        title="Companies"
        description="Pick a view to see who needs what. Open a company for its website, outreach email and history."
        actions={
          <>
            <a href="#find" className="btn"><Search size={16} aria-hidden /> Find new companies</a>
            <Link href="/companies/import" className="btn secondary"><Upload size={16} aria-hidden /> Import CSV</Link>
            <a href="/api/companies/export" className="btn secondary"><Download size={16} aria-hidden /> Export</a>
          </>
        }
      />

      <VerifyAllButton unchecked={Number(counts[0][`v${VIEWS.findIndex((v) => v.key === "unchecked")}`])} />

      <div className="pills" style={{ marginBottom: 12 }} role="group" aria-label="Views">
        {VIEWS.map((v, i) => (
          <Link key={v.key} href={href(v.key)} className={`pill${v.key === active.key ? " on" : ""}`}>{v.label} <span className="muted">{counts[0][`v${i}`]}</span></Link>
        ))}
      </div>

      <form className="filters">
        <input name="q" defaultValue={q} placeholder="Search name or website" aria-label="Search companies" />
        <select name="niche" defaultValue={niche} aria-label="Niche"><option value="">All niches</option>{niches.map((n) => <option key={n.niche}>{n.niche}</option>)}</select>
        {view && <input type="hidden" name="view" value={view} />}
        <button className="secondary">Search</button>
      </form>

      <details className="card" id="find" style={{ marginBottom: 16 }} open>
        <summary>Find and add companies from Companies House <span className="badge tone-good" style={{ marginLeft: 6 }}>free</span></summary>
        <div style={{ marginTop: 12 }}><LeadSearchPanel niches={searchNiches} latest={latestSearch} /></div>
      </details>

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
          <summary>Find websites with Google <span className="badge tone-warn" style={{ marginLeft: 6 }}>uses credits</span></summary>
          <p className="muted" style={{ marginTop: 8 }}>Runs only when you click. Each lookup uses one Google Places request (capped at 30 a day). The free alternative is Find contacts, which has search links and boxes ready.</p>
          <ActionForm action={findWebsitesAction} label="Find websites" busyLabel="Looking up… (about 1 second each)" style={{ maxWidth: 260 }}>
            <input name="limit" type="number" min="1" max="25" defaultValue="10" aria-label="How many" />
          </ActionForm>
        </details>
      </div>

      <div className="card table-wrap">
        {shown.length === 0 ? (
          <EmptyState title="Nothing in this view" icon={<Building2 size={22} />}>Try another view, or clear the search.</EmptyState>
        ) : (
          <table>
            <thead><tr><th>Company</th><th>Fit</th><th>Est. revenue</th><th>Status</th><th>Next step</th><th>Website</th><th>Email</th></tr></thead>
            <tbody>
              {shown.map((c: any) => {
                const reasons = gateReasons(c);
                const n = nextStep({ ...c, gate: { sendable: c.sendable, unchecked: c.compliance_status === "unchecked", reasons } });
                return (
                  <tr key={c.id}>
                    <td><Link href={`/companies/${c.id}`} style={{ fontWeight: 600 }}>{c.name}</Link><div className="muted">{c.niche}</div></td>
                    <td>{(() => { const t = fitTier(c.fit_score, c.filing_ok); return <span className={`badge tone-${t.tone}`} title={t.title}>{t.label}</span>; })()}</td>
                    <td className="muted" title={(c.est_revenue_basis ?? "No size signal in the filed accounts").replace(/GBP /g, "£")}>{c.filing_ok === false ? "–" : c.est_revenue_gbp ? `≈ ${shortMoney(c.est_revenue_gbp)}` : "Unknown"}</td>
                    <td><Badge value={c.status} /></td>
                    <td><span className={n.warn ? "error" : n.short === "Send first email" || n.short === "Send follow-up" ? "" : "muted"} style={n.short.startsWith("Send") ? { color: "var(--accent)", fontWeight: 550 } : undefined}>{n.short}</span></td>
                    <td>{c.domain ? <a href={`https://${c.domain}`} target="_blank" rel="noreferrer" className="muted">{c.domain}</a> : <span className="muted">–</span>}</td>
                    <td>{c.generic_email ? <span className="row" style={{ gap: 4, color: "var(--good)" }}><Check size={14} aria-hidden /> <span className="muted">{c.generic_email}</span></span> : <span className="muted">–</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {more && (
          <div className="row" style={{ justifyContent: "center", padding: "14px 0 4px" }}>
            <Link href={`${href(view)}${href(view).includes("?") && href(view).length > "/companies?".length ? "&" : ""}limit=${limit + 25}`} className="btn secondary">Show 25 more</Link>
          </div>
        )}
      </div>
    </>
  );
}
