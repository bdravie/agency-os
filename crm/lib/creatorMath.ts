// Pure helpers for creator research (no files, no database, no network), so they can be tested on their own.
// Everything that comes back from an Apify actor passes through the normalisers below. They COPY NAMED FIELDS ONLY (an allow-list):
// comments, commenter names, mentions, tagged people, follower lists and anything unexpected are never read, so they can never be saved.
import { median } from "./contentMath.ts";

export const SCRAPABLE = ["tiktok", "instagram", "youtube"] as const;
export type CreatorPlatform = "tiktok" | "instagram" | "youtube" | "linkedin";

export type CreatorPost = {
  externalId: string; platform: CreatorPlatform; url: string; caption: string | null; postedAt: string | null; durationS: number | null;
  views: number | null; likes: number | null; comments: number | null; shares: number | null; saves: number | null;
  hashtags: string[]; sound: string | null; postType: string | null; ctaKeyword: string | null;
};
/** The only post fields that can ever be stored. A test checks every normaliser against this list. */
export const ALLOWED_POST_KEYS = ["externalId", "platform", "url", "caption", "postedAt", "durationS", "views", "likes", "comments", "shares", "saves", "hashtags", "sound", "postType", "ctaKeyword"] as const;
export type CreatorProfile = { displayName: string | null; bio: string | null; linkInBio: string | null; followers: number | null; verified: boolean | null };
export type Normalised = { posts: CreatorPost[]; profile: CreatorProfile | null; private: boolean };

