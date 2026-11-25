// Pure rules for the Build plan's client page: the tailored plan laid out as a clean page to show a client on a Loom or a call.
// No AI, no database, no network: everything on the page is placed by code from the plan as saved, so it says exactly what the
// plan says. A plan that is missing or out of date gives no page, like the text for the application.
import { chosenPain, money, quoteFor, stepStates, type BuildPlan, type CaseStudy, type Currency } from "./buildPlanMath.ts";
import type { Rates } from "./proposalPlanMath.ts";

/** A place where the flow leaves the straight line: skips ahead, or loops back. */
export type PageJump = { label: string; to: number; back: boolean };
export type PageStep = { n: number; title: string; detail: string; tools: string[]; jumps: PageJump[] };
export type PageMilestone = { name: string; when: string; delivers: string[]; price: string | null };
export type ClientPage = {
  problem: { text: string; quote: string } | null;
  steps: PageStep[];
  outcomes: string[];
  milestones: PageMilestone[];
  /** "6 working days", or null when the plan has no milestones. */
  timeline: string | null;
  /** The fixed price, or null when the owner chose to leave prices off the page. */
  total: string | null;
  access: string[];
  assumptions: string[];
  caseStudy: CaseStudy | null;
  dataNote: string | null;
};
export type PageOptions = { currency: Currency; usdToGbp: number | null; showPrice: boolean };

export const PAGE_DATA_NOTE = "Because this would handle personal data, a data processing agreement comes first, before any real customer data is used.";

/** A step's tool as chips. A step names one tool, but the owner may type several ("Shopify, Klaviyo"). */
export function splitTools(tool: string | null | undefined): string[] {
  const seen = new Set<string>(), out: string[] = [];
  for (const t of (tool ?? "").split(/\s*(?:[,/+&]|\band\b|\bor\b)\s*/i)) {
    const name = t.trim();
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    out.push(name);
  }
  return out.slice(0, 4);
}

/** Why there is no client page yet, or null when there is one. */
export function clientPageBlock(bp: BuildPlan | null | undefined): string | null {
  const state = stepStates(bp).plan;
  if (state === "empty") return "Write the tailored build plan (step 4) first.";
  if (state === "stale") return "The build plan was written for a different pain point or workflow. Write it again first.";
  return null;
}

const whenOf = (from: number, to: number) => (from === to ? `Day ${from}` : `Days ${from} to ${to}`);

/**
 * The client page, from the saved steps. Null when the tailored plan is missing or out of date. The case study is only shown while
 * the demo step it came from is up to date. Prices come from the same quote as the application text, in pounds or dollars.
 */
export function clientPage(bp: BuildPlan | null | undefined, rates: Rates, o: PageOptions = { currency: "GBP", usdToGbp: null, showPrice: true }): ClientPage | null {
  const state = stepStates(bp);
  if (!bp?.plan || state.plan !== "ready") return null;
  const p = bp.plan, pain = chosenPain(bp);
  const steps = p.flow.map((f, i): PageStep => ({
    n: i + 1, title: f.label, detail: f.detail, tools: splitTools(f.tool),
    jumps: p.branches.filter((b) => b.from === i + 1 && b.to !== i + 2 && b.to >= 1 && b.to <= p.flow.length).map((b) => ({ label: b.label, to: b.to, back: b.to < b.from })),
  }));
  const q = p.milestones.length ? quoteFor(p.milestones, rates) : null;
  const cash = (n: number) => money(n, o.currency, o.usdToGbp);
  return {
    problem: pain ? { text: pain.pain, quote: pain.quote } : null,
    steps,
    outcomes: p.outcomes,
    milestones: q ? q.lines.map((l, i) => ({ name: l.name, when: whenOf(l.from_day, l.to_day), delivers: p.milestones[i].delivers.filter(Boolean), price: o.showPrice ? cash(l.price) : null })) : [],
    timeline: q ? `${q.days} working day${q.days === 1 ? "" : "s"}` : null,
    total: q && o.showPrice ? cash(q.total) : null,
    access: p.access,
    assumptions: p.assumptions,
    caseStudy: state.demo === "ready" ? bp.demo?.case_study ?? null : null,
    dataNote: p.data_note ? PAGE_DATA_NOTE : null,
  };
}

/** The link to the page, with the choices made on the Build plan tab. */
export function clientPageHref(id: number, o: { currency: Currency; showPrice: boolean }): string {
  const q = [o.currency === "USD" ? "currency=usd" : "", o.showPrice ? "" : "price=0"].filter(Boolean).join("&");
  return `/proposals/${id}/build-plan${q ? `?${q}` : ""}`;
}
