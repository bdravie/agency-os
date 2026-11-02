import { withPositioning } from "./positioning";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { askStructured, outreachModel } from "./llm";
import { checkOfferParts, type OfferParts } from "./outreachOfferMath";

const ROOT = path.resolve(process.cwd(), "..");
const S = { type: "string" } as const;
const SCHEMA = { type: "object" as const, required: ["subject", "body", "follow_up", "social"], properties: { subject: S, body: S, follow_up: S, social: S } };

export type OfferIdea = { title: string; automation: string; outcome: string; why: string; pilot: string; needs_dpa: boolean };

/** The AI step: wording for one offer, checked by code, with one retry that lists the problems. Saves and sends nothing. */
export async function writeOfferParts(business: string, niche: string | null, s: OfferIdea, style: { subject: string; body: string }, ice: string | null = null): Promise<{ parts?: OfferParts; problems: string[] }> {
  const rules = await withPositioning(await readFile(path.join(ROOT, "prompts/outreach-offer.md"), "utf8"));
  const prompt = `${rules}\n\nBUSINESS: ${business}${niche ? ` (${niche.replace(/_/g, " ")})` : ""}\n\nOFFER IDEA:\n- Title: ${s.title}\n- What it automates: ${s.automation}\n- Outcome: ${s.outcome}\n- Why it fits them: ${s.why}\n- First small step (pilot): ${s.pilot}\n- Needs a data processing agreement first: ${s.needs_dpa ? "YES" : "no"}\n\nEXAMPLE EMAIL FOR THIS NICHE (tone and length only; do not copy its offer):\nSubject: ${style.subject}\n${style.body}${ice ? `\n\nICEBREAKER (already written and placed first, from the person's own published material; do not repeat it, rephrase it or add anything to it): ${ice}\nBegin the body with one short bridge that moves naturally from that icebreaker to why you are getting in touch about this offer, then present the offer.` : ""}`;
  let parts: OfferParts | undefined, problems: string[] = [];
  for (let attempt = 0; attempt < 2; attempt++) {
    const raw = await askStructured<unknown>(attempt === 0 ? prompt : `${prompt}\n\nYour last answer had these problems. Fix them:\n- ${problems.join("\n- ")}`, SCHEMA, outreachModel(), 6000);
    ({ parts, problems } = checkOfferParts(raw, { bodyMax: ice ? 55 : 70 }));
    if (problems.length === 0) break;
  }
  return { parts, problems };
}
