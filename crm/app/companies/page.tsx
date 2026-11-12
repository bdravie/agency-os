import Link from "next/link";
import { Building2, Check, Download, Search, Upload } from "lucide-react";
import { query } from "@/lib/db";
import { createCompany } from "@/lib/actions";
import { nextStep } from "@/lib/nextStep";
import { gateReasons } from "@/lib/compliance";
import { buildListQuery, FILTERS, type FilterKey } from "@/lib/companyFilters";
import { TIER_TONE, explainSuitability } from "@/lib/suitability";
import ListFilters from "@/components/ListFilters";
import SectionTabs from "@/components/SectionTabs";
import { leadSettings, shortMoney } from "@/lib/leadConfig";
import VerifyAllButton from "@/components/VerifyAllButton";
import { Badge, EmptyState, PageHeader, Pill } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Companies" };

type SP = { q?: string; niche?: string; view?: string; limit?: string; sort?: string; area?: string } & Partial<Record<FilterKey, string>>;

// The same filters as the counts below, so a pill and its number always agree.
// Views are about where a company is in the workflow. What one company still needs (a website, an email, verifying, why it is
// blocked, its size or filing problems) is shown on its own page and in the Next step column, so those are not views here.
const views = (min: number): { key: string; label: string; where: string }[] => [
  { key: "", label: "All", where: "TRUE" },
  { key: "qualified", label: "Qualified", where: `filing_ok AND est_revenue_gbp >= ${Number(min)}` },
  { key: "followup", label: "Follow-ups due", where: "status = 'Contacted' AND followup_due IS NOT NULL AND followup_due < now() + interval '1 day'" },
  { key: "contacted", label: "Contacted", where: "status = 'Contacted'" },
  { key: "replied", label: "Replied", where: "status = 'Replied'" },
  { key: "client", label: "Clients", where: "status = 'Client'" },
];

const BASE = `
  WITH c AS (
    SELECT co.id, co.display_name AS name, co.name AS legal_name, co.domain, co.generic_email, co.niche, co.status, co.is_ltd, co.created_at,
           co.compliance_status, co.company_type, co.company_status, co.opted_out, co.opted_out_at, g.sendable, g.suppressed,
           co.filing_ok, co.fit_score, co.est_revenue_gbp::float AS est_revenue_gbp, co.est_revenue_basis, co.employees, co.accounts_type,
           co.source, co.phone, co.city, co.postcode, co.address, co.linkedin_url, co.instagram_url, co.facebook_url, co.contact_url, co.maps_rating::float AS maps_rating, co.maps_reviews,
           su.score AS suitability, su.tier, su.excluded, su.fit_pts, su.eligible_pts, su.website_pts, su.email_pts, su.phone_pts, su.rating_pts, su.reviews_pts,
           (co.created_at >= current_date AND NOT (co.generic_email IS NOT NULL OR co.linkedin_url IS NOT NULL OR co.instagram_url IS NOT NULL OR co.facebook_url IS NOT NULL OR co.contact_url IS NOT NULL)) AS fresh,
           (SELECT min(t.due_at) FROM tasks t WHERE t.company_id = co.id AND t.done_at IS NULL AND t.title ILIKE '%follow-up%') AS followup_due
      FROM companies co JOIN lead_gate g ON g.company_id = co.id JOIN lead_suitability su ON su.company_id = co.id
  )`;

