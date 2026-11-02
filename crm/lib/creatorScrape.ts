import { readFile } from "node:fs/promises";
import path from "node:path";
import { parse } from "yaml";
import { query, tx } from "./db";
import { ApifyError, abortRun, apifyToken, getItems, getRun, startActor } from "./apify";
import {
  SCRAPABLE, buildInputs, checkBudget, estimateCostUsd, normaliseInstagramProfile, normaliseInstagramReels, normaliseTikTok, normaliseYouTube, outlierScores, parseCreatorSettings,
  type CreatorProfile, type CreatorPost, type Settings,
} from "./creatorMath";

// Creator research through Apify. Click-only, one run at a time, public profile and post numbers only (see the allow-list in creatorMath.ts).
// A hard spend cap goes to Apify with every run; the daily and monthly limits are checked against what was really spent (content_runs).
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const g = globalThis as unknown as { _creatorCheckRunning?: boolean };

export async function loadCreatorSettings(): Promise<Settings> {
  return parseCreatorSettings(parse(await readFile(path.join(path.resolve(process.cwd(), ".."), "config/creators.yaml"), "utf8")));
}

/** CONTENT_APIFY_DAILY_BUDGET_USD and CONTENT_APIFY_MONTHLY_BUDGET_USD: kept apart from the lead-search budget. */
export function creatorBudgets(env: Record<string, string | undefined> = process.env): { daily: number; monthly: number; minCap: number } {
  const n = (v: string | undefined, d: number) => { const x = Number(v); return v !== undefined && v.trim() !== "" && Number.isFinite(x) && x >= 0 ? x : d; };
  return { daily: n(env.CONTENT_APIFY_DAILY_BUDGET_USD, 0.3), monthly: n(env.CONTENT_APIFY_MONTHLY_BUDGET_USD, 2), minCap: n(env.APIFY_MIN_RUN_CAP_USD, 0.5) };
}

export async function creatorSpend(): Promise<{ today: number; month: number }> {
  const [r] = await query<{ today: string; month: string }>(
    `SELECT coalesce(sum(cost_usd) FILTER (WHERE (ran_at AT TIME ZONE 'Europe/London')::date = (now() AT TIME ZONE 'Europe/London')::date), 0) AS today,
            coalesce(sum(cost_usd) FILTER (WHERE date_trunc('month', ran_at AT TIME ZONE 'Europe/London') = date_trunc('month', now() AT TIME ZONE 'Europe/London')), 0) AS month
       FROM content_runs WHERE tool LIKE 'creators:%'`);
  return { today: Number(r.today), month: Number(r.month) };
}

export type CheckResult = { ok: true; found: number; added: number; outliers: number; costUsd: number; warning?: string } | { ok: false; error: string };

async function runActor(actor: string, input: Record<string, unknown>, limit: number, minCap: number): Promise<{ items: unknown[]; costUsd: number }> {
  const run = await startActor(actor, input, { maxChargeUsd: minCap, timeoutSecs: 150 });
  let cur = run;
  for (let waited = 0; ["READY", "RUNNING", "TIMING-OUT"].includes(cur.status) && waited < 160; waited += 3) {
    await sleep(3000);
    cur = await getRun(run.id);
  }
  if (["READY", "RUNNING", "TIMING-OUT"].includes(cur.status)) {
    await abortRun(run.id).catch(() => {});
    throw new ApifyError("The check took too long and was stopped. You are only charged for what it had already done.");
  }
  const costUsd = Number((await getRun(run.id).catch(() => cur)).usageTotalUsd ?? cur.usageTotalUsd ?? 0) || 0;
  if (cur.status !== "SUCCEEDED") throw Object.assign(new ApifyError(`Apify ended the run as ${cur.status.toLowerCase().replace(/-/g, " ")}.`), { costUsd });
  const items = cur.defaultDatasetId ? await getItems(cur.defaultDatasetId, limit + 5) : [];
  return { items, costUsd };
}

/**
 * Check one creator: fetch their latest public posts (and public profile), keep only the allowed fields, save them, and score outliers.
 * Refuses before spending anything if the creator is paused, is on LinkedIn, or the cost would break the daily or monthly limit.
 */
