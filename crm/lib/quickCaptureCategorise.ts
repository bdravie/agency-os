import { readFile } from "node:fs/promises";
import path from "node:path";
import { query } from "./db";
import { askStructured } from "./llm";
import { fallbackTitleFromNote } from "./quickCaptureMath";

export type CategorisedNote = {
  title: string;
  niche: string;
  pillar: string;
  hookType: string;
  suggestedHook: string;
  talkingPoints: string[];
  summary: string;
};

const PILLARS = ["Show the build", "Build in public", "Teach / steal this", "Niche pain"] as const;
const HOOK_TYPES = ["Question", "Contrarian", "Mistake", "How-to", "Story", "Case study"] as const;

export const quickCaptureCap = () => Number(process.env.QUICK_CAPTURE_DAILY_CAP ?? 50) || 50;

/**
 * Checks how many quick-capture notes were categorised in the last 24 hours.
 */
export async function quickCapturesToday(): Promise<number> {
  try {
    const [{ n }] = await query<{ n: string }>(
      `SELECT count(*) AS n FROM content_items WHERE source = 'quick_capture' AND created_at >= now() - interval '24 hours'`
    );
    return Number(n) || 0;
  } catch {
    return 0;
  }
}

/**
 * Auto-categorises a quick-capture note on save without requiring a second click (Decision 4).
 * Uses Haiku (cheapest model) and respects the daily cap. Falls back safely if offline or capped.
 */
export async function categoriseQuickCapture(
  note: string,
  categories: { key: string; label: string }[]
): Promise<CategorisedNote> {
  const fallback: CategorisedNote = {
    title: fallbackTitleFromNote(note),
    niche: categories[0]?.key || "untagged",
    pillar: "Show the build",
    hookType: "How-to",
    suggestedHook: "",
    talkingPoints: note
      .split("\n")
      .map((l) => l.trim().replace(/^[-*#\s]+/, ""))
      .filter((l) => l.length > 5)
      .slice(0, 4),
    summary: fallbackTitleFromNote(note),
  };

  if (!process.env.ANTHROPIC_API_KEY) {
    return fallback;
  }

  const todayCount = await quickCapturesToday();
  if (todayCount >= quickCaptureCap()) {
    return fallback;
  }

  try {
    const promptCandidates = [
      path.join(path.resolve(process.cwd(), ".."), "prompts/quick-capture-categorise.md"),
      path.join(process.cwd(), "prompts/quick-capture-categorise.md"),
    ];
    let instructions = "";
    for (const p of promptCandidates) {
      try {
        instructions = await readFile(p, "utf8");
        if (instructions) break;
      } catch {
        // try next candidate
      }
    }

    const categoryList = categories.map((c) => `- ${c.key}: ${c.label}`).join("\n");
    const allowedKeys = [...categories.map((c) => c.key), "untagged"];

    const prompt = `${instructions}

ALLOWED NICHES / CATEGORIES:
${categoryList}
- untagged: General or unclassified

RAW NOTE:
${note}`;

    const schema = {
      type: "object" as const,
      required: ["title", "niche", "pillar", "hook_type", "talking_points", "summary"],
      properties: {
        title: { type: "string" as const, description: "Punchy video title under 60 chars" },
        niche: { type: "string" as const, enum: allowedKeys },
        pillar: { type: "string" as const, enum: [...PILLARS] },
        hook_type: { type: "string" as const, enum: [...HOOK_TYPES] },
        suggested_hook: { type: "string" as const, description: "1-sentence opening hook line" },
        talking_points: {
          type: "array" as const,
          items: { type: "string" as const },
          minItems: 2,
          maxItems: 4,
        },
        summary: { type: "string" as const, description: "1-2 sentence core message" },
      },
    };

    const res = await askStructured<{
      title: string;
      niche: string;
      pillar: string;
      hook_type: string;
      suggested_hook?: string;
      talking_points: string[];
      summary: string;
    }>(prompt, schema, "haiku", 1200);

    return {
      title: String(res.title || fallback.title).slice(0, 60).trim(),
      niche: allowedKeys.includes(res.niche) ? res.niche : fallback.niche,
      pillar: (PILLARS as readonly string[]).includes(res.pillar) ? res.pillar : fallback.pillar,
      hookType: (HOOK_TYPES as readonly string[]).includes(res.hook_type) ? res.hook_type : fallback.hookType,
      suggestedHook: String(res.suggested_hook || "").trim(),
      talkingPoints: Array.isArray(res.talking_points) && res.talking_points.length > 0 ? res.talking_points : fallback.talkingPoints,
      summary: String(res.summary || fallback.summary).trim(),
    };
  } catch (err) {
    console.error("AI quick capture categorisation failed, falling back to heuristic:", err);
    return fallback;
  }
}
