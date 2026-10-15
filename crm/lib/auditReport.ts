import { readFile } from "node:fs/promises";
import path from "node:path";
import { askStructured, auditModel } from "./llm";
import { label, FREQUENCIES, IMPACTS, SENSITIVITIES, unverifiedFigures, type Params, type Scored } from "./audit";

// Drafts the WORDING of an audit report with Claude. Every number comes from lib/audit.ts and is passed in; the model is told to
// quote them exactly, and anything it adds that was not supplied is flagged for you to check.
export type Report = {
  summary: string;
  opportunities: { task: string; why: string; approach: string }[];
  build: { name: string; description: string; scope: string[]; timeline_weeks: number };
  training: string[];
  risks: { risk: string; mitigation: string }[];
  next_steps: string[];
  show_price?: boolean;
  signature?: string;     // which tasks the draft was written for, to spot a stale draft
};

const S = { type: "string" } as const;
const SCHEMA = {
  type: "object", required: ["summary", "opportunities", "build", "training", "risks", "next_steps"],
  properties: {
    summary: S,
    opportunities: { type: "array", items: { type: "object", required: ["task", "why", "approach"], properties: { task: S, why: S, approach: S } } },
    build: { type: "object", required: ["name", "description", "scope", "timeline_weeks"], properties: { name: S, description: S, scope: { type: "array", items: S }, timeline_weeks: { type: "number" } } },
    training: { type: "array", items: S },
    risks: { type: "array", items: { type: "object", required: ["risk", "mitigation"], properties: { risk: S, mitigation: S } } },
    next_steps: { type: "array", items: S },
  },
} as const;

/** Changes whenever the top opportunities change, so an old draft can be recognised. */
export const signatureOf = (ranked: Scored[]) => ranked.filter((t) => t.top).map((t) => `${t.name}:${t.score}`).join("|");

const money = (n: number) => `£${n.toLocaleString("en-GB")}`;

function describe(t: Scored) {
  return `${t.rank}. ${t.name} | done by: ${t.performed_by || "not stated"} | ${t.hours_per_week} h/week today | ${label(FREQUENCIES, t.frequency)} | error rate ${t.error_rate_pct}% | revenue impact ${label(IMPACTS, t.revenue_impact)} | data: ${label(SENSITIVITIES, t.data_sensitivity)} | ease ${t.ease_used}/5 | could save ${t.hoursSavedWeek} h/week and ${money(t.annualGbp)} a year`;
}

export async function draftReport(i: { client: string; niche: string | null; context: string | null; params: Params; ranked: Scored[] }): Promise<{ report: Report; model: string; warnings: string[] }> {
  const top = i.ranked.filter((t) => t.top);
  if (top.length === 0) throw new Error("Add at least one task that can be automated (special-category tasks are held back).");
  const rules = await readFile(path.join(path.resolve(process.cwd(), ".."), "prompts", "audit-report.md"), "utf8");
  const held = i.ranked.filter((t) => !t.eligible), others = i.ranked.filter((t) => t.eligible && !t.top);
  const prompt = [
    rules,
    `CLIENT: ${i.client}${i.niche ? ` (${i.niche})` : ""}`,
    `CONTEXT: ${i.context?.trim() || "(none given)"}`,
    `ASSUMPTIONS: ${Math.round(i.params.automationShare * 100)}% of task time can be automated; time is valued at ${money(i.params.hourlyRate)} an hour over 46 working weeks.`,
    `TOP OPPORTUNITIES (write one entry for each, in this order):\n${top.map(describe).join("\n")}`,
    held.length ? `HELD BACK (special-category data; mention only in risks):\n${held.map((t) => `- ${t.name} (${t.hours_per_week} h/week)`).join("\n")}` : "",
    others.length ? `OTHER TASKS (not in the top three; do not discuss):\n${others.map((t) => `- ${t.name}`).join("\n")}` : "",
  ].filter(Boolean).join("\n\n");

  const model = auditModel();
  const out = await askStructured<Omit<Report, "signature" | "show_price">>(prompt, SCHEMA as never, model, 4000);
  const clip = (s: unknown, n = 400) => String(s ?? "").trim().slice(0, n);
  const list = (a: unknown, max: number, n = 220) => (Array.isArray(a) ? a : []).map((x) => clip(x, n)).filter(Boolean).slice(0, max);
  const report: Report = {
    summary: clip(out.summary, 500),
    opportunities: top.map((t, k) => ({ task: t.name, why: clip(out.opportunities?.[k]?.why, 320), approach: clip(out.opportunities?.[k]?.approach, 280) })),
    build: {
      name: clip(out.build?.name, 100), description: clip(out.build?.description, 320), scope: list(out.build?.scope, 6, 160),
      timeline_weeks: Math.min(8, Math.max(2, Math.round(Number(out.build?.timeline_weeks) || 4))),
    },
    training: list(out.training, 4), risks: (Array.isArray(out.risks) ? out.risks : []).slice(0, 5).map((r) => ({ risk: clip(r?.risk, 200), mitigation: clip(r?.mitigation, 200) })).filter((r) => r.risk),
    next_steps: list(out.next_steps, 3), show_price: true, signature: signatureOf(i.ranked),
  };

  // Every figure the model was allowed to use; anything else it wrote gets flagged.
  const allowed = [`${Math.round(i.params.automationShare * 100)}`, `${i.params.hourlyRate}`, "46"];
  for (const t of i.ranked) allowed.push(String(t.hours_per_week), String(t.hoursSavedWeek), money(t.annualGbp), String(t.error_rate_pct));
  const text = [report.summary, ...report.opportunities.flatMap((o) => [o.why, o.approach]), report.build.description, ...report.build.scope, ...report.training, ...report.risks.flatMap((r) => [r.risk, r.mitigation]), ...report.next_steps].join("\n");
  const stray = unverifiedFigures(text, allowed);
  return { report, model, warnings: stray.length ? [`The draft mentions figures that were not supplied: ${stray.join(", ")}. Check or remove them before sending.`] : [] };
}
