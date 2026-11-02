// Pure helpers for posting and measuring content (no files, no database), so they can be tested on their own.

export const PLATFORMS = ["tiktok", "instagram", "youtube", "linkedin"] as const;
export type Platform = (typeof PLATFORMS)[number];
export const PLATFORM_LABEL: Record<Platform, string> = { tiktok: "TikTok", instagram: "Instagram", youtube: "YouTube", linkedin: "LinkedIn" };
/** What "views" means on each platform, so numbers are copied from the right place. */
export const VIEWS_LABEL: Record<Platform, string> = { tiktok: "Views", instagram: "Views (plays)", youtube: "Views", linkedin: "Impressions" };

export const BUCKETS = [24, 72, 168] as const;
export type Bucket = (typeof BUCKETS)[number];
export const BUCKET_LABEL: Record<Bucket, string> = { 24: "24 hours", 72: "72 hours", 168: "7 days" };

const HOSTS: Record<Platform, RegExp> = {
  tiktok: /(^|\.)tiktok\.com$/, instagram: /(^|\.)instagram\.com$/, youtube: /(^|\.)(youtube\.com|youtu\.be)$/, linkedin: /(^|\.)linkedin\.com$/,
};

/**
 * A post link, checked and tidied: https only, on the platform's own site, with the query string and #fragment removed
 * (share links carry tracking codes that can identify a person) and no trailing slash. Returns an error message instead if it is no good.
 */
export function cleanPostUrl(platform: string, raw: string): { url: string } | { error: string } {
  if (!PLATFORMS.includes(platform as Platform)) return { error: "Unknown platform." };
  let u: URL;
  try { u = new URL(raw.trim()); } catch { return { error: `That is not a link (${PLATFORM_LABEL[platform as Platform]}).` }; }
  if (u.protocol !== "https:") return { error: `${PLATFORM_LABEL[platform as Platform]} links must start with https://.` };
  if (!HOSTS[platform as Platform].test(u.hostname.toLowerCase())) return { error: `That does not look like a ${PLATFORM_LABEL[platform as Platform]} link.` };
  if (u.pathname.replace(/\//g, "") === "") return { error: "Paste the link to the post itself, not the home page." };
  return { url: `https://${u.hostname.toLowerCase()}${u.pathname.replace(/\/+$/, "")}` };
}

export type PostEntry = { platform: Platform; url: string };

/** The platforms ticked in the "mark as posted" box, each with its link: every one needs a valid link, none twice. */
export function cleanPostEntries(entries: { platform: string; url: string }[], allowed: readonly string[]): { entries: PostEntry[] } | { error: string } {
  const out: PostEntry[] = [];
  for (const e of entries) {
    if (!allowed.includes(e.platform)) return { error: `${PLATFORM_LABEL[e.platform as Platform] ?? e.platform} is not one of your platforms.` };
    if (out.some((o) => o.platform === e.platform)) return { error: `${PLATFORM_LABEL[e.platform as Platform]} is listed twice.` };
    const c = cleanPostUrl(e.platform, e.url);
    if ("error" in c) return c;
    out.push({ platform: e.platform as Platform, url: c.url });
  }
  return out.length ? { entries: out } : { error: "Tick a platform and paste its link, or skip the links." };
}

export type Metrics = { views: number | null; likes: number | null; comments: number | null; shares: number | null; saves: number | null; follows: number | null; avg_watch_s: number | null };
export const METRIC_KEYS = ["views", "likes", "comments", "shares", "saves", "follows", "avg_watch_s"] as const;

/** The numbers typed into the form: blank means "not shown", anything else must be a whole number (watch time may have decimals). Views are required, because the score is built on them. */
export function cleanMetrics(raw: Record<string, unknown>): { metrics: Metrics } | { error: string } {
  const m = {} as Metrics;
  for (const k of METRIC_KEYS) {
    const v = raw[k];
    if (v === undefined || v === null || String(v).trim() === "") { m[k] = null; continue; }
    const n = Number(String(v).replace(/,/g, ""));
    if (!Number.isFinite(n) || n < 0) return { error: `${k === "avg_watch_s" ? "Average watch time" : k[0].toUpperCase() + k.slice(1)} must be a number, zero or more.` };
    if (k !== "avg_watch_s" && !Number.isInteger(n)) return { error: `${k[0].toUpperCase() + k.slice(1)} must be a whole number.` };
    if (n > 2_000_000_000) return { error: "That number is too large." };
    m[k] = k === "avg_watch_s" ? Math.round(n * 10) / 10 : n;
  }
  if (m.views === null) return { error: "Enter the views (or impressions): the score is built on them." };
  return { metrics: m };
}

export function median(nums: number[]): number | null {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export const BASELINE_SIZE = 20;
export const MIN_BASELINE = 3;

export type Performance =
  | { status: "no_metrics" }
  | { status: "not_enough_data"; have: number }
  | { status: "ok"; multiple: number; baseline: number; saveRate: number | null; shareRate: number | null; commentRate: number | null };

/**
 * How a post did against your usual: its views at 72 hours divided by your median 72-hour views over your last 20 other posts
 * on the same platform (platforms are never mixed: an Instagram play and a LinkedIn impression are not the same thing).
 * Needs at least 3 other posts with 72-hour numbers, otherwise it says there is not enough data yet.
 * Save, share and comment rates are each count divided by views at 72 hours.
 */
export function performance(at72: Pick<Metrics, "views" | "saves" | "shares" | "comments"> | null, baselineViews: number[]): Performance {
  if (!at72 || at72.views === null) return { status: "no_metrics" };
  const base = baselineViews.slice(0, BASELINE_SIZE);
  const mid = median(base);
  if (base.length < MIN_BASELINE || !mid) return { status: "not_enough_data", have: base.length };
  const rate = (n: number | null) => (n === null || !at72.views ? null : Math.round((n / at72.views) * 10000) / 10000);
  return {
    status: "ok", multiple: Math.round((at72.views / mid) * 10) / 10, baseline: mid,
    saveRate: rate(at72.saves), shareRate: rate(at72.shares), commentRate: rate(at72.comments),
  };
}

export const fmtMultiple = (x: number) => `${x.toFixed(1)}×`;
export const fmtPercent = (r: number | null) => (r === null ? "–" : `${(r * 100).toFixed(1)}%`);

/** One short line for a card: "Instagram 2.4×", or what is missing. */
export function scoreLabel(platform: string, p: Performance): string {
  const name = PLATFORM_LABEL[platform as Platform] ?? platform;
  if (p.status === "ok") return `${name} ${fmtMultiple(p.multiple)}`;
  return p.status === "no_metrics" ? `${name}: add 72h numbers` : `${name}: not enough data yet`;
}
