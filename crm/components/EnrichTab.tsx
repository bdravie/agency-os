import Link from "next/link";
import { Compass } from "lucide-react";
import { query } from "@/lib/db";
import { findWebsitesAction } from "@/lib/actions";
import { fitTier, leadSettings, shortMoney } from "@/lib/leadConfig";
import { creditUsage } from "@/lib/usage";
import ActionForm from "@/components/ActionForm";
import ContactDetailsForm from "@/components/ContactDetailsForm";
import EmailFinder from "@/components/EmailFinder";
import { nicheTable } from "@/lib/nicheGate";
import { activeNiches } from "@/lib/nicheStatus";
import FillGaps from "@/components/FillGaps";
import { EmptyState } from "@/components/ui";

// The "Enrich" tab of Lead Sourcer: leads already in the CRM that have no way to reach them yet, with free search links and boxes ready.
export default async function EnrichTab({ scope = "", limit: limitParam, niches: nichesParam = "" }: { scope?: string; limit?: string; niches?: string }) {
  const limit = Math.min(Math.max(Number(limitParam) || 10, 10), 100);
  const { minEstRevenue } = await leadSettings();
  const includeUnknown = scope === "all";
  // Active niches only by default: time spent finding a route to a company in a parked niche is wasted (docs/NICHE_FOCUS_PLAN.md).
  const allNiches = nichesParam === "all";
  const active = allNiches ? null : activeNiches(await nicheTable());
  const href = (o: { scope?: boolean; niches?: boolean; limit?: number }) => `/sourcer?tab=enrich${(o.scope ?? includeUnknown) ? "&scope=all" : ""}${(o.niches ?? allNiches) ? "&niches=all" : ""}${o.limit ? `&limit=${o.limit}` : ""}`;
  const [rows, counts, usage] = await Promise.all([
    query<any>(
      `SELECT id, name, postcode, company_number, domain, generic_email, phone, linkedin_url, instagram_url, facebook_url, contact_url, domain_verified, site_signals,
              fit_score, filing_ok, est_revenue_gbp::float AS est, accounts_type, employees, niche,
              t.tried_on, t.tried, t.found
         FROM companies c
         LEFT JOIN LATERAL (SELECT to_char(a.occurred_at AT TIME ZONE 'Europe/London', 'FMDD Mon') AS tried_on, a.meta->'tried' AS tried, a.body AS found
                              FROM activities a WHERE a.company_id = c.id AND a.type = 'contact_details_found' AND a.meta->>'via' = 'fill gaps'
                             ORDER BY a.occurred_at DESC LIMIT 1) t ON true
        WHERE status = 'New' AND compliance_status <> 'not_eligible' AND filing_ok IS NOT FALSE AND source IS DISTINCT FROM 'demo'
          AND generic_email IS NULL AND linkedin_url IS NULL AND instagram_url IS NULL AND facebook_url IS NULL AND contact_url IS NULL
          AND (est_revenue_gbp >= $1 ${includeUnknown ? "OR est_revenue_gbp IS NULL" : ""})
          AND EXISTS (SELECT 1 FROM lead_gate g WHERE g.company_id = c.id AND NOT g.opted_out AND NOT g.suppressed)
          AND ($3::text[] IS NULL OR c.niche = ANY($3))
        ORDER BY (t.tried_on IS NOT NULL), fit_score DESC NULLS LAST, created_at LIMIT $2`, [minEstRevenue, limit + 1, active]),
    query<any>(`SELECT count(*) FILTER (WHERE generic_email IS NOT NULL OR linkedin_url IS NOT NULL OR instagram_url IS NOT NULL OR facebook_url IS NOT NULL OR contact_url IS NOT NULL) AS reachable,
                       count(*) AS total FROM companies WHERE status = 'New' AND filing_ok AND est_revenue_gbp >= $1 AND source IS DISTINCT FROM 'demo'`, [minEstRevenue]),
    creditUsage(),
  ]);
  const shown = rows.slice(0, limit);
  const more = rows.length > limit;
  const untried = shown.filter((c: any) => !c.tried_on).map((c: any) => Number(c.id));

  return (
    <>
      <p className="muted" style={{ marginTop: 0 }}>{`Your best companies that have no way to reach them yet. Fill in the gaps does the looking for you; the search links on each one are the last resort. ${counts[0].reachable} of ${counts[0].total} qualified companies are reachable so far.`}</p>
      {shown.length > 0 && <FillGaps ids={untried.length ? untried : shown.map((c: any) => Number(c.id))}
        left={{ search: Math.max(0, usage.search.cap - usage.search.used), places: Math.max(0, usage.places.cap - usage.places.used), searchOn: usage.search.enabled, placesOn: !!process.env.GOOGLE_PLACES_API_KEY }} />}
      <details className="sx-older" style={{ margin: "12px 0 16px" }}>
        <summary className="muted">Other tools: emails for companies that already have a website, and a Google lookup across all companies</summary>
      <div className="grid" style={{ marginTop: 12 }}>
        <details className="card">
          <summary>Find generic emails from their websites <span className="badge tone-good" style={{ marginLeft: 6 }}>free</span></summary>
          <div style={{ marginTop: 12 }}><EmailFinder /></div>
        </details>
        <details className="card">
          <summary>Find websites with Google <span className="badge tone-warn" style={{ marginLeft: 6 }}>uses credits</span></summary>
          <p className="muted" style={{ marginTop: 8 }}>Runs only when you click. Each lookup uses one Google Places request (capped at 30 a day). The free searches below are the alternative.</p>
          <ActionForm action={findWebsitesAction} label="Find websites" busyLabel="Looking up… (about 1 second each)" style={{ maxWidth: 260 }}>
            <input name="limit" type="number" min="1" max="25" defaultValue="10" aria-label="How many" />
          </ActionForm>
        </details>
      </div>
      </details>
      <div className="pills" style={{ marginBottom: 16 }} role="group" aria-label="Scope">
        <Link href={href({ scope: false })} className={`pill${!includeUnknown ? " on" : ""}`}>Qualified (est. {shortMoney(minEstRevenue)}+)</Link>
        <Link href={href({ scope: true })} className={`pill${includeUnknown ? " on" : ""}`}>Include size unknown</Link>
        <Link href={href({ niches: !allNiches })} className={`pill${allNiches ? " on" : ""}`} title="By default only companies in your active niches are shown">Include parked and other niches</Link>
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
                    {c.tried_on && <span className="muted" title={c.found ?? ""}>Tried {c.tried_on}: {(Array.isArray(c.tried) ? c.tried : []).join(", ") || "nothing to try"}</span>}
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
      {more && <div className="row" style={{ justifyContent: "center", marginTop: 16 }}><Link href={href({ limit: limit + 10 })} className="btn secondary">Show 10 more</Link></div>}
    </>
  );
}
