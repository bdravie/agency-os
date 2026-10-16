import { classifyCompany } from "./compliance.ts";
import { normaliseName, type ChCandidate } from "./companiesHouse.ts";
import { postcodeDistrict } from "./apifyMath.ts";

// Pure ranking for "find one company by name": which Companies House record is the likely one, and how much to trust each link.

export type Confidence = "given" | "high" | "medium" | "low";
export type LinkKind = "website" | "linkedin" | "instagram" | "facebook";
export type FoundLink = { kind: LinkKind; value: string; confidence: Confidence; how: string };
export type Ranked = { candidate: ChCandidate; score: number; why: string[]; eligible: boolean };

const tokens = (s: string) => normaliseName(s).split(" ").filter((w) => w.length > 2);

/** Rank Companies House search results for a typed name and (optional) town or postcode. Only an exact name is ever called "best". */
export function rankCandidates(name: string, place: string, candidates: ChCandidate[]): { ranked: Ranked[]; best: Ranked | null } {
  const want = normaliseName(name), wantTokens = new Set(tokens(name));
  const district = postcodeDistrict(place), town = place.trim().toLowerCase();
  const ranked = candidates.map((c) => {
    const why: string[] = []; let score = 0;
    const exact = normaliseName(c.name) === want;
    if (exact) { score += 60; why.push("name matches exactly"); }
    else {
      const have = new Set(tokens(c.name)), shared = [...wantTokens].filter((t) => have.has(t)).length;
      const share = wantTokens.size ? shared / wantTokens.size : 0;
      score += Math.round(share * 35); if (share > 0) why.push(`${Math.round(share * 100)}% of the words match`);
    }
    if (c.status === "active") { score += 15; why.push("active"); } else if (c.status) { why.push(`status ${c.status}`); }
    const addr = (c.address ?? "").toLowerCase();
    if (district && postcodeDistrict(c.address ?? "") === district) { score += 20; why.push(`same postcode area (${district})`); }
    else if (town && town.length > 2 && !district && addr.includes(town)) { score += 12; why.push(`address mentions ${place.trim()}`); }
    return { candidate: c, score, why, eligible: classifyCompany(c.type, c.status).status === "eligible" };
  }).sort((a, b) => b.score - a.score);
  const exact = ranked.filter((r) => normaliseName(r.candidate.name) === want);
  const active = exact.filter((r) => r.candidate.status === "active");
  const pool = active.length ? active : exact;
  const withPlace = pool.filter((r) => r.why.some((w) => /same postcode|address mentions/.test(w)));
  const best = pool.length === 1 ? pool[0] : withPlace.length === 1 ? withPlace[0] : null;   // several equally good exact names: don't guess
  return { ranked: ranked.slice(0, 6), best };
}

/** How much to trust a link, and why, in words you can read on screen. */
export const trust = {
  given: (): { confidence: Confidence; how: string } => ({ confidence: "given", how: "from the links you pasted" }),
  verifiedByNumber: () => ({ confidence: "high" as Confidence, how: "their page shows the company number" }),
  verifiedByName: () => ({ confidence: "medium" as Confidence, how: "their full name appears on the page" }),
  linkedFromSite: () => ({ confidence: "high" as Confidence, how: "linked from their own website" }),
  fromSearch: (verified: "company number" | "name" | null) => verified === "company number" ? { confidence: "high" as Confidence, how: "web search result; the page shows the company number" }
    : verified === "name" ? { confidence: "medium" as Confidence, how: "web search result; their name is on the page" } : { confidence: "low" as Confidence, how: "web search result, not confirmed: check it" },
};

/** Links start ticked when they are given or well supported, and unticked when they are only a guess. */
export const startsTicked = (c: Confidence) => c !== "low";

const enc = encodeURIComponent;
/** Ready-made searches for finding links by hand when nothing was found. */
export function searchLinks(name: string, place: string): { label: string; href: string }[] {
  const q = [name, place].filter(Boolean).join(" ");
  return [
    { label: "Google", href: `https://www.google.com/search?q=${enc(q)}` },
    { label: "LinkedIn company page", href: `https://www.google.com/search?q=${enc(`${q} site:linkedin.com/company`)}` },
    { label: "Instagram", href: `https://www.google.com/search?q=${enc(`${q} site:instagram.com`)}` },
    { label: "Facebook page", href: `https://www.google.com/search?q=${enc(`${q} site:facebook.com`)}` },
  ];
}
