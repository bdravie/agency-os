import Link from "next/link";
import { Compass } from "lucide-react";
import { query } from "@/lib/db";
import { fitTier, leadSettings, shortMoney } from "@/lib/leadConfig";
import { creditUsage } from "@/lib/usage";
import ContactDetailsForm from "@/components/ContactDetailsForm";
import { EmptyState, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Find contacts" };

export default async function Research({ searchParams }: { searchParams: Promise<{ scope?: string; limit?: string }> }) {
  const { scope = "", limit: limitParam } = await searchParams;
  const limit = Math.min(Math.max(Number(limitParam) || 10, 10), 100);
  const { minEstRevenue } = await leadSettings();
  const includeUnknown = scope === "all";
  const [rows, counts, usage] = await Promise.all([
    query<any>(
      `SELECT id, name, postcode, company_number, domain, generic_email, phone, linkedin_url, instagram_url, facebook_url, contact_url, domain_verified, site_signals,
              fit_score, filing_ok, est_revenue_gbp::float AS est, accounts_type, employees, niche
         FROM companies c
        WHERE status = 'New' AND compliance_status <> 'not_eligible' AND filing_ok IS NOT FALSE AND source IS DISTINCT FROM 'demo'
          AND generic_email IS NULL AND linkedin_url IS NULL AND instagram_url IS NULL AND facebook_url IS NULL AND contact_url IS NULL
          AND (est_revenue_gbp >= $1 ${includeUnknown ? "OR est_revenue_gbp IS NULL" : ""})
          AND EXISTS (SELECT 1 FROM lead_gate g WHERE g.company_id = c.id AND NOT g.opted_out AND NOT g.suppressed)
        ORDER BY fit_score DESC NULLS LAST, created_at LIMIT $2`, [minEstRevenue, limit + 1]),
    query<any>(`SELECT count(*) FILTER (WHERE generic_email IS NOT NULL OR linkedin_url IS NOT NULL OR instagram_url IS NOT NULL OR facebook_url IS NOT NULL OR contact_url IS NOT NULL) AS reachable,
                       count(*) AS total FROM companies WHERE status = 'New' AND filing_ok AND est_revenue_gbp >= $1 AND source IS DISTINCT FROM 'demo'`, [minEstRevenue]),
    creditUsage(),
  ]);
  const shown = rows.slice(0, limit);
  const more = rows.length > limit;

  return (
    <>
      <PageHeader
        title="Find contacts"
        description={`Your best companies that have no way to reach them yet. Open one, use the search links, paste what you find into the boxes and save. ${counts[0].reachable} of ${counts[0].total} qualified companies are reachable so far.`}
      />
      <div className="pills" style={{ marginBottom: 16 }} role="group" aria-label="Scope">
        <Link href="/research" className={`pill${!includeUnknown ? " on" : ""}`}>Qualified (est. {shortMoney(minEstRevenue)}+)</Link>
        <Link href="/research?scope=all" className={`pill${includeUnknown ? " on" : ""}`}>Include size unknown</Link>
        <span className="muted" style={{ marginLeft: 8 }}>Credits today: Google {usage.places.used}/{usage.places.cap}{usage.search.enabled ? ` · search ${usage.search.used}/${usage.search.cap}` : ""}. Paid buttons only run when you click.</span>
      </div>

      {shown.length === 0 ? (
        <div className="card"><EmptyState title="Everyone qualified has a contact route" icon={<Compass size={22} />}>Pull more companies, or include the ones whose size is unknown.</EmptyState></div>
      ) : (
        <div className="stack">
          {shown.map((c: any, i: number) => {
            const t = fitTier(c.fit_score, c.filing_ok);
            return (
              <details key={c.id} className="card" open={i === 0}>
                <summary className="research-sum">
                  <span style={{ flex: 1, minWidth: 0 }}><b>{c.name}</b> <span className="muted">· {[c.postcode, c.accounts_type, c.employees != null ? `${c.employees} employee${c.employees === 1 ? "" : "s"}` : null].filter(Boolean).join(" · ")}</span></span>
                  <span className="row" style={{ gap: 8, flex: "none" }}>
                    <span className="muted">{c.est ? `≈ ${shortMoney(c.est)}` : "size unknown"}</span>
                    <span className={`badge tone-${t.tone}`} title={t.title}>Fit {t.label}</span>
                    <Link href={`/companies/${c.id}`} className="muted">Open</Link>
                  </span>
                </summary>
                <div style={{ marginTop: 14 }}>
                  <ContactDetailsForm
                    company={{ id: c.id, name: c.name, postcode: c.postcode, company_number: c.company_number, domain: c.domain, generic_email: c.generic_email, phone: c.phone, linkedin_url: c.linkedin_url,
                      instagram_url: c.instagram_url, facebook_url: c.facebook_url, contact_url: c.contact_url, domain_verified: c.domain_verified, site_signals: c.site_signals }}
                    usage={usage} compact
                  />
                </div>
              </details>
            );
          })}
        </div>
      )}
      {more && <div className="row" style={{ justifyContent: "center", marginTop: 16 }}><Link href={`/research?${includeUnknown ? "scope=all&" : ""}limit=${limit + 10}`} className="btn secondary">Show 10 more</Link></div>}
    </>
  );
}
