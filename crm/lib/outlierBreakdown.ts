import { readFile } from "node:fs/promises";
import path from "node:path";
import { askStructured, breakdownModel } from "./llm";
import { guide, loadContentConfig } from "./content";
import { breakdownProblems, cleanBreakdown, maskContact, type Breakdown } from "./breakdownMath";
import { HOOK_TYPES, PILLARS } from "./contentMath";

const S = { type: "string" } as const;
const strings = (max: number) => ({ type: "array", items: S, maxItems: max }) as const;

export type OutlierPost = {
  platform: string; caption: string | null; views: number | null; likes: number | null; comments: number | null; saves: number | null; shares?: number | null; score: number | null;
  durationS: number | null; sound: string | null; postType: string | null; hashtags: string[]; ctaKeyword: string | null;
  creatorHandle: string; creatorName: string | null; whyIFollow: string | null; creatorNiche: string | null;
};

/**
 * Break one outlier down into its hook, structure and likely reasons, and write 3 ideas for the owner's own audience.
 * Click-only. The caption and numbers are public post data; a transcript is only what the owner pastes (emails and phone numbers masked, never saved).
 * The result is checked in code (no copied wording, no claimed results, no names); if it fails it is asked again once with the problems listed.
 */
export async function breakDown(p: OutlierPost, transcript: string | null): Promise<{ breakdown?: Breakdown; problems: string[] }> {
  const config = await loadContentConfig();
  const niches = config.niches.length ? config.niches : ["trades"];
  const schema = {
    type: "object" as const, required: ["hook", "hook_type", "format", "length_note", "beats", "why_it_worked", "cta", "ideas"],
    properties: {
      hook: S, hook_type: { type: "string", enum: [...HOOK_TYPES, "Other"] }, format: S, length_note: S, beats: strings(6), why_it_worked: strings(4), cta: { type: ["string", "null"] },
      ideas: { type: "array", minItems: 3, maxItems: 3, items: { type: "object", required: ["idea", "hook", "pillar", "hook_type", "niche"], properties: { idea: S, hook: S, pillar: { type: "string", enum: [...PILLARS] }, hook_type: { type: "string", enum: [...HOOK_TYPES] }, niche: { type: "string", enum: niches } } } },
    },
  };
  const rules = await readFile(path.join(path.resolve(process.cwd(), ".."), "prompts/outlier-breakdown.md"), "utf8");
  const clean = transcript ? maskContact(transcript).slice(0, 8000) : null;
  const li = p.platform === "linkedin";
  const stats = [p.views !== null && `${p.views} views`, p.likes !== null && `${p.likes} ${li ? "reactions" : "likes"}`, p.comments !== null && `${p.comments} comments`, p.saves !== null && `${p.saves} saves`, li && p.shares != null && `${p.shares} reposts`].filter(Boolean).join(", ");
  const post =
    `POST (${p.platform}${p.postType ? `, ${p.postType}` : ""}): ${p.score ? `${p.score}× the creator's usual views. ` : ""}${stats}.\n` +
    `Length: ${p.platform === "linkedin" ? `${(p.caption ?? "").split(/\s+/).filter(Boolean).length} words` : p.durationS ? `${p.durationS} seconds` : "unknown"}. Sound: ${p.sound ?? "none noted"}. Hashtags: ${p.hashtags.length ? p.hashtags.join(", ") : "none"}. Keyword it asks viewers to comment: ${p.ctaKeyword ?? "none found"}.\n` +
    `What the owner follows this creator for: ${p.whyIFollow ?? "not noted"}${p.creatorNiche ? ` (${p.creatorNiche})` : ""}.\n\nCAPTION:\n${p.caption ?? "(no caption)"}` +
    (clean ? `\n\nTRANSCRIPT (pasted by the owner):\n${clean}` : "\n\n(No transcript was given.)");
  // A LinkedIn swipe entry is a text post the owner pasted, not a video: the same breakdown, told to think in text posts.
  const linkedin = p.platform === "linkedin"
    ? `\n\nTHIS IS A LINKEDIN POST, NOT A VIDEO. It was saved by hand to the owner's swipe file because it did well. Its numbers are reactions, comments and reposts (LinkedIn does not show views). ` +
      `"format" describes the text post (for example "story then short list", "contrarian opinion", "carousel of steps"); "length_note" gives its length in words and whether that is short or long for LinkedIn; ` +
      `"beats" are the steps of the text, in order. Each of the 3 ideas is a LinkedIn text post the owner can write this week (not a video), and its "hook" is the post's opening line.`
    : "";
  const prompt = `${await guide()}\n\n${rules}${linkedin}\n\n${post}`;
  const basedOn = clean ? "caption_and_transcript" : "caption";
  const names = [p.creatorHandle, ...(p.creatorName ? [p.creatorName] : [])];
  let problems: string[] = [], last: Breakdown | undefined;
  for (let attempt = 0; attempt < 2; attempt++) {
    const raw = await askStructured<unknown>(attempt === 0 ? prompt : `${prompt}\n\nYour last answer had these problems. Fix them and answer again in full:\n- ${problems.join("\n- ")}`, schema, breakdownModel(), 3500);
    last = cleanBreakdown(raw, niches, basedOn);
    problems = breakdownProblems(last, { caption: p.caption, transcript: clean }, names);
    if (!problems.length) return { breakdown: last, problems: [] };
  }
  return { problems };
}
