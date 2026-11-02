"use server";

import { revalidatePath } from "next/cache";
import { query } from "./db";
import { logActivity } from "./activity";
import { requireLogin } from "./auth";
import { cleanTrend } from "./briefMath";
import { loadContentConfig } from "./content";
import { writeBrief } from "./contentBrief";

type Result = { ok: true } | { ok: false; error: string };

/** Click-only. Writes (or rewrites) this week's brief. Costs a few pence. */
export async function writeBriefAction(): Promise<Result> {
  await requireLogin();
  try {
    const r = await writeBrief();
    if (!r.ok) return r;
    await logActivity("content_brief", { body: `Weekly brief for the week of ${r.brief.week_start}` });
    revalidatePath("/content/brief"); revalidatePath("/");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: `Something went wrong: ${err instanceof Error ? err.message : String(err)}` };
  }
}

/** Note a trend you saw: a title, an optional link and a note. Kept apart from any person: no usernames, no messages. */
export async function addTrend(title: string, url: string, detail: string, niche: string): Promise<Result> {
  await requireLogin();
  const c = cleanTrend({ title, url, detail, niche }, (await loadContentConfig()).niches);
  if ("error" in c) return { ok: false, error: c.error };
  const t = c.trend;
  await query(`INSERT INTO trend_signals (source, niche, title, detail, url) VALUES ('manual', $1, $2, $3, $4)`, [t.niche, t.title, t.detail, t.url]);
  revalidatePath("/content/trends");
  return { ok: true };
}

export async function removeTrend(id: number): Promise<Result> {
  await requireLogin();
  const rows = await query(`DELETE FROM trend_signals WHERE id = $1 RETURNING id`, [id]);
  if (!rows.length) return { ok: false, error: "That trend no longer exists." };
  revalidatePath("/content/trends");
  return { ok: true };
}
