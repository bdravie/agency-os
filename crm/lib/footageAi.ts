import { readFile } from "node:fs/promises";
import path from "node:path";
import { askStructured } from "./llm";
import { sanitizeProposedFilename, type ClipType } from "./footageSafety";
import type { VideoMeta } from "./footageFfmpeg";

export type LabeledClip = {
  clipType: ClipType;
  label: string;
  suggestedName: string;
  confidence: number;
};

/**
 * Auto-classifies a raw video clip and suggests a structured filename.
 */
export async function classifyClipWithAi(
  filename: string,
  meta: VideoMeta
): Promise<LabeledClip> {
  const origExt = path.extname(filename);
  const nowStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");

  // Default heuristic fallback
  const lower = filename.toLowerCase();
  let defaultType: ClipType = "talking_head";
  if (lower.includes("screen") || lower.includes("capture") || lower.includes("record") || lower.includes("demo")) {
    defaultType = "screen_recording";
  } else if (lower.includes("broll") || lower.includes("b-roll") || lower.includes("cut") || lower.includes("ambient")) {
    defaultType = "b_roll";
  }

  const fallback: LabeledClip = {
    clipType: defaultType,
    label: filename.replace(origExt, "").replace(/[-_]+/g, " ").trim(),
    suggestedName: sanitizeProposedFilename(`${nowStr}_${defaultType}_${filename}`, filename),
    confidence: 0.7,
  };

  if (!process.env.ANTHROPIC_API_KEY) {
    return fallback;
  }

  try {
    const promptCandidates = [
      path.join(path.resolve(process.cwd(), ".."), "prompts/footage-label.md"),
      path.join(process.cwd(), "prompts/footage-label.md"),
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

    const prompt = `${instructions}

FILENAME: ${filename}
DURATION: ${meta.duration}s
RESOLUTION: ${meta.resolution} (${meta.width > meta.height ? "16:9 widescreen" : "9:16 vertical / mobile"})
FPS: ${meta.fps}
DATE: ${nowStr}`;

    const schema = {
      type: "object" as const,
      required: ["clip_type", "label", "suggested_filename", "confidence"],
      properties: {
        clip_type: {
          type: "string" as const,
          enum: ["talking_head", "b_roll", "screen_recording"],
        },
        label: { type: "string" as const, description: "3-6 word summary label" },
        suggested_filename: {
          type: "string" as const,
          description: "Clean YYYYMMDD_<clip_type>_<slug>.<ext> filename",
        },
        confidence: { type: "number" as const, minimum: 0.5, maximum: 1.0 },
      },
    };

    const res = await askStructured<{
      clip_type: "talking_head" | "b_roll" | "screen_recording";
      label: string;
      suggested_filename: string;
      confidence: number;
    }>(prompt, schema, "haiku", 800);

    return {
      clipType: res.clip_type || fallback.clipType,
      label: String(res.label || fallback.label).trim(),
      suggestedName: sanitizeProposedFilename(res.suggested_filename || fallback.suggestedName, filename),
      confidence: Number(res.confidence) || 0.85,
    };
  } catch (err) {
    console.error(`AI classification failed for ${filename}, using heuristic:`, err);
    return fallback;
  }
}
