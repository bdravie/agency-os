// Pure helpers for the "make this job a better fit" suggestions (no AI, no database), so they can be tested on their own.

export type Kind = "learn" | "build" | "change" | "ask" | "portfolio";
export type LongTerm = "yes" | "maybe" | "no";
export type Overall = "worth_it" | "apply_as_is" | "partial" | "skip";
export type Action = { title: string; how: string; kind: Kind; effort_hours: number; score_gain: number; long_term: LongTerm; long_term_note: string };
export type Improvements = {
  actions: Action[];
  verdict: { overall: Overall; reasoning: string; best_actions: string[]; long_term: string };
};

const KINDS: Kind[] = ["learn", "build", "change", "ask", "portfolio"];
const text = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");

/** Tidy what the model returned: known kinds, whole-point gains of 0-3, half-hour efforts, best_actions that really exist. */
export function cleanImprovements(r: any): Improvements {
  const actions = (Array.isArray(r?.actions) ? r.actions : []).map((a: any): Action => ({
    title: text(a?.title, 90), how: text(a?.how, 320),
    kind: KINDS.includes(a?.kind) ? a.kind : "change",
    effort_hours: Math.round(Math.max(0.5, Math.min(200, Number(a?.effort_hours) || 0.5)) * 2) / 2,
    score_gain: Math.max(0, Math.min(3, Math.round(Number(a?.score_gain) || 0))),
    long_term: a?.long_term === "yes" || a?.long_term === "no" ? a.long_term : "maybe",
    long_term_note: text(a?.long_term_note, 220),
  })).filter((a: Action) => a.title && a.how).slice(0, 6);
  const titles = new Set(actions.map((a: Action) => a.title));
  const v = r?.verdict ?? {};
  const overall: Overall = ["worth_it", "apply_as_is", "partial", "skip"].includes(v.overall) ? v.overall : "partial";
  return {
    actions,
    verdict: {
      overall, reasoning: text(v.reasoning, 500), long_term: text(v.long_term, 400),
      best_actions: overall === "apply_as_is" || overall === "skip" ? [] : (Array.isArray(v.best_actions) ? v.best_actions : []).map((t: unknown) => text(t, 90)).filter((t: string) => titles.has(t)),
    },
  };
}

export const improveProblems = (i: Improvements): string[] => [
  i.actions.length < 1 && "actions", !i.verdict.reasoning && "verdict", !i.verdict.long_term && "long-term view",
].filter(Boolean) as string[];

/**
 * What doing the chosen actions would do to the score and cost. Gains add up but are capped: the total lift is limited to 3 points
 * because suggestions overlap and rarely stack cleanly, and the projection never passes 9 (a 10 should be rare).
 * `hourly` turns the effort into pounds of your time; `jobPrice` (from the plan, if there is one) gives it as a share of the pay.
 */
export function effortSummary(actions: Action[], score: number, hourly: number, jobPrice: number | null) {
  const hours = actions.reduce((s, a) => s + a.effort_hours, 0);
  const gain = Math.min(3, actions.reduce((s, a) => s + a.score_gain, 0));
  const cost = Math.round(hours * hourly);
  return {
    hours, cost, gain, projected: Math.max(score, Math.min(9, score + gain)),
    shareOfPay: jobPrice && jobPrice > 0 ? Math.round((cost / jobPrice) * 100) : null,
  };
}
