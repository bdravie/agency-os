import { when } from "./format";

export type NextStep = { text: string; short: string; href?: string; warn?: boolean };

type Input = {
  domain: string | null; generic_email: string | null; status: string;
  gate: { sendable: boolean; unchecked: boolean; reasons: string[] }; followup_due: Date | string | null; filing_ok?: boolean | null;
  linkedin_url?: string | null; instagram_url?: string | null; facebook_url?: string | null; contact_url?: string | null;
};

/** What to do with this company next. Used on the company page and in the Companies list. */
export function nextStep(c: Input): NextStep {
  if (c.gate.unchecked && !c.gate.reasons.slice(1).length) return { text: "Check this company on Companies House first. Outreach stays blocked until it is verified as an active limited company or LLP.", short: "Verify first", href: "#compliance" };
  if (!c.gate.sendable) return { text: `${c.gate.reasons.join(" ")} Do not contact.`, short: "Blocked", warn: true, href: "#compliance" };
  if (c.filing_ok === false && ["New", "Contacted"].includes(c.status)) return { text: "Companies House shows filing problems (overdue filings, strike-off notice or dormant). Better to skip.", short: "Skip: filings", warn: true };
  if (c.status === "Not a fit") return { text: "Parked as not a fit. Reopen it above if that changes.", short: "Parked" };
  if (c.status === "Client") return { text: "Client: keep an eye on the next review date.", short: "Client", href: "/clients" };
  if (c.status === "Replied") return { text: "They replied: offer a short call or the free pilot, and create a deal.", short: "Reply and offer a call", href: "#deals" };
  if (c.status === "Contacted") {
    return { text: c.followup_due ? `Send the one follow-up, due ${when(c.followup_due)}.` : "Send the one follow-up if you haven't heard back.", short: "Send follow-up", href: "#outreach" };
  }
  const social = c.linkedin_url || c.instagram_url || c.facebook_url || c.contact_url;
  if (!c.domain && !c.generic_email && !social) return { text: "Find a way to reach them: a website, a generic email, or a company social page. Use the search links.", short: "Find contact route", href: "#website" };
  if (!c.generic_email && social) return { text: "No email, but you can message their company page or contact form. Write one true opening line first.", short: "Message by social", href: "#outreach" };
  if (!c.generic_email) return { text: "Find a generic email address (info@, hello@) on their site, or a company social page.", short: "Find email", href: "#website" };
  return { text: "Write one true, specific opening line, then send the first email.", short: "Send first email", href: "#outreach" };
}
