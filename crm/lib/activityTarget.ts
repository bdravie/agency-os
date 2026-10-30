// Where clicking an activity takes you: the part of the page that the activity changed. Pure, so it can be tested.
// A target is either a section on the same page ({ id }, with an optional fallback id when the exact item has gone, e.g. a deleted deal),
// a link to another page ({ href }), or null when there is nothing to show (for example a backup).

export type Scope = "company" | "deal" | "drawer" | "feed";
export type Target = { id: string; fallback?: string } | { href: string } | null;
export type ActivityRef = { type: string; company_id?: number | string | null; deal_id?: number | string | null; contact_id?: number | string | null };

const COMPANY_SECTION: Record<string, string> = {
  contact_details_updated: "website", website_found: "website", email_found: "website", site_checked: "website", places_lookup: "website", search_lookup: "website",
  ch_health_run: "filings", companies_house_run: "filings",
  compliance_checked: "compliance", opted_out: "compliance", opt_out_cleared: "compliance", suppression_added: "compliance", suppression_removed: "compliance",
  email_logged: "outreach", dm_logged: "outreach", dm_drafted: "outreach", sms_logged: "outreach",
  note_logged: "log-activity",
  call_logged: "calls", call_analysed: "calls",
  audit_created: "audit", audit_report_drafted: "audit", audit_pdf_saved: "audit",
  company_researched: "offer", offer_suggested: "offer",
  status_changed: "status",
  lead_added: "top", company_added: "top", sourcer_added: "top", csv_import: "top",
};
const OTHER_PAGE: [RegExp, string][] = [
  [/^proposal_/, "/proposals"], [/^content_/, "/content"], [/^enablement_/, "/enablement"], [/^outcome_/, "/outcomes"],
  [/^apify_search_/, "/sourcer"], [/^client_created$/, "/clients"],
];

const DEAL_SECTION: Record<string, string> = {
  stage_changed: "stage", deal_created: "details", deal_offer_added: "offers", note_logged: "note",
  quote_created: "quotes", quote_sent: "quotes", quote_accepted: "quotes", quote_declined: "quotes",
  call_logged: "calls", call_analysed: "calls", audit_created: "audit", audit_report_drafted: "audit", audit_pdf_saved: "audit",
  contact_added: "company", contact_opted_out: "company", contact_opt_out_cleared: "company",
};
const DRAWER_SECTION: Record<string, string> = {
  stage_changed: "dr-stage", deal_created: "dr-stage", deal_offer_added: "dr-offers", note_logged: "dr-note",
  quote_created: "dr-quotes", quote_sent: "dr-quotes", quote_accepted: "dr-quotes", quote_declined: "dr-quotes",
};

function companyTarget(a: ActivityRef): Target {
  const t = a.type;
  if (t === "deal_deleted") return { href: "/deals/deleted" };
  if (t.startsWith("contact_") && t !== "contact_details_updated") return { id: a.contact_id ? `contact-${a.contact_id}` : "contacts", fallback: "contacts" };
  if (/^(deal_created|stage_changed|deal_offer_added|quote_)/.test(t)) return { id: a.deal_id ? `deal-${a.deal_id}` : "deals", fallback: "deals" };
  if (COMPANY_SECTION[t]) return { id: COMPANY_SECTION[t] };
  const other = OTHER_PAGE.find(([re]) => re.test(t));
  if (other) return { href: other[1] };
  return t === "backup_completed" ? null : { id: "top" };
}

export function activityTarget(a: ActivityRef, scope: Scope): Target {
  if (a.type === "backup_completed") return null;
  if (scope === "company") return companyTarget(a);
  if (scope === "deal") return a.type === "deal_deleted" ? { href: "/deals/deleted" } : { id: DEAL_SECTION[a.type] ?? "top" };
  if (scope === "drawer") return DRAWER_SECTION[a.type] ? { id: DRAWER_SECTION[a.type] } : null;
  // feed (the dashboard): go to the deal or company page, then to the right section on it
  const own = a.deal_id && (DEAL_SECTION[a.type] || /^(deal_|stage_|quote_)/.test(a.type)) && a.type !== "deal_deleted";
  if (own) return { href: `/deals/${a.deal_id}#${DEAL_SECTION[a.type] ?? "top"}` };
  if (!a.company_id) { const t = companyTarget(a); return t && "href" in t ? t : null; }
  const t = companyTarget(a);
  if (t && "href" in t) return t;
  return { href: `/companies/${a.company_id}#${t && "id" in t ? t.id : "top"}` };
}