const count = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.round(v) : null);   // -1 means "hidden" on Instagram
const text = (v: unknown, max: number): string | null => (typeof v === "string" && v.trim() ? v.replace(/\u0000/g, "").trim().slice(0, max) : null);
const isoDate = (v: unknown): string | null => {
  const d = typeof v === "number" ? new Date(v < 1e12 ? v * 1000 : v) : typeof v === "string" ? new Date(v) : null;
  return d && !Number.isNaN(d.getTime()) ? d.toISOString() : null;
};
const tags = (v: unknown): string[] => (Array.isArray(v) ? v : []).map((h) => (typeof h === "string" ? h : (h as { name?: unknown })?.name)).filter((h): h is string => typeof h === "string" && h.trim() !== "").map((h) => h.replace(/^#/, "").toLowerCase().slice(0, 60)).slice(0, 30);
const clockToSeconds = (v: unknown): number | null => {
  if (typeof v === "number") return count(v);
  if (typeof v !== "string" || !/^\d{1,2}(:\d{2}){1,2}$/.test(v)) return null;
  return v.split(":").reduce((s, p) => s * 60 + Number(p), 0);
};
const linkOnly = (v: unknown): string | null => { const t = text(v, 300); try { return t && /^https?:$/.test(new URL(t).protocol) ? t : null; } catch { return null; } };

/** "Comment GUESTS and I'll send it": the keyword a creator asks viewers to comment or message, found in the caption by simple rules. */
export function extractCta(caption: string | null): string | null {
  if (!caption) return null;
  const m = caption.match(/\b(?:comment|dm|message|reply|type|text|send)\b[^A-Za-z0-9\n]{0,6}(?:me\s+|us\s+|the\s+word\s+|the\s+keyword\s+|"|“|'|‘)*\s*["“'‘]?([A-Z][A-Z0-9]{2,19})\b["”'’]?/i);
  const word = m?.[1];
  return word && word === word.toUpperCase() && !/^(THE|AND|FOR|YOU|YOUR|ME|NOW|ALL|MY)$/.test(word) ? word : null;
}

function post(platform: CreatorPlatform, p: Omit<CreatorPost, "platform" | "ctaKeyword">): CreatorPost | null {
  if (!p.externalId || !p.url) return null;
  return { ...p, platform, ctaKeyword: extractCta(p.caption) };
}

export function normaliseTikTok(items: unknown[]): Normalised {
  const list = (items as any[]).filter((i) => i && typeof i === "object");
  const author = list.find((i) => i.authorMeta)?.authorMeta;
  if (author?.privateAccount === true) return { posts: [], profile: null, private: true };
  const posts = list.flatMap((i) => {
    const url = linkOnly(i.webVideoUrl);
    const id = text(i.id == null ? null : String(i.id), 40) ?? url?.match(/\/video\/(\d+)/)?.[1] ?? null;
    const p = post("tiktok", {
      externalId: id ? `tiktok:${id}` : "", url: url ?? "", caption: text(i.text, 2200), postedAt: isoDate(i.createTimeISO ?? i.createTime), durationS: count(i.videoMeta?.duration),
      views: count(i.playCount), likes: count(i.diggCount), comments: count(i.commentCount), shares: count(i.shareCount), saves: count(i.collectCount),
      hashtags: tags(i.hashtags), sound: i.musicMeta?.musicOriginal === true ? "Original sound" : text(i.musicMeta?.musicName, 120), postType: "video",
    });
    return p ? [p] : [];
  });
  const profile = author ? { displayName: text(author.nickName ?? author.name, 80), bio: text(author.signature, 500), linkInBio: linkOnly(author.bioLink), followers: count(author.fans), verified: typeof author.verified === "boolean" ? author.verified : null } : null;
  return { posts, profile, private: false };
}

export function normaliseInstagramReels(items: unknown[]): Normalised {
  const posts = (items as any[]).filter((i) => i && typeof i === "object").flatMap((i) => {
    const url = linkOnly(i.url);
    const code = text(i.shortCode, 40) ?? url?.match(/\/(?:reel|p)\/([A-Za-z0-9_-]+)/)?.[1] ?? null;
    const p = post("instagram", {
      externalId: code ? `instagram:${code}` : "", url: url ?? "", caption: text(i.caption, 2200), postedAt: isoDate(i.timestamp), durationS: count(i.videoDuration == null ? null : Math.round(i.videoDuration)),
      views: count(i.videoPlayCount ?? i.videoViewCount ?? i.playsCount), likes: count(i.likesCount), comments: count(i.commentsCount), shares: count(i.sharesCount), saves: null,
      hashtags: tags(i.hashtags), sound: text(i.musicInfo?.song_name, 120), postType: "reel",
    });
    return p ? [p] : [];
  });
  return { posts, profile: null, private: false };
}

export function normaliseInstagramProfile(items: unknown[]): { profile: CreatorProfile | null; private: boolean } {
  const i = (items as any[]).find((x) => x && typeof x === "object");
  if (!i) return { profile: null, private: false };
  if (i.private === true) return { profile: null, private: true };
  return { profile: { displayName: text(i.fullName, 80), bio: text(i.biography, 500), linkInBio: linkOnly(i.externalUrl), followers: count(i.followersCount), verified: typeof i.verified === "boolean" ? i.verified : null }, private: false };
}

export function normaliseYouTube(items: unknown[]): Normalised {
  const list = (items as any[]).filter((i) => i && typeof i === "object");
  const posts = list.flatMap((i) => {
    const url = linkOnly(i.url);
    const id = text(i.id == null ? null : String(i.id), 40) ?? url?.match(/(?:v=|shorts\/)([A-Za-z0-9_-]{6,})/)?.[1] ?? null;
    const p = post("youtube", {
      externalId: id ? `youtube:${id}` : "", url: url ?? "", caption: text(i.title, 300), postedAt: isoDate(i.date), durationS: clockToSeconds(i.duration),
      views: count(i.viewCount), likes: count(i.likes), comments: count(i.commentsCount), shares: null, saves: null,
      hashtags: tags(i.hashtags), sound: null, postType: text(i.type, 20),
    });
    return p ? [p] : [];
  });
  const first = list[0];
  const profile = first ? { displayName: text(first.channelName, 80), bio: null, linkInBio: null, followers: count(first.numberOfSubscribers), verified: null } : null;
  return { posts, profile, private: false };
}

/** A profile name as typed (a handle, @handle or a profile link) turned into a handle and a link. Returns an error message if it does not look right. */
export function cleanHandle(platform: string, raw: string): { handle: string; profileUrl: string } | { error: string } {
  const input = raw.trim();
  if (!input) return { error: "Enter the creator's handle or profile link." };
  let name = input;
  if (/^https?:\/\//i.test(input)) {
    let u: URL;
    try { u = new URL(input); } catch { return { error: "That is not a valid link." }; }
    const host = u.hostname.toLowerCase().replace(/^www\./, "");
    const hosts: Record<string, RegExp> = { tiktok: /^tiktok\.com$/, instagram: /^instagram\.com$/, youtube: /^(youtube\.com|m\.youtube\.com)$/, linkedin: /^linkedin\.com$/ };
    if (!hosts[platform]?.test(host)) return { error: `That link is not on ${platform === "youtube" ? "YouTube" : platform[0].toUpperCase() + platform.slice(1)}.` };
    const seg = u.pathname.split("/").filter(Boolean);
    name = platform === "linkedin" ? (["in", "company"].includes(seg[0]) ? seg[1] ?? "" : "") : seg[0] ?? "";
  }
  name = name.replace(/^@/, "");
  const ok = platform === "youtube" ? /^[A-Za-z0-9._-]{3,30}$/ : platform === "linkedin" ? /^[A-Za-z0-9._%-]{2,100}$/ : /^[A-Za-z0-9._]{1,30}$/;
  if (!ok.test(name)) return { error: "That does not look like a profile name." };
  const url = { tiktok: `https://www.tiktok.com/@${name}`, instagram: `https://www.instagram.com/${name}`, youtube: `https://www.youtube.com/@${name}`, linkedin: `https://www.linkedin.com/in/${name}` }[platform as CreatorPlatform];
  if (!url) return { error: "Unknown platform." };
  return { handle: platform === "linkedin" ? name : name.toLowerCase(), profileUrl: platform === "linkedin" ? url : url.replace(/[^/@]+$/, name.toLowerCase()) };
}

type Actors = Record<string, { actor: string; per_item_usd: number; start_usd?: number }>;
/** The Apify input for one creator. Comments, followers, downloads, transcripts and AI add-ons are always switched off, whatever an actor's defaults become. */
export function buildInputs(platform: string, handle: string, limit: number): { key: string; input: Record<string, unknown> }[] {
  if (platform === "tiktok") return [{ key: "tiktok", input: {
    profiles: [handle], profileScrapeSections: ["videos"], profileSorting: "latest", resultsPerPage: limit, excludePinnedPosts: false,
    shouldDownloadVideos: false, shouldDownloadCovers: false, shouldDownloadSlideshowImages: false, shouldDownloadAvatars: false, downloadSubtitlesOptions: "NEVER_DOWNLOAD_SUBTITLES",
    commentsPerPost: 0, topLevelCommentsPerPost: 0, maxRepliesPerComment: 0, maxFollowersPerProfile: 0, maxFollowingPerProfile: 0,
  } }];
  if (platform === "instagram") return [
    { key: "instagram_reels", input: { username: [handle], resultsLimit: limit, skipPinnedPosts: false, includeSharesCount: false, includeTranscript: false, includeDownloadedVideo: false } },
    { key: "instagram_profile", input: { usernames: [handle], includeAboutSection: false } },
  ];
  if (platform === "youtube") return [{ key: "youtube", input: {
    startUrls: [{ url: `https://www.youtube.com/@${handle}/shorts` }], maxResults: 0, maxResultsShorts: limit, maxResultStreams: 0, sortVideosBy: "NEWEST",
    transcriptionAndSubtitle: "NONE", aiVideoDescription: false, aiVideoSummary: false,
  } }];
  return [];
}

/** What a check should cost at most, in US dollars: the number of results times the published price, plus any start fee. */
export function estimateCostUsd(platform: string, limit: number, actors: Actors): number {
  const keys = platform === "instagram" ? ["instagram_reels", "instagram_profile"] : [platform];
  const usd = keys.reduce((s, k) => {
    const a = actors[k];
    if (!a) return s;
    return s + (k === "instagram_profile" ? 1 : limit) * a.per_item_usd + (a.start_usd ?? 0);
  }, 0);
  return Math.round(usd * 10000) / 10000;
}

export type BudgetCheck = { ok: true } | { ok: false; reason: string };
/** Whether a check fits inside today's and this month's content-research budget (what was really spent, plus this estimate). */
export function checkBudget(spentToday: number, spentMonth: number, estimate: number, daily: number, monthly: number): BudgetCheck {
  if (spentToday + estimate > daily + 1e-9) return { ok: false, reason: `This would take today's creator-research spend to about $${(spentToday + estimate).toFixed(2)}, over the daily limit of $${daily.toFixed(2)}.` };
  if (spentMonth + estimate > monthly + 1e-9) return { ok: false, reason: `This would take this month's creator-research spend to about $${(spentMonth + estimate).toFixed(2)}, over the monthly limit of $${monthly.toFixed(2)}.` };
  return { ok: true };
}

export type Settings = { postsPerCreator: number; minAgeHours: number; minBaseline: number; threshold: number; maxActive: number; actors: Actors };
export function parseCreatorSettings(raw: any): Settings {
  const n = (v: unknown, d: number, min: number) => (typeof v === "number" && Number.isFinite(v) && v >= min ? v : d);
  return {
    postsPerCreator: Math.min(100, Math.round(n(raw?.posts_per_creator, 20, 5))), minAgeHours: n(raw?.min_age_hours, 48, 0),
    minBaseline: Math.round(n(raw?.min_posts_for_baseline, 8, 3)), threshold: n(raw?.outlier_threshold, 3, 1.1), maxActive: Math.round(n(raw?.max_active_creators, 25, 1)),
    actors: raw?.actors && typeof raw.actors === "object" ? raw.actors : {},
  };
}

/**
 * Outlier score for each post: its views divided by that creator's median views over the posts old enough to judge (at least `minAgeHours`).
 * Posts that are too new, or have no view count, get null. A creator with fewer than `minBaseline` old-enough posts gets null for every post.
 */
export function outlierScores(posts: { id: string; views: number | null; postedAt: string | null }[], now: Date, s: Pick<Settings, "minAgeHours" | "minBaseline">): Map<string, number | null> {
  const old = posts.filter((p) => p.views !== null && p.postedAt && (now.getTime() - new Date(p.postedAt).getTime()) / 3_600_000 >= s.minAgeHours);
  const mid = old.length >= s.minBaseline ? median(old.map((p) => p.views as number)) : null;
  return new Map(posts.map((p) => [p.id, mid && old.includes(p) ? Math.round(((p.views as number) / mid) * 100) / 100 : null]));
}

/** Spreadsheet programs run a cell that starts with = + - or @ as a formula; a leading apostrophe stops that. */
const safeCell = (v: unknown): string => {
  let t = v === null || v === undefined ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(t)) t = `'${t}`;
  return /[",\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
};
export function toCsv(headers: string[], rows: unknown[][]): string {
  return [headers, ...rows].map((r) => r.map(safeCell).join(",")).join("\r\n") + "\r\n";
}
