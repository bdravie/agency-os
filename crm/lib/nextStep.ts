import { when } from "./format";

export type NextStep = { text: string; short: string; href?: string; warn?: boolean };

type Input = {
  is_ltd: boolean | null; domain: string | null; generic_email: string | null; status: string;
  suppressed: boolean; followup_due: Date | string | null; filing_ok?: boolean | null;
};

/** What to do with this company next. Used on the company page and in the Companies list. */
export function nextStep(c: Input): NextStep {
  if (c.is_ltd === false) return { text: "Not a limited company: outreach isn't allowed for this one.", short: "Not allowed", warn: true };
  if (c.filing_ok === false && ["New", "Contacted"].includes(c.status)) return { text: "Companies House shows filing problems (overdue filings, strike-off notice or dormant). Better to skip.", short: "Skip: filings", warn: true };
  if (c.suppressed) return { text: "On your suppression list: do not contact.", short: "Suppressed", warn: true };
  if (c.status === "Not a fit") return { text: "Parked as not a fit. Reopen it above if that changes.", short: "Parked" };
  if (c.status === "Client") return { text: "Client: keep an eye on the next review date.", short: "Client", href: "/clients" };
  if (c.status === "Replied") return { text: "They replied: offer a short call or the free pilot, and create a deal.", short: "Reply and offer a call", href: "#deals" };
  if (c.status === "Contacted") {
    return { text: c.followup_due ? `Send the one follow-up, due ${when(c.followup_due)}.` : "Send the one follow-up if you haven't heard back.", short: "Send follow-up", href: "#outreach" };
  }
  if (!c.domain) return { text: "Find their website, so you can check they're a real agency.", short: "Find website", href: "#website" };
  if (!c.generic_email) return { text: "Find a generic email address (info@, hello@) on their site.", short: "Find email", href: "#website" };
  return { text: "Write one true, specific opening line, then send the first email.", short: "Send first email", href: "#outreach" };
}
