// Rules for the LinkedIn swipe file and the LinkedIn view of What's working (Content > LinkedIn, L4). Pure, so it can be tested.
// A swipe entry is a public LinkedIn post the owner pasted by hand: never fetched, never checked automatically (LinkedIn risks the owner's account).
import { maskContact } from "./breakdownMath.ts";
import { groupScores, type Group, type ScoredPost } from "./insightsMath.ts";

export const SWIPE_TYPES = [
  { code: "text", label: "Text only" }, { code: "image", label: "Text and image" }, { code: "carousel", label: "Carousel (document)" },
  { code: "video", label: "Video" }, { code: "poll", label: "Poll" },
] as const;
export type SwipeType = (typeof SWIPE_TYPES)[number]["code"];
export const SWIPE_TEXT_MAX = 3000;

/**
 * A LinkedIn post link, cleaned: https on linkedin.com, a post or feed-update address, the query string (tracking) dropped.
 * The external id is the activity number when the link has one, so the same post pasted twice is caught.
 */
export function cleanLinkedInPostUrl(raw: string): { url: string; externalId: string } | { error: string } {
  let u: URL;
  try { u = new URL(raw.trim()); } catch { return { error: "Paste the post's link (from ··· > Copy link to post)." }; }
  const host = u.hostname.toLowerCase().replace(/^www\./, "");
  if (u.protocol !== "https:" || host !== "linkedin.com") return { error: "That link is not a LinkedIn post." };
  const path = decodeURIComponent(u.pathname);
  if (!/^\/(posts|feed\/update)\//.test(path)) return { error: "That is not a link to one LinkedIn post (it should start linkedin.com/posts/ or linkedin.com/feed/update/)." };
  const activity = path.match(/(?:activity[:-])(\d{10,25})/)?.[1];
  const url = `https://www.linkedin.com${u.pathname.replace(/\/+$/, "")}`;
  return { url, externalId: activity ? `linkedin:${activity}` : `linkedin:${url.toLowerCase()}` };
}

const count = (v: unknown): number | null | "bad" => {
  const s = String(v ?? "").replace(/[,\s]/g, "").trim();
  if (!s) return null;
  return /^\d{1,9}$/.test(s) ? Number(s) : "bad";
};

/** The post text as kept: contact details masked, @mentions of other people removed (tagged people are never stored), tidied, cut to length. */
export function cleanSwipeText(text: string): string {
  return maskContact(text)
    .replace(/(^|\s)@[\p{L}\p{N}._-]+(?:\s[\p{Lu}][\p{L}'-]+)?/gu, "$1")
    .replace(/\r\n?/g, "\n").replace(/[ \t]{2,}/g, " ").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim().slice(0, SWIPE_TEXT_MAX);
}

export type SwipeInput = { url: string; text: string; type: string; reactions: string; comments: string; reposts: string; postedOn: string };
export type CleanSwipe = { url: string; externalId: string; text: string; type: SwipeType; reactions: number | null; comments: number | null; reposts: number | null; postedOn: string | null };

/** A pasted swipe entry checked and cleaned, or the reason it cannot be saved. */
export function cleanSwipe(i: SwipeInput, today: string): CleanSwipe | { error: string } {
  const link = cleanLinkedInPostUrl(i.url);
  if ("error" in link) return link;
  const text = cleanSwipeText(i.text);
  if (text.split(/\s+/).filter(Boolean).length < 8) return { error: "Paste the post's text (its own words, not the comments): the breakdown works from it." };
  const nums = { reactions: count(i.reactions), comments: count(i.comments), reposts: count(i.reposts) };
  if (Object.values(nums).includes("bad")) return { error: "The numbers must be whole counts, as LinkedIn shows them (no letters)." };
  const postedOn = i.postedOn.trim() || null;
  if (postedOn && (!/^\d{4}-\d{2}-\d{2}$/.test(postedOn) || postedOn > today)) return { error: "The date it was posted cannot be in the future." };
  return {
    ...link, text, type: (SWIPE_TYPES.some((t) => t.code === i.type) ? i.type : "text") as SwipeType,
    reactions: nums.reactions as number | null, comments: nums.comments as number | null, reposts: nums.reposts as number | null, postedOn,
  };
}

// ---------- What's working on LinkedIn ----------

export const wordBand = (words: number): string => (words < 100 ? "Under 100 words" : words < 200 ? "100 to 199 words" : words < 300 ? "200 to 299 words" : "300 words or more");

export type LinkedInScored = { postId: number; contentId: number; title: string; multiple: number; views72: number; postedAt: string; url: string; words: number | null; imageKind: string | null; hookUsed: string | null; hook: string | null; hookAlt: string | null; niche: string | null };

/** Your LinkedIn posts grouped every way that can be acted on. Each group is a median × score with its post count; under 3 posts is thin and never ranked. */
export function linkedinTables(posts: LinkedInScored[], weekdayOf: (iso: string) => string, dayPart: (iso: string) => string, imageLabel: (k: string | null) => string): { title: string; groups: Group[] }[] {
  const scored = posts.map((p) => ({ ...p, platform: "linkedin" }) as unknown as ScoredPost & LinkedInScored);
  const opening = (p: LinkedInScored) => {
    if (!p.hookAlt || !p.hookUsed) return null;
    const used = p.hookUsed.trim();
    return used === (p.hook ?? "").trim() ? "Opening A" : used === p.hookAlt.trim() ? "Opening B" : null;
  };
  const by = (f: (p: LinkedInScored) => string | null) => groupScores(scored, (p) => f(p as unknown as LinkedInScored));
  return [
    { title: "Image", groups: by((p) => imageLabel(p.imageKind)) },
    { title: "Length", groups: by((p) => (p.words === null ? "Video" : wordBand(p.words))) },
    { title: "Weekday posted", groups: by((p) => weekdayOf(p.postedAt)) },
    { title: "Time of day posted", groups: by((p) => dayPart(p.postedAt)) },
    { title: "Niche", groups: by((p) => p.niche) },
    { title: "Opening A against B", groups: groupScores(scored.filter((p) => opening(p as unknown as LinkedInScored)), (p) => opening(p as unknown as LinkedInScored)) },
  ].filter((t) => t.groups.length > 0);
}
