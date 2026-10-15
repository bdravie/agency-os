import { readFile } from "node:fs/promises";
import path from "node:path";
import { askStructured, outcomesModel } from "./llm";
import { assess, fmtValue, longDate, monthLabel, unverifiedNumbers, type MetricIn } from "./outcomeMath";
import type { CaseStudy } from "./outcomeData";

// The AI writes WORDING only. Every comparison is calculated in outcomeMath.ts and handed over as facts; any number in the
// reply that was not in those facts is reported back as a warning, so nothing invented slips into a client report.
const ROOT = path.resolve(process.cwd(), "..");
const S = { type: "string" } as const;
const clip = (s: unknown, n: number) => String(s ?? "").trim().slice(0, n);
const list = (a: unknown, max: number, n: number) => (Array.isArray(a) ? a : []).map((x) => clip(x, n)).filter(Boolean).slice(0, max);
const VERDICT_WORDS = { better: "clearly better", flat: "about the same", worse: "worse" } as const;

type Facts = { client: string; kickoff: string; built: string | null; metrics: MetricIn[]; today: string };

/** The facts block: the only source of numbers the model may use. */
export function factsText(f: Facts, upTo?: string): { text: string; assessment: ReturnType<typeof assess> } {
  const a = assess({ kickoff: f.kickoff, today: f.today, metrics: f.metrics, upTo });
  const lines = a.metrics.map((m) =>
    m.latest
      ? `- ${m.name}: ${fmtValue(m.baseline, m.unit)} at kickoff, ${fmtValue(m.latest.value, m.unit)} in ${monthLabel(m.latest.period)} (${m.moved}; ${m.better} is better; ${VERDICT_WORDS[m.verdict!]})`
      : `- ${m.name}: ${fmtValue(m.baseline, m.unit)} at kickoff, no reading yet`);
  const text = [
    `CLIENT: ${f.client}`,
    `KICKOFF: ${longDate(f.kickoff)}; ${a.dataDays} days of data so far`,
    `WHAT WAS BUILT: ${f.built?.trim() || "(not described)"}`,
    "FIGURES (from the client's own records, logged monthly against a baseline taken at kickoff):",
    ...lines,
  ].join("\n");
  return { text, assessment: a };
}

async function rules(file: string) { return readFile(path.join(ROOT, "prompts", file), "utf8"); }
const warn = (text: string, facts: string) => { const bad = unverifiedNumbers(text, facts); return bad.length ? [`These figures were not in your data, so check them: ${bad.join(", ")}`] : []; };

export type Monthly = { wins: string[]; next_improvement: string };

export async function draftMonthly(f: Facts, period: string): Promise<{ draft: Monthly; model: string; warnings: string[] }> {
  const { text } = factsText(f, period);
  const model = outcomesModel();
  const out = await askStructured<Monthly>(`${await rules("outcomes-report.md")}\n\nREPORT MONTH: ${monthLabel(period)}\n${text}`, {
    type: "object", required: ["wins", "next_improvement"],
    properties: { wins: { type: "array", items: S }, next_improvement: S },
  } as never, model, 2000);
  const draft = { wins: list(out.wins, 3, 300), next_improvement: clip(out.next_improvement, 450) };
  return { draft, model, warnings: warn(`${draft.wins.join(" ")} ${draft.next_improvement}`, text) };
}

/** Adds the sender's real name, business name and the one-line opt-out to every outbound email draft. */
export function withSignOff(body: string): { body: string; missingSender: boolean } {
  const name = process.env.SENDER_NAME?.trim(), biz = process.env.BUSINESS_NAME?.trim();
  const clean = body.replace(/\s+$/, "").replace(/\n+(?:best|kind regards|regards|thanks|many thanks|cheers)[,!]?\s*(?:\n.*)*$/i, "");
  return { body: `${clean}\n\nThanks,\n${name || "[your name]"}\n${biz || "[your business]"}\n\nReply 'no' and I won't email again.`, missingSender: !name || !biz };
}

export async function draftCaseStudy(f: Facts): Promise<{ draft: CaseStudy; model: string; warnings: string[] }> {
  const { text, assessment } = factsText(f);
  if (!assessment.caseStudy.ready) throw new Error(assessment.caseStudy.reason);
  const model = outcomesModel();
  const out = await askStructured<CaseStudy>(`${await rules("outcomes-case-study.md")}\n\n${text}`, {
    type: "object", required: ["headline", "challenge", "solution", "results", "email_subject", "email_body"],
    properties: { headline: S, challenge: S, solution: S, results: { type: "array", items: S }, email_subject: S, email_body: S },
  } as never, model, 3000);
  const { body, missingSender } = withSignOff(clip(out.email_body, 1400));
  const draft: CaseStudy = {
    headline: clip(out.headline, 140), challenge: clip(out.challenge, 700), solution: clip(out.solution, 700),
    results: list(out.results, 4, 260), email_subject: clip(out.email_subject, 140), email_body: body,
  };
  const warnings = warn(`${draft.headline} ${draft.challenge} ${draft.solution} ${draft.results.join(" ")} ${out.email_body}`, text);
  if (missingSender) warnings.push("SENDER_NAME or BUSINESS_NAME is not set in .env, so the email has [your name] / [your business] placeholders to fill in.");
  return { draft, model, warnings };
}
