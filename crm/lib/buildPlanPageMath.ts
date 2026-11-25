// Pure rules for the Build plan's client page: the tailored plan laid out as a clean page to show a client on a Loom or a call.
// No AI, no database, no network: everything on the page is placed by code from the plan as saved, plus the owner's own words
// for the page (its title, who it is for, an opening line, the problem in their wording, a closing line). A plan that is missing
// or out of date gives no page, like the text for the application.
import { containsContactDetails } from "./audit.ts";
import {
  chosenPain, cleanPlanEdit, money, painBasis, planMermaid, quoteFor, stackOf, stepStates, stepsWithoutStack,
  type BuildPlan, type CaseStudy, type Currency, type PageNotes, type TailoredStep,
} from "./buildPlanMath.ts";
import type { Rates } from "./proposalPlanMath.ts";

/** A place where the flow leaves the straight line: skips ahead, or loops back. */
export type PageJump = { label: string; to: number; back: boolean };
export type PageStep = { n: number; title: string; detail: string; stack: string[]; jumps: PageJump[] };
export type PageMilestone = { name: string; when: string; delivers: string[]; price: string | null };
export type ClientPage = {
  /** The owner's own title for the page, or null to use the proposal's. */
  title: string | null;
  /** Who the page is for (the business being pitched), an opening line and a closing line: all the owner's own, all optional. */
  client: string | null;
  intro: string | null;
  closing: string | null;
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

/** Why there is no client page yet, or null when there is one. */
export function clientPageBlock(bp: BuildPlan | null | undefined): string | null {
  const state = stepStates(bp).plan;
  if (state === "empty") return "Write the tailored build plan (step 4) first.";
  if (state === "stale") return "The build plan was written for a different pain point or workflow. Write it again first.";
  return null;
}

/** A line for the Build plan tab when some steps name no tech stack, since the page states it under every step. Null when all do. */
export function stackGapNote(bp: BuildPlan | null | undefined): string | null {
  const gaps = stepsWithoutStack(bp?.plan?.flow ?? []);
  if (!gaps.length) return null;
  return `No tech stack on step${gaps.length === 1 ? "" : "s"} ${gaps.join(", ")}. The client page states it under every step, so add ${gaps.length === 1 ? "it" : "them"} (here, or with Edit the page).`;
}

const whenOf = (from: number, to: number) => (from === to ? `Day ${from}` : `Days ${from} to ${to}`);

/**
 * The client page, from the saved steps. Null when the tailored plan is missing or out of date. The case study is only shown while
 * the demo step it came from is up to date. Prices come from the same quote as the application text, in pounds or dollars.
 * The owner's wording of the problem is only used while the plan is still about the pain point it was written for.
 */
export function clientPage(bp: BuildPlan | null | undefined, rates: Rates, o: PageOptions = { currency: "GBP", usdToGbp: null, showPrice: true }): ClientPage | null {
  const state = stepStates(bp);
  if (!bp?.plan || state.plan !== "ready") return null;
  const p = bp.plan, pain = chosenPain(bp), notes = bp.page;
  const steps = p.flow.map((f, i): PageStep => ({
    n: i + 1, title: f.label, detail: f.detail, stack: stackOf(f),
    jumps: p.branches.filter((b) => b.from === i + 1 && b.to !== i + 2 && b.to >= 1 && b.to <= p.flow.length).map((b) => ({ label: b.label, to: b.to, back: b.to < b.from })),
  }));
  const q = p.milestones.length ? quoteFor(p.milestones, rates) : null;
  const cash = (n: number) => money(n, o.currency, o.usdToGbp);
  const own = notes?.problem && notes.basis === painBasis(bp) ? notes.problem : "";
  return {
    title: notes?.title || null, client: notes?.client || null, intro: notes?.intro || null, closing: notes?.closing || null,
    problem: pain ? { text: own || pain.pain, quote: pain.quote } : null,
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

/** The link to the page, with the choices made on the Build plan tab. `edit` opens it with every piece of text ready to change. */
export function clientPageHref(id: number, o: { currency: Currency; showPrice: boolean; edit?: boolean }): string {
  const q = [o.edit ? "edit=1" : "", o.currency === "USD" ? "currency=usd" : "", o.showPrice ? "" : "price=0"].filter(Boolean).join("&");
  return `/proposals/${id}/build-plan${q ? `?${q}` : ""}`;
}

// ---------- Editing the page ----------

/** Every piece of text on the page that the owner can change, by key. Lists are one item per line. */
export type PageDraft = Record<string, string>;
/** How long each piece may be. Step and milestone limits match the Build plan tab's own. */
export const PAGE_LIMITS = { title: 120, client: 80, intro: 400, problem: 200, closing: 300, stepTitle: 40, stepDetail: 260, stepStack: 200, mileName: 80 } as const;

const tidy = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
const toLines = (v: unknown) => (typeof v === "string" ? v : "").split("\n").map((l) => l.replace(/^\s*[-*•]\s+/, "").trim()).filter(Boolean);

/** The page's text as it stands, ready to edit. `title` is the title the page shows (the owner's own, or the proposal's). */
export function pageDraft(page: ClientPage, title: string): PageDraft {
  const d: PageDraft = {
    title, client: page.client ?? "", intro: page.intro ?? "", problem: page.problem?.text ?? "", closing: page.closing ?? "",
    outcomes: page.outcomes.join("\n"), access: page.access.join("\n"), assumptions: page.assumptions.join("\n"),
  };
  page.steps.forEach((s, i) => { d[`step.${i}.title`] = s.title; d[`step.${i}.detail`] = s.detail; d[`step.${i}.stack`] = s.stack.join(", "); });
  page.milestones.forEach((m, i) => { d[`mile.${i}.name`] = m.name; d[`mile.${i}.delivers`] = m.delivers.join("\n"); });
  return d;
}

/**
 * The owner's edit of the client page. Step, outcome, milestone and list text is saved into the plan itself (through the same
 * check as the Build plan tab, so the application text follows), and the page's own words into its notes. Their wording and
 * numbers are theirs; only contact details are refused. Steps are reworded here, never added or removed (that is step 4's job),
 * so a page opened before the plan changed is refused rather than saved over it. Hours, days and prices are not touched.
 * `proposalTitle` is the title the page falls back to: a title left the same as it is not stored, so it keeps following the proposal.
 */
export function cleanPageEdit(raw: unknown, bp: BuildPlan | null | undefined, proposalTitle: string): { value?: { plan: TailoredStep; page: PageNotes }; error?: string } {
  const block = clientPageBlock(bp);
  if (block || !bp?.plan) return { error: block ?? "Write the plan first." };
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { error: "That could not be read. Reload the page and try again." };
  const d = raw as Record<string, unknown>, plan = bp.plan, pain = chosenPain(bp);
  const stepKeys = Object.keys(d).filter((k) => /^step\.\d+\.title$/.test(k)).length, mileKeys = Object.keys(d).filter((k) => /^mile\.\d+\.name$/.test(k)).length;
  if (stepKeys !== plan.flow.length || mileKeys !== plan.milestones.length) return { error: "The plan has changed since this page was opened. Reload the page, then make your changes again." };

  const flow = plan.flow.map((_, i) => ({ label: tidy(d[`step.${i}.title`], PAGE_LIMITS.stepTitle), detail: tidy(d[`step.${i}.detail`], PAGE_LIMITS.stepDetail), tool: tidy(d[`step.${i}.stack`], PAGE_LIMITS.stepStack) || null }));
  const empty = flow.findIndex((f) => !f.label || !f.detail);
  if (empty >= 0) return { error: `Step ${empty + 1} needs a title and a line on what happens.` };
  const milestones = plan.milestones.map((m, i) => ({ ...m, name: tidy(d[`mile.${i}.name`], PAGE_LIMITS.mileName), delivers: toLines(d[`mile.${i}.delivers`]) }));
  const unnamed = milestones.findIndex((m) => !m.name);
  if (unnamed >= 0) return { error: `Milestone ${unnamed + 1} needs a name.` };

  // The plan's diagram follows the new step titles, unless the owner has drawn their own: that one is left alone.
  const drawnByCode = plan.mermaid === planMermaid(plan.flow, plan.branches);
  const edit = cleanPlanEdit({ flow, branches: plan.branches, milestones, outcomes: toLines(d.outcomes), access: toLines(d.access), assumptions: toLines(d.assumptions), mermaid: drawnByCode ? "" : plan.mermaid }, plan);
  if (!edit.value) return { error: edit.error };
  if (edit.value.flow.length !== plan.flow.length) return { error: "Each step needs a title and a line on what happens." };

  const title = tidy(d.title, PAGE_LIMITS.title), problem = tidy(d.problem, PAGE_LIMITS.problem);
  const page: PageNotes = {
    basis: painBasis(bp), title: title === tidy(proposalTitle, PAGE_LIMITS.title) ? "" : title, client: tidy(d.client, PAGE_LIMITS.client), intro: tidy(d.intro, PAGE_LIMITS.intro),
    problem: problem === (pain?.pain ?? "") ? "" : problem, closing: tidy(d.closing, PAGE_LIMITS.closing),
  };
  if (containsContactDetails([page.title, page.client, page.intro, page.problem, page.closing].join(" \n "))) return { error: "Leave email addresses and phone numbers out." };
  return { value: { plan: edit.value, page } };
}