export default async function Companies({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const { q = "", niche = "", view = "", limit: limitParam } = sp;
  const limit = Math.min(Math.max(Number(limitParam) || 25, 25), 200);
  const { minEstRevenue } = await leadSettings();
  const VIEWS = views(minEstRevenue);
  const active = VIEWS.find((v) => v.key === view) ?? VIEWS[0];
  const list = buildListQuery(sp, 4), forCounts = buildListQuery(sp, 1);   // sort and filters: fixed choices only, the typed area is a parameter
  const [rows, niches, counts] = await Promise.all([
    query<any>(
      `${BASE} SELECT * FROM c
        WHERE (${active.where}) AND ($1 = '' OR name ILIKE '%' || $1 || '%' OR legal_name ILIKE '%' || $1 || '%' OR domain ILIKE '%' || $1 || '%') AND ($2 = '' OR niche = $2)${list.where.map((w) => ` AND ${w}`).join("")}
        ORDER BY ${list.order} LIMIT $3`, [q, niche, limit + 1, ...list.params]),
    query<{ niche: string }>(`SELECT DISTINCT niche FROM companies WHERE niche IS NOT NULL ORDER BY 1`),
    query<any>(`${BASE} SELECT ${VIEWS.map((v, i) => `count(*) FILTER (WHERE ${v.where}) AS v${i}`).join(", ")}, count(*) FILTER (WHERE compliance_status = 'unchecked') AS unchecked FROM c${forCounts.where.length ? ` WHERE ${forCounts.where.join(" AND ")}` : ""}`, forCounts.params),
  ]);
  const keep: Record<string, string> = { ...(q && { q }), ...(niche && { niche }), ...(sp.sort && { sort: sp.sort }), ...(sp.area && { area: sp.area }),
    ...Object.fromEntries((Object.keys(FILTERS) as FilterKey[]).filter((k) => sp[k]).map((k) => [k, sp[k]!])) };
  const more = rows.length > limit;
  const shown = rows.slice(0, limit);
  const href = (v: string) => `/companies?${new URLSearchParams({ ...keep, ...(v && { view: v }) })}`;

  return (
    <>
      <PageHeader
        title="Companies"
        description="Pick a view to see where each company is. Open a company to see what it still needs and whether you can contact it."
        actions={
          <>
            <Link href="/sourcer" className="btn"><Search size={16} aria-hidden /> Lead Sourcer</Link>
            <Link href="/companies/import" className="btn secondary"><Upload size={16} aria-hidden /> Import CSV</Link>
            <a href="/api/companies/export" className="btn secondary"><Download size={16} aria-hidden /> Export</a>
          </>
        }
      />

      <VerifyAllButton unchecked={Number(counts[0].unchecked)} />

      <details className="card" style={{ marginBottom: 16 }}>
        <summary>Add a company by hand</summary>
        <form action={createCompany} className="row" style={{ marginTop: 12 }}>
          <input name="name" placeholder="Company name" required style={{ flex: 1, minWidth: 160 }} />
          <input name="domain" placeholder="Website (example.com)" />
          <input name="phone" placeholder="Phone" />
          <input name="niche" placeholder="Niche (e.g. hvac)" />
          <button className="secondary">Add</button>
        </form>
        <p className="muted" style={{ marginBottom: 0 }}>To find new businesses, use <Link href="/sourcer">Lead Sourcer</Link>.</p>
      </details>

      <SectionTabs
        label="Company views"
        current={active.key}
        tabs={VIEWS.map((v, i) => {
          const n = Number(counts[0][`v${i}`]);
          return { key: v.key, label: v.label, href: href(v.key), count: n, hot: v.key === "followup" && n > 0 };
        })}
      />

      <ListFilters niches={niches.map((n) => n.niche)} current={{ q, niche, view, sort: sp.sort ?? "", area: sp.area ?? "", added: sp.added ?? "", tier: sp.tier ?? "", source: sp.source ?? "", contact: sp.contact ?? "", rev: sp.rev ?? "", rating: sp.rating ?? "" }} />

      <div className="card table-wrap">
        {shown.length === 0 ? (
          <EmptyState title="Nothing in this view" icon={<Building2 size={22} />}>Try another view, or clear the search.</EmptyState>
        ) : (
          <table>
            <thead><tr><th>Company</th><th>Suitability</th><th>Est. revenue</th><th>Status</th><th>Next step</th><th>Website</th><th>Email</th></tr></thead>
            <tbody>
              {shown.map((c: any) => {
                const reasons = gateReasons(c);
                const n = nextStep({ ...c, gate: { sendable: c.sendable, unchecked: c.compliance_status === "unchecked" && !c.sendable, reasons } });
                return (
                  <tr key={c.id} className={c.fresh ? "row-new" : undefined}>
                    <td><Link href={`/companies/${c.id}`} style={{ fontWeight: 600 }}>{c.name}</Link>{c.legal_name !== c.name && <span className="muted" style={{ fontWeight: 400 }}> · registered as {c.legal_name}</span>}{c.fresh && <> <Pill label="New today" tone="blue" /></>}<div className="muted">{[c.niche, c.city ?? c.postcode?.split(" ")[0]].filter(Boolean).join(" · ")}</div></td>
                    <td><span title={explainSuitability(c).join("\n")}><Pill label={`${c.tier}${c.tier === "Skip" ? "" : ` · ${c.suitability}`}`} tone={TIER_TONE[c.tier] ?? "neutral"} /></span></td>
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
