export const VIDEO_EXTENSIONS = new Set([".mp4", ".mov", ".mkv", ".m4v", ".webm"]);
export const COST_PER_CLIP_USD = 0.002; // Claude Haiku metadata & label analysis

export function getFileExtension(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot !== -1 ? filename.slice(dot).toLowerCase() : "";
}

export type ClipType = "talking_head" | "b_roll" | "screen_recording" | "unknown";

export const CLIP_TYPE_LABELS: Record<ClipType, { label: string; tone: string; colour: string }> = {
  talking_head: { label: "Talking head", tone: "accent", colour: "var(--accent)" },
  b_roll: { label: "B-roll", tone: "good", colour: "var(--good)" },
  screen_recording: { label: "Screen recording", tone: "cyan", colour: "var(--cyan)" },
  unknown: { label: "Unclassified", tone: "neutral", colour: "var(--muted)" },
};

/**
 * Calculates estimated AI cost before scanning a folder of clips.
 */
export function estimateScanCost(clipCount: number): {
  estimatedCost: number;
  formattedCost: string;
  explanation: string;
} {
  const count = Math.max(0, clipCount);
  const estimatedCost = Number((count * COST_PER_CLIP_USD).toFixed(4));
  const formattedCost = `$${estimatedCost < 0.01 ? estimatedCost.toFixed(3) : estimatedCost.toFixed(2)}`;
  const explanation = `${count} clip${count === 1 ? "" : "s"} at ~$${COST_PER_CLIP_USD} per clip using Claude Haiku.`;
  return { estimatedCost, formattedCost, explanation };
}

/**
 * Checks whether a filename represents an accepted video file format.
 */
export function isVideoFilename(filename: string): boolean {
  if (!filename || typeof filename !== "string") return false;
  if (filename.startsWith(".") || filename.startsWith("._")) return false; // Ignore hidden & macOS sidecar files
  const ext = getFileExtension(filename);
  return VIDEO_EXTENSIONS.has(ext);
}

/**
 * Enforces rule: "Do not rename clips already used in an editing project."
 */
export function canRenameClip(clip: {
  used_in_project_id?: number | string | null;
  current_name: string;
}): { allowed: boolean; reason?: string } {
  if (clip.used_in_project_id !== null && clip.used_in_project_id !== undefined) {
    return {
      allowed: false,
      reason: `"${clip.current_name}" is assigned to an active editing project (Project #${clip.used_in_project_id}) and cannot be renamed.`,
    };
  }
  return { allowed: true };
}

/**
 * Cleans and formats a suggested filename, ensuring it stays in the same folder and retains its extension.
 * Replaces spaces, slashes and special characters with hyphens.
 */
export function sanitizeProposedFilename(proposedName: string, originalFilename: string): string {
  const origExt = getFileExtension(originalFilename);
  // Flatten any path separators into hyphens before stripping extensions
  let base = proposedName.trim().replace(/[\\/]+/g, "-");

  // If user included extension, strip it first so we can normalize
  if (base.toLowerCase().endsWith(origExt)) {
    base = base.slice(0, -origExt.length);
  }

  // Sanitize base: allow only alphanumeric, underscores, hyphens
  const cleanBase = base
    .replace(/[^a-zA-Z0-9_\-\s]/g, "")
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (!cleanBase) {
    return originalFilename;
  }

  return `${cleanBase}${origExt}`;
}

/**
 * Formats seconds into mm:ss or hh:mm:ss.
 */
export function formatDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || isNaN(seconds) || seconds < 0) {
    return "–";
  }
  const s = Math.round(seconds);
  const mins = Math.floor(s / 60);
  const secs = s % 60;
  if (mins >= 60) {
    const hrs = Math.floor(mins / 60);
    const remMins = mins % 60;
    return `${hrs}:${String(remMins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }
  return `${mins}:${String(secs).padStart(2, "0")}`;
}
