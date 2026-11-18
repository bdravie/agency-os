import { query } from "./db";
import { loadGate } from "./complianceGate";
import { apolloKey } from "./apollo";

// The checks every Apollo call makes first, in one place (the company page's Decision-makers panel and Lead Sourcer > This week both use it).
// A bypass (owner-approved 6 Nov 2026) opens drafts and one-at-a-time sends only. Apollo spends credits and stores people, so it keeps the strict rule.
export const APOLLO_NEEDS_REAL_MATCH = "Apollo and the Apollo CSV import need a company verified on Companies House. A bypassed company can still be given people by pasting them in.";

export type Preflight = { error: string } | { domain: string };

export async function apolloPreflight(companyId: number): Promise<Preflight> {
  if (!apolloKey()) return { error: "The server can't see APOLLO_API_KEY. Add it to .env (or as a Codespaces secret) and restart the CRM." };
  const [c] = await query<{ domain: string | null }>(`SELECT domain FROM companies WHERE id = $1`, [companyId]);
  if (!c) return { error: "Company not found." };
  const gate = await loadGate(companyId);
  if (gate?.bypassed) return { error: APOLLO_NEEDS_REAL_MATCH };
  if (!gate?.sendable) return { error: `Apollo is only used for verified active limited companies that can be contacted. ${gate?.reasons.join(" ") ?? ""}`.trim() };
  if (!c.domain) return { error: "Add the company's website first: Apollo finds people by their website address." };
  return { domain: c.domain.toLowerCase().replace(/^www\./, "") };
}
