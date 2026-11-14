// Per-niche weekly targets, the stop rule and the content mix check (docs/NICHE_FOCUS_PLAN.md, N4). Pure: no database, no clock,
// so it can be tested. The pace maths itself is paceMath.ts; niche rules are nicheStatus.ts.
import { goalProgress, type Goal } from "./paceMath.ts";
import { canOutreach, NICHE_PLATFORMS, platformsFor, type Channel, type NichePlatform, type NicheTable } from "./nicheStatus.ts";

/** The stop rule: this many touches since the offer last changed, with no call booked, means change the offer, not the niche. */
export const STOP_TOUCHES = 150;
export const STOP_MESSAGE = `${STOP_TOUCHES} touches, no calls: change the offer, not the niche`;

export type SendKind = "emails" | "instagram_dms" | "linkedin_notes";
export const SEND_KINDS: SendKind[] = ["emails", "instagram_dms", "linkedin_notes"];
export const SEND_CHANNEL: Record<SendKind, Channel> = { emails: "email", instagram_dms: "instagram_dm", linkedin_notes: "linkedin" };
export const SEND_LABEL: Record<SendKind, string> = { emails: "Emails", instagram_dms: "Instagram DMs", linkedin_notes: "LinkedIn notes" };
export const PLATFORM_NAME: Record<NichePlatform, string> = { linkedin: "LinkedIn", instagram: "Instagram", tiktok: "TikTok" };

export type NicheWeekTarget = Partial<Record<SendKind, number>> & { posts: Partial<Record<NichePlatform, number>> };
export type NicheTargets = { byNiche: Record<string, NicheWeekTarget>; postsByPlatform: Partial<Record<NichePlatform, number>> };

const count = (v: unknown): number | null => { const n = Number(v); return Number.isInteger(n) && n > 0 ? n : null; };

/** The by_niche and posts_by_platform blocks of config/targets.yaml. Anything that is not a positive whole number is left out. */
export function parseNicheTargets(raw: any): NicheTargets {
  const byNiche: Record<string, NicheWeekTarget> = {};
  for (const [key, t] of Object.entries<any>(raw?.by_niche ?? {})) {
    if (!t || typeof t !== "object") continue;
    const row: NicheWeekTarget = { posts: {} };
    for (const k of SEND_KINDS) { const n = count(t[k]); if (n) row[k] = n; }
    for (const p of NICHE_PLATFORMS) { const n = count(t.posts?.[p]); if (n) row.posts[p] = n; }
    byNiche[key] = row;
  }
  const postsByPlatform: Partial<Record<NichePlatform, number>> = {};
  for (const p of NICHE_PLATFORMS) { const n = count(raw?.posts_by_platform?.[p]); if (n) postsByPlatform[p] = n; }
  return { byNiche, postsByPlatform };
}

export type NicheWeekActual = Record<SendKind, number> & { posts: Partial<Record<NichePlatform, number>> };
export type NichePaceRow = { key: string; label: string; status: string; goals: Goal[]; ignored: string[] };

/**
 * One Dashboard row per active or seeding niche, in table order: each target against this week so far. A target for a channel the niche
 * may not use (canOutreach) or a platform it does not post to (platformsFor) becomes a note instead of a goal, so the Dashboard never
 * asks for outreach the niche refuses. `elapsed` is the share of the week gone.
 */
export function nichePaceRows(t: NicheTable, targets: NicheTargets, actual: Record<string, NicheWeekActual>, elapsed: number): NichePaceRow[] {
  return Object.values(t).filter((n) => n.status === "active" || n.status === "seeding").map((n) => {
    const target = targets.byNiche[n.key] ?? { posts: {} };
    const got = actual[n.key];
    const goals: Goal[] = [], ignored: string[] = [];
    for (const k of SEND_KINDS) {
      const aim = target[k];
      if (!aim) continue;
      if (!canOutreach(t, n.key, SEND_CHANNEL[k])) { ignored.push(`${SEND_LABEL[k]} (${n.status === "seeding" ? "seeding: LinkedIn only" : "not one of its channels"})`); continue; }
      goals.push(goalProgress(`${n.key}-${k}`, SEND_LABEL[k], got?.[k] ?? 0, aim, elapsed));
    }
    const platforms = platformsFor(t, n.key);
    for (const p of NICHE_PLATFORMS) {
      const aim = target.posts[p];
      if (!aim) continue;
      if (!platforms.includes(p)) { ignored.push(`${PLATFORM_NAME[p]} posts (not one of its platforms)`); continue; }
      goals.push(goalProgress(`${n.key}-post-${p}`, `${PLATFORM_NAME[p]} posts`, got?.posts[p] ?? 0, aim, elapsed));
    }
    return { key: n.key, label: n.label, status: n.status, goals, ignored };
  });
}

/** Whether the stop rule fires for a niche. It only applies to active niches; it clears when a call is booked or the offer changes (which restarts the count). */
export const stopRuleHit = (status: string, touches: number, calls: number): boolean => status === "active" && touches >= STOP_TOUCHES && calls === 0;

/** Where a content item goes: a LinkedIn post (by its format) goes to LinkedIn; anything else to the platforms ticked on it. */
export function itemPlatforms(item: { format: string | null; platforms: string[] | null }, linkedinFormat: string): NichePlatform[] {
  if (item.format === linkedinFormat) return ["linkedin"];
  return NICHE_PLATFORMS.filter((p) => (item.platforms ?? []).includes(p));
}

export type PlannedItem = { id: number; idea: string; niche: string | null; format: string | null; platforms: string[] | null };
export type MixRow = { platform: NichePlatform; planned: number; target: number | null };
export type MixWarning = { id: number; idea: string; text: string };

/**
 * This week's planned posts per platform against posts_by_platform, and a warning for each item planned on a platform its niche does not use
 * (for example a beauty post on LinkedIn, or a property post on Instagram or TikTok). An item with no niche is counted but not flagged.
 */
export function contentMix(t: NicheTable, targets: NicheTargets, items: PlannedItem[], linkedinFormat: string): { rows: MixRow[]; warnings: MixWarning[] } {
  const planned: Record<string, number> = {};
  const warnings: MixWarning[] = [];
  for (const it of items) {
    const where = itemPlatforms(it, linkedinFormat);
    for (const p of where) planned[p] = (planned[p] ?? 0) + 1;
    if (!it.niche) continue;
    const allowed = platformsFor(t, it.niche);
    const bad = where.filter((p) => !allowed.includes(p));
    if (!bad.length) continue;
    const name = t[it.niche]?.label ?? it.niche;
    const why = !t[it.niche] ? "is not a niche in your list" : t[it.niche].status === "parked" ? "is parked" : `posts on ${allowed.map((p) => PLATFORM_NAME[p]).join(" and ") || "no platform"} only`;
    warnings.push({ id: it.id, idea: it.idea, text: `${bad.map((p) => PLATFORM_NAME[p]).join(" and ")} planned, but ${name} ${why}.` });
  }
  const rows = NICHE_PLATFORMS.filter((p) => planned[p] || targets.postsByPlatform[p])
    .map((p) => ({ platform: p, planned: planned[p] ?? 0, target: targets.postsByPlatform[p] ?? null }));
  return { rows, warnings };
}
