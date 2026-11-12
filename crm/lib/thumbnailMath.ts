export type ThumbnailFormat = "16:9" | "9:16";
export type PlatformRisk = "Low" | "Medium" | "High";

export type RgbColor = { r: number; g: number; b: number };

/**
 * Calculates WCAG 2.1 relative luminance for an sRGB component (0-255).
 */
export function sRgbLuminanceComponent(val: number): number {
  const s = val / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

/**
 * Calculates relative luminance of an RGB colour.
 */
export function relativeLuminance({ r, g, b }: RgbColor): number {
  return (
    0.2126 * sRgbLuminanceComponent(r) +
    0.7152 * sRgbLuminanceComponent(g) +
    0.0722 * sRgbLuminanceComponent(b)
  );
}

/**
 * Computes WCAG 2.1 contrast ratio between two RGB colours (1:1 to 21:1).
 */
export function calculateContrastRatio(fg: RgbColor, bg: RgbColor): number {
  const l1 = relativeLuminance(fg);
  const l2 = relativeLuminance(bg);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return Number(((lighter + 0.05) / (darker + 0.05)).toFixed(2));
}

/**
 * Parses hex colour string to RGB components.
 */
export function hexToRgb(hex: string): RgbColor {
  const clean = hex.replace(/^#/, "").trim();
  if (clean.length === 3) {
    const r = parseInt(clean[0] + clean[0], 16) || 0;
    const g = parseInt(clean[1] + clean[1], 16) || 0;
    const b = parseInt(clean[2] + clean[2], 16) || 0;
    return { r, g, b };
  }
  const r = parseInt(clean.slice(0, 2), 16) || 0;
  const g = parseInt(clean.slice(2, 4), 16) || 0;
  const b = parseInt(clean.slice(4, 6), 16) || 0;
  return { r, g, b };
}

// Banned claim patterns per the positioning rule
const CLAIM_PATTERNS = [
  /made\s*£?\d+/i,
  /\b\d+k\s*a\s*month/i,
  /guaranteed\s*(?:clients|leads|revenue)/i,
  /100%\s*(?:success|results)/i,
  /get\s*\d+\s*clients/i,
];

/**
 * Evaluates platform guideline risk (TikTok, Instagram Reels, YouTube).
 * Strictly flags positioning rule violations (unverified revenue/lead claims)
 * and TikTok/Reels UI safe zone occlusions.
 */
export function evaluatePlatformRisk(
  format: ThumbnailFormat,
  headline: string,
  verticalPositionPct = 45 // 0-100%
): {
  risk: PlatformRisk;
  reasons: string[];
} {
  const reasons: string[] = [];

  // Check positioning rule claims
  for (const pattern of CLAIM_PATTERNS) {
    if (pattern.test(headline)) {
      reasons.push("Violates positioning rule: unverified figure or revenue claim.");
    }
  }

  // Check safe zones for 9:16 (TikTok & Reels UI overlay)
  if (format === "9:16") {
    if (verticalPositionPct < 15) {
      reasons.push("Text sits in the top 15% UI safe zone (may be obscured by app header).");
    }
    if (verticalPositionPct > 72) {
      reasons.push("Text sits in the bottom 28% UI safe zone (may be obscured by captions & audio tags).");
    }
  }

  // Excessive caps or length
  const words = headline.trim().split(/\s+/).filter(Boolean);
  if (words.length > 7) {
    reasons.push("Headline is too long for small mobile screens (recommend 2-4 words).");
  }

  const allCapsWords = words.filter((w) => w.length > 2 && w === w.toUpperCase());
  if (allCapsWords.length > 4) {
    reasons.push("Excessive ALL CAPS may be flagged as clickbait by algorithm moderation.");
  }

  let risk: PlatformRisk = "Low";
  if (reasons.some((r) => r.includes("positioning rule"))) {
    risk = "High";
  } else if (reasons.length >= 2) {
    risk = "High";
  } else if (reasons.length === 1) {
    risk = "Medium";
  }

  return { risk, reasons };
}

/**
 * Scores likely thumbnail performance (1 to 10) based on readability,
 * curiosity gap, and visual punch. "Judgement, not a prediction."
 */
export function scoreThumbnailPerformance(
  headline: string,
  contrastRatio: number,
  format: ThumbnailFormat
): number {
  let score = 5; // Baseline

  const words = headline.trim().split(/\s+/).filter(Boolean);

  // Brevity (2-4 words is sweet spot for high click-through)
  if (words.length >= 2 && words.length <= 4) {
    score += 2;
  } else if (words.length === 1 || words.length === 5) {
    score += 1;
  } else if (words.length > 6) {
    score -= 2;
  }

  // Accessibility contrast
  if (contrastRatio >= 7.0) {
    score += 2; // AAA high contrast
  } else if (contrastRatio >= 4.5) {
    score += 1; // AA compliant
  } else {
    score -= 3; // Poor legibility at thumbnail size
  }

  // Curiosity or action keywords
  const text = headline.toLowerCase();
  const intrigueWords = ["why", "how", "stop", "never", "secret", "real", "steal", "truth", "mistake", "vs"];
  if (intrigueWords.some((w) => text.includes(w))) {
    score += 1;
  }

  return Math.max(1, Math.min(10, score));
}
