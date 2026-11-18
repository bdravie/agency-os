// Lead Sourcer > Enrich > Fill in the gaps (docs/LEAD_SOURCER_PLAN.md, step 3): which found details may be saved. Pure, so it can be tested.
// Only empty fields are filled (a value you typed or chose is never overwritten), and each saved detail records which step found it.
import type { FoundBy } from "./siteMatchMath.ts";

export const GAP_FIELDS = ["domain", "generic_email", "linkedin_url", "instagram_url", "facebook_url", "contact_url"] as const;
export type GapField = (typeof GAP_FIELDS)[number];
export type GapValues = Partial<Record<GapField, string | null>>;

const LABEL: Record<GapField, string> = { domain: "website", generic_email: "email", linkedin_url: "LinkedIn", instagram_url: "Instagram", facebook_url: "Facebook", contact_url: "contact page" };
const BY_KEY: Record<GapField, string> = { domain: "website", generic_email: "email", linkedin_url: "linkedin", instagram_url: "instagram", facebook_url: "facebook", contact_url: "contact_page" };

/** The fields to write: a found value only where the company has none. `steps` says which step found each value. */
export function gapUpdates(current: GapValues, found: GapValues, steps: Partial<Record<GapField, FoundBy[string]>>): { set: GapValues; labels: string[]; foundBy: FoundBy } {
  const set: GapValues = {}, labels: string[] = [], foundBy: FoundBy = {};
  for (const k of GAP_FIELDS) {
    const v = found[k];
    if (!v || (current[k] ?? "").trim()) continue;
    set[k] = v; labels.push(LABEL[k]);
    const step = steps[k];
    if (step) foundBy[BY_KEY[k]] = step;
  }
  return { set, labels, foundBy };
}

/** Whether a company now has a way to reach it (what the Enrich tab waits for). */
export const reachable = (v: GapValues) => !!(v.generic_email || v.linkedin_url || v.instagram_url || v.facebook_url || v.contact_url);
