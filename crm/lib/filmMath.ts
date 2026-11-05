// Pure helpers for filming day (no AI, no files, no database), so they can be tested on their own.
import { groupScores, type Group, type ScoredPost } from "./insightsMath.ts";
import { FIGURE } from "./breakdownMath.ts";
import { PLATFORM_LABEL, type Platform } from "./contentMath.ts";

export type ParsedScript = { hooks: string[]; script: string; onScreen: string[] };

/** Splits a saved script (HOOK OPTIONS, SCRIPT, ON-SCREEN TEXT / SCREEN RECORDING) into the parts the teleprompter shows. Text with no headings, or with words before the first heading (a script you wrote yourself), is treated as the script itself. */
export function parseScript(saved: string | null): ParsedScript {
  const text = (saved ?? "").replace(/\r/g, "").trim();
  if (!text) return { hooks: [], script: "", onScreen: [] };
  const parts: Record<string, string[]> = {};
  let current: string | null = null;
  for (const line of text.split("\n")) {
    const h = line.trim().toUpperCase();
    if (h === "HOOK OPTIONS") { current = "hooks"; parts[current] = []; continue; }
    if (h === "SCRIPT") { current = "script"; parts[current] = []; continue; }
    if (h.startsWith("ON-SCREEN TEXT")) { current = "screen"; parts[current] = []; continue; }
    if (current) parts[current].push(line);
    else if (h) return { hooks: [], script: text, onScreen: [] };
  }
  if (!parts.script) return { hooks: [], script: text, onScreen: [] };
  const bullets = (lines: string[] | undefined, re: RegExp) => (lines ?? []).map((l) => l.trim().replace(re, "").trim()).filter(Boolean);
  return { hooks: bullets(parts.hooks, /^\d+[.)]\s*/), script: parts.script.join("\n").trim(), onScreen: bullets(parts.screen, /^[-•*]\s*/) };
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
export const clampSpeed = (n: number): number => clamp(Math.round(n), 0, 300);          // pixels a second
export const clampFont = (n: number): number => clamp(Math.round(n), 24, 120);          // pixels
export const nextIndex = (i: number, dir: 1 | -1, len: number): number => (len === 0 ? 0 : clamp(i + dir, 0, len - 1));

/** Hook A is the favourite; hook B is the first other option that is really different, so the two can be tested against each other. */
export function pickHooks(hooks: string[], favourite: string): { a: string; b: string | null } {
  const a = favourite.trim();
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const b = hooks.map((h) => h.trim()).find((h) => h && norm(h) !== norm(a)) ?? null;
  return { a, b };
}

/**
 * Hook A against hook B: how posts did when they used each. Only ideas that have two hooks are compared, and a post counts for A or B only when
 * the hook recorded on it matches one of them exactly. A group needs 3 posts before it is trusted (the same rule as everywhere else).
 */
export function hookAB(posts: ScoredPost[]): Group[] {
  const label = (p: ScoredPost) =>
    !p.itemHookAlt || !p.hookUsed ? null : p.hookUsed.trim() === (p.itemHook ?? "").trim() ? "Hook A" : p.hookUsed.trim() === p.itemHookAlt.trim() ? "Hook B" : null;
  const labelled = posts.filter((p) => label(p) !== null);
  return groupScores(labelled, (p) => label(p));
}

export type Variant = { target: string; text: string };
export const VARIANT_LABEL: Record<string, string> = { instagram: "Reels caption", tiktok: "TikTok caption", youtube: "Shorts caption", linkedin: "LinkedIn post", upwork: "Upwork portfolio blurb" };

/** The variants wanted for a filmed video: one for each platform you post on, plus an Upwork portfolio blurb. */
export const variantTargets = (platforms: string[]): string[] => [...platforms.filter((p) => p in VARIANT_LABEL && p !== "upwork"), "upwork"];

/** What is wrong with the repurposed variants: missing or repeated targets, links, claimed figures, client claims, or a blurb that is too long. */
export function variantProblems(variants: Variant[], targets: string[]): string[] {
  const out: string[] = [];
  for (const t of targets) if (variants.filter((v) => v.target === t).length !== 1) out.push(`it needs exactly one ${VARIANT_LABEL[t]}`);
  for (const v of variants) {
    const name = VARIANT_LABEL[v.target] ?? v.target;
    if (!v.text.trim()) out.push(`the ${name} is empty`);
    if (/https?:\/\/|www\.|@\w/i.test(v.text)) out.push(`the ${name} contains a link or an @ name: remove it`);
    if (FIGURE.test(v.text)) out.push(`the ${name} states a money amount, percentage or multiplier: remove it`);
    if (v.target === "upwork") {
      if (v.text.trim().split(/\s+/).length > 120) out.push("the Upwork portfolio blurb is longer than 120 words");
      if (/\b(my|our|a|the)\s+clients?\b|\bclients?\s+(saw|got|made|gained|loved)\b|\bcustomers?\s+(saw|got|made|gained)\b/i.test(v.text)) out.push("the Upwork portfolio blurb talks about clients or customers: it is about a demo and must not claim client results");
    }
    if (v.target === "linkedin" && (v.text.match(/#\w+/g) ?? []).length > 3) out.push("the LinkedIn post has more than 3 hashtags");
  }
  return out;
}

const DEFAULT_DAYS = ["Tuesday", "Wednesday", "Thursday", "Monday", "Friday", "Sunday", "Saturday"];
export type Slot = { weekday: string; time: string; platform: string | null; why: string };

/**
 * Where to post this week: your best weekdays first (only groups with 3 or more posts count), then the usual working-week days to make up `perWeek`.
 * The time of day is your best time if you have one that is trusted, otherwise a starting guess. Each slot says why.
 */
export function suggestSlots(perWeek: number, weekdays: Group[], dayParts: Group[]): Slot[] {
  const trusted = weekdays.filter((g) => !g.thin && g.median > 0).sort((a, b) => b.median - a.median);
  const days: { weekday: string; why: string }[] = trusted.slice(0, perWeek).map((g) => ({ weekday: g.key, why: `One of your best days (median ${g.median.toFixed(1)}× over ${g.n} posts)` }));
  for (const d of DEFAULT_DAYS) {
    if (days.length >= perWeek) break;
    if (!days.some((x) => x.weekday === d)) days.push({ weekday: d, why: "A common starting day: not enough of your own posts yet to say" });
  }
  const bestPart = dayParts.find((g) => !g.thin && g.median > 0);
  const time = bestPart ? bestPart.key : "Morning (5am to 11am)";
  const timeWhy = bestPart ? ` · best time of day (median ${bestPart.median.toFixed(1)}× over ${bestPart.n} posts)` : " · starting guess for the time";
  const order = [...DEFAULT_DAYS].sort((a, b) => ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].indexOf(a) - ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].indexOf(b));
  return days.slice(0, perWeek).sort((a, b) => order.indexOf(a.weekday) - order.indexOf(b.weekday)).map((d) => ({ weekday: d.weekday, time, platform: null, why: d.why + timeWhy }));
}

export const platformName = (p: string): string => PLATFORM_LABEL[p as Platform] ?? p;
