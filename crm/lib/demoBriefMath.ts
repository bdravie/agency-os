// Pure rules for a proposal's demo brief (no AI, no database), so they can be tested on their own. The AI names the gaps and plans
// one demo; the code tidies it, keeps it honest and writes the brief that is pasted into Claude Code, so the repo's rules are always in it.
import { PERSONAL_DATA } from "./loomPitchMath.ts";

export type Gap = { what: string; kind: "tool" | "work"; why: string };
export type Demo = {
  title: string; slug: string; outcome: string; shows: string[]; steps: string[]; tools: string[];
  sample_data: string[]; out_of_scope: string[]; loom_points: string[]; hours: number;
};
export type DemoBrief = { gaps: Gap[]; covered: string[]; demo: Demo | null; data_note: string | null; existing_demos: string[] };

const CONTACT = /[\w.+-]+@[\w-]+\.[\w.-]+|\+?\d[\d\s().-]{8,}\d/g;
const FIGURE = /[£$€]\s?\d|\d\s?%|\b\d+(?:\.\d+)?\s?x\b|\bguarantee/i;
const DPA = "The job points to personal data. The demo uses made-up business data only, and a data processing agreement comes first before any real customer data is handled.";

const text = (v: unknown, max: number) => (typeof v === "string" ? v.replace(CONTACT, "[removed]").replace(/\s+/g, " ").trim().slice(0, max) : "");
const list = (v: unknown, n: number, max: number) => (Array.isArray(v) ? v : []).map((s) => text(s, max)).filter(Boolean).slice(0, n);

/** A folder name for the demo: short kebab-case, never one that is already in demos/. */
export function slugOf(title: string, existing: string[]): string {
  const base = title.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40).replace(/-+$/, "") || "upwork-demo";
  let slug = base;
  for (let n = 2; existing.includes(slug); n++) slug = `${base}-${n}`;
  return slug;
}

/** Tidy what the model returned. With no gaps there is nothing to build, so the demo is dropped whatever the model wrote. */
export function cleanDemoBrief(r: any, jobText: string, existing: string[]): DemoBrief {
  const gaps = (Array.isArray(r?.gaps) ? r.gaps : [])
    .map((g: any): Gap => ({ what: text(g?.what, 80), kind: g?.kind === "tool" ? "tool" : "work", why: text(g?.why, 200) }))
    .filter((g: Gap) => g.what).slice(0, 5);
  const d = r?.demo ?? {};
  const title = text(d.title, 60);
  const shows = [...new Set((Array.isArray(d.covers_gaps) ? d.covers_gaps : []).map((n: unknown) => gaps[Math.round(Number(n)) - 1]?.what).filter(Boolean))] as string[];
  const demo: Demo | null = gaps.length && title ? {
    title, slug: slugOf(title, existing), outcome: text(d.outcome, 220), shows,
    steps: list(d.steps, 6, 200), tools: list(d.tools, 6, 40), sample_data: list(d.sample_data, 4, 160),
    out_of_scope: list(d.out_of_scope, 4, 160), loom_points: list(d.loom_points, 3, 120),
    hours: Math.round(Math.max(1, Math.min(16, Number(d.hours) || 4)) * 2) / 2,
  } : null;
  const note = text(r?.data_note, 300);
  return { gaps, covered: list(r?.covered, 4, 160), demo, data_note: PERSONAL_DATA.test(jobText) ? DPA : note || null, existing_demos: existing };
}

/** What is wrong with a tidied brief. No gaps at all is a fine answer (nothing new to build), so it is not a problem. */
export function demoBriefProblems(b: DemoBrief): string[] {
  if (!b.gaps.length) return [];
  const d = b.demo;
  if (!d) return ["the demo"];
  return [
    !d.outcome && "what the demo does", d.steps.length < 2 && "the steps", !d.shows.length && "which gaps the demo covers",
    FIGURE.test(`${d.title} ${d.outcome}`) && "a figure or promise in the demo's description",
  ].filter(Boolean) as string[];
}

const bullets = (items: string[]) => items.map((s) => `- ${s}`).join("\n");

/**
 * The brief to paste into Claude Code. Written by code from the tidied fields so the repo's rules (demo folder layout, fake data only,
 * business data only, call it a demo, low cost, nothing sent) are in every brief, whatever the model wrote. Empty when there is no demo.
 */
export function demoBriefPrompt(b: DemoBrief, jobTitle: string, jobText: string): string {
  const d = b.demo;
  if (!d) return "";
  const job = jobText.replace(CONTACT, "[removed]").trim();
  return [
    `Build a small working demo in this repo for an Upwork job I am applying to ("${jobTitle.replace(CONTACT, "[removed]")}"). Follow CLAUDE.md throughout.`,
    `## Why\nThe job needs things I have not built or used yet, and I want something real to show the client:\n${b.gaps.map((g) => `- ${g.what} (${g.kind === "tool" ? "a tool I have not used" : "work I have not done"})${g.why ? `: ${g.why}` : ""}`).join("\n")}`,
    `## The demo: ${d.title}\nFolder: \`demos/${d.slug}/\`\n\nWhat it is designed to do for the business: ${d.outcome}`,
    `It must show:\n${bullets(d.shows)}`,
    `How it works:\n${d.steps.map((s, i) => `${i + 1}. ${s}`).join("\n")}`,
    d.tools.length ? `Tools: ${d.tools.join(", ")}` : "",
    d.sample_data.length ? `Sample data to make (made up):\n${bullets(d.sample_data)}` : "",
    d.out_of_scope.length ? `Leave out:\n${bullets(d.out_of_scope)}` : "",
    d.loom_points.length ? `It must be easy to show in a 2-minute Loom. On screen, in order:\n${d.loom_points.map((s, i) => `${i + 1}. ${s}`).join("\n")}` : "",
    `## Rules\n${bullets([
      "Lay it out like `/new-demo`: `README.md` (what it does, who it is for, how it works, setup, cost per run, what data it touches), `loom-script.md` (a 2-minute walkthrough), the code or n8n workflow JSON, and `sample-data/` with fake data only (example.com emails, 07700 900xxx phone numbers).",
      `Business data only. Nothing that stores a business's own customers' or patients' personal data.${b.data_note ? ` ${b.data_note}` : ""}`,
      "It is a demo. Call it a demo everywhere and never claim a client result or a figure. Lead with the result for the business; the technology is only the method.",
      `Keep it to about ${d.hours} hours: the smallest version that runs end to end on the sample data.`,
      "For any tool I have not used, read its current documentation first, and add a short \"What I learned\" section to the README (how it works, its limits, what it costs) so I can talk about it honestly on a call.",
      "Tell me before anything needs a paid account, an API key or a sign-up. Use free tiers, cache API replies while developing, and use Haiku where quality allows.",
      "Nothing is sent, posted or scraped. No real company or person is named.",
      `Ask me which existing demo, if any, to copy code from before writing new code${b.existing_demos.length ? ` (existing: ${b.existing_demos.join(", ")})` : ""}.`,
      "Before saying it is done: run it once on the sample data, show me the output, and tell me exactly what to click to show it in the Loom.",
      "Then remind me to add it in the CRM under Proposals > Proof and answers as a demo, so my pitches can mention it.",
    ])}`,
    `## The job post (context only, do not copy its wording)\n${job.length > 4000 ? `${job.slice(0, 4000)}…` : job}`,
  ].filter(Boolean).join("\n\n");
}