export async function checkCreator(creatorId: number): Promise<CheckResult> {
  const [c] = await query<any>(`SELECT id, platform, handle, active FROM creators WHERE id = $1`, [creatorId]);
  if (!c) return { ok: false, error: "That creator no longer exists." };
  if (!c.active) return { ok: false, error: "This creator is paused. Switch them back on first." };
  if (!(SCRAPABLE as readonly string[]).includes(c.platform)) return { ok: false, error: "LinkedIn is never checked automatically (it risks your account). Add posts you want to learn from to your swipe notes by hand." };
  if (!apifyToken()) return { ok: false, error: "The server can't see APIFY_TOKEN. Add it to the env file in the top-level folder and restart the CRM." };

  const s = await loadCreatorSettings();
  const b = creatorBudgets();
  const estimate = estimateCostUsd(c.platform, s.postsPerCreator, s.actors);
  const spend = await creatorSpend();
  const gate = checkBudget(spend.today, spend.month, estimate, b.daily, b.monthly);
  if (!gate.ok) return { ok: false, error: gate.reason };
  if (g._creatorCheckRunning) return { ok: false, error: "Another check is still running. Wait for it to finish." };
  g._creatorCheckRunning = true;

  let costUsd = 0, warning: string | undefined, posts: CreatorPost[] = [], profile: CreatorProfile | null = null, isPrivate = false;
  try {
    for (const { key, input } of buildInputs(c.platform, c.handle, s.postsPerCreator)) {
      const actor = s.actors[key]?.actor;
      if (!actor) throw new ApifyError(`No actor is set for ${key} in config/creators.yaml.`);
      try {
        const r = await runActor(actor, input, s.postsPerCreator, b.minCap);
        costUsd += r.costUsd;
        if (key === "tiktok") { const n = normaliseTikTok(r.items); posts = n.posts; profile = n.profile; isPrivate = n.private; }
        else if (key === "youtube") { const n = normaliseYouTube(r.items); posts = n.posts; profile = n.profile; }
        else if (key === "instagram_reels") posts = normaliseInstagramReels(r.items).posts;
        else if (key === "instagram_profile") { const n = normaliseInstagramProfile(r.items); profile = n.profile; isPrivate = isPrivate || n.private; }
      } catch (err) {
        costUsd += (err as { costUsd?: number }).costUsd ?? 0;
        if (key === "instagram_profile") { warning = "The posts were saved, but the profile (bio and followers) could not be read."; continue; }
        throw err;
      }
    }
  } catch (err) {
    await query(`INSERT INTO content_runs (tool, cost_usd, items) VALUES ($1, $2, 0)`, [`creators:${c.platform}`, costUsd]);
    return { ok: false, error: err instanceof Error ? err.message : "The check failed." };
  } finally {
    g._creatorCheckRunning = false;
  }

  if (isPrivate) {
    await query(`UPDATE creators SET active = false, last_checked_at = now() WHERE id = $1`, [creatorId]);
    await query(`INSERT INTO content_runs (tool, cost_usd, items) VALUES ($1, $2, 0)`, [`creators:${c.platform}`, costUsd]);
    return { ok: false, error: "This account is private, so nothing was saved and the creator has been paused." };
  }

  const before = Number((await query<{ n: string }>(`SELECT count(*) AS n FROM creator_posts WHERE creator_id = $1`, [creatorId]))[0].n);
  const flagged = await tx(async (cl) => {
    for (const p of posts) {
      await cl.query(
        `INSERT INTO creator_posts (creator_id, platform, external_id, url, caption, posted_at, duration_s, views, likes, comments, shares, saves, hashtags, sound, post_type, cta_keyword, fetched_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16, now())
         ON CONFLICT (external_id) DO UPDATE SET views = EXCLUDED.views, likes = EXCLUDED.likes, comments = EXCLUDED.comments, shares = EXCLUDED.shares, saves = EXCLUDED.saves,
           caption = EXCLUDED.caption, hashtags = EXCLUDED.hashtags, sound = EXCLUDED.sound, cta_keyword = EXCLUDED.cta_keyword, fetched_at = now()`,
        [creatorId, p.platform, p.externalId, p.url, p.caption, p.postedAt, p.durationS, p.views, p.likes, p.comments, p.shares, p.saves, p.hashtags, p.sound, p.postType, p.ctaKeyword]);
    }
    // score the creator's latest posts against their own median
    const { rows } = await cl.query(`SELECT id, views, posted_at FROM creator_posts WHERE creator_id = $1 ORDER BY posted_at DESC NULLS LAST LIMIT $2`, [creatorId, Math.max(s.postsPerCreator, 30)]);
    const scores = outlierScores(rows.map((r: any) => ({ id: String(r.id), views: r.views === null ? null : Number(r.views), postedAt: r.posted_at ? new Date(r.posted_at).toISOString() : null })), new Date(), s);
    let n = 0;
    for (const [id, score] of scores) { await cl.query(`UPDATE creator_posts SET outlier_score = $2 WHERE id = $1`, [id, score]); if (score !== null && score >= s.threshold) n++; }
    await cl.query(
      `UPDATE creators SET last_checked_at = now(), profile_checked_at = CASE WHEN $2::boolean THEN now() ELSE profile_checked_at END,
         display_name = COALESCE($3, display_name), bio = COALESCE($4, bio), link_in_bio = COALESCE($5, link_in_bio), followers = COALESCE($6, followers), verified = COALESCE($7, verified) WHERE id = $1`,
      [creatorId, !!profile, profile?.displayName ?? null, profile?.bio ?? null, profile?.linkInBio ?? null, profile?.followers ?? null, profile?.verified ?? null]);
    await cl.query(`INSERT INTO content_runs (tool, cost_usd, items) VALUES ($1, $2, $3)`, [`creators:${c.platform}`, costUsd, posts.length]);
    return n;
  });
  const after = Number((await query<{ n: string }>(`SELECT count(*) AS n FROM creator_posts WHERE creator_id = $1`, [creatorId]))[0].n);
  return { ok: true, found: posts.length, added: after - before, outliers: flagged, costUsd, warning };
}
