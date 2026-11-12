import { readFile } from "node:fs/promises";
import path from "node:path";
import { askStructured } from "./llm";
import { withPositioning } from "./positioning";
import {
  evaluatePlatformRisk,
  scoreThumbnailPerformance,
  calculateContrastRatio,
  hexToRgb,
  type ThumbnailFormat,
  type PlatformRisk,
} from "./thumbnailMath";
import { BRAND, LAYOUTS, STICKERS, TITLE_STYLES, coverTextProblem, suggestedDesign, type Design } from "./thumbnailDesign";

export type ThumbnailOption = {
  headline: string;
  subhead: string;
  visualDirection: string;
  design: Design;
  contrastRatio: number;
  performanceScore: number;
  platformRisk: PlatformRisk;
  riskReasons: string[];
};

type RawConcept = { headline: string; subhead: string; visual_direction: string; power_word?: string; layout?: string; style?: string; tilt?: boolean; stickers?: string[] };

// Used only when there is no API key (demo mode), so the screen still has something to show. A failed AI call is reported, not papered over.
const FALLBACK: RawConcept[] = [
  { headline: "WHY QUOTES DIE", subhead: "The 3-day mistake", visual_direction: "Serious reaction looking at an empty inbox", power_word: "DIE", layout: "face", style: "outline", stickers: ["arrow"] },
  { headline: "STOP DOING THIS", subhead: "Quotes by text", visual_direction: "Split: messy messages, clean pipeline", power_word: "STOP", layout: "split", style: "solid", stickers: ["cross", "tick"] },
  { headline: "STEAL THIS SYSTEM", subhead: "Intake blueprint", visual_direction: "The flowchart on screen, one step circled", power_word: "STEAL", layout: "banner", style: "block", stickers: ["circle"] },
];

/** Contrast of the title against what sits behind it, for each title style (white on Navy, or Navy on Cream blocks). */
export function titleContrast(style: Design["style"]): number {
  return style === "block" ? calculateContrastRatio(hexToRgb(BRAND.navy), hexToRgb(BRAND.cream)) : calculateContrastRatio(hexToRgb(BRAND.white), hexToRgb(BRAND.navy));
}

/** Scores and risk for one cover, worked out in code from its words and design. */
export function assess(headline: string, subhead: string | null, design: Design, format: ThumbnailFormat) {
  const contrastRatio = titleContrast(design.style);
  const riskEval = evaluatePlatformRisk(format, headline, 45);
  const reasons = [...riskEval.reasons];
  const sub = subhead ? coverTextProblem(subhead) : null;
  if (sub) reasons.push(`Supporting line: ${sub}`);
  return { contrastRatio, performanceScore: scoreThumbnailPerformance(headline, contrastRatio, format), platformRisk: (sub ? "High" : riskEval.risk) as PlatformRisk, riskReasons: reasons };
}

export async function generateThumbnailConcepts(
  idea: string,
  hook: string | null,
  pillar: string | null,
  niche: string | null,
  format: ThumbnailFormat = "16:9"
): Promise<ThumbnailOption[]> {
  let raw: RawConcept[] = FALLBACK;

  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const candidates = [path.join(path.resolve(process.cwd(), ".."), "prompts/thumbnail-headlines.md"), path.join(process.cwd(), "prompts/thumbnail-headlines.md")];
      let instructions = "";
      for (const p of candidates) { try { instructions = await readFile(p, "utf8"); if (instructions) break; } catch { /* try the next place */ } }

      const prompt = `${await withPositioning(instructions)}

IDEA: ${idea}
HOOK: ${hook || "(none)"}
PILLAR: ${pillar || "Show the build"}
NICHE: ${niche || "trades"}
FORMAT: ${format === "16:9" ? "16:9 YouTube thumbnail" : "9:16 Instagram Reels / TikTok cover"}`;

      const S = { type: "string" as const };
      const res = await askStructured<{ concepts: RawConcept[] }>(prompt, {
        type: "object" as const,
        required: ["concepts"],
        properties: {
          concepts: {
            type: "array" as const, minItems: 3, maxItems: 4,
            items: {
              type: "object" as const,
              required: ["headline", "subhead", "visual_direction", "power_word", "layout", "style", "tilt", "stickers"],
              properties: {
                headline: { ...S, description: "2 to 4 words" },
                subhead: { ...S, description: "2 to 5 words" },
                visual_direction: S,
                power_word: { ...S, description: "one word copied from the headline" },
                layout: { ...S, enum: LAYOUTS.map((l) => l.code) },
                style: { ...S, enum: TITLE_STYLES.map((t) => t.code) },
                tilt: { type: "boolean" as const },
                stickers: { type: "array" as const, maxItems: 2, items: { ...S, enum: STICKERS.map((k) => k.code) } },
              },
            },
          },
        },
      }, "haiku", 3000);

      if (!Array.isArray(res?.concepts) || res.concepts.length < 3) throw new Error("The AI did not return enough cover ideas. Try again.");
      raw = res.concepts;
    } catch (err) {
      // Say so, rather than quietly showing the built-in examples as if they were written for this video.
      throw new Error(`Cover ideas could not be written: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return raw.map((c) => {
    const headline = String(c.headline || "").trim().toUpperCase().slice(0, 60);
    const subheadRaw = String(c.subhead || "").trim().slice(0, 60);
    const subhead = coverTextProblem(subheadRaw) ? "" : subheadRaw;   // a supporting line with a figure or contact detail is left off
    const design = suggestedDesign(c, headline, format);
    return { headline, subhead, visualDirection: String(c.visual_direction || "").trim(), design, ...assess(headline, subhead, design, format) };
  }).filter((c) => c.headline);
}
