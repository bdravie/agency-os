"use server";

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { revalidatePath } from "next/cache";
import { query } from "./db";
import { requireLogin } from "./auth";
import { ROOT, pythonCommand, runChJob, scrub } from "./launch";

// Runs the Companies House search (agency.companies_house) in the background and records what it printed.
// Free to run. Only a niche from config/niches.yaml and a plain place name can be passed, and no shell is involved.
const MAX_RUN_MINUTES = 20;

export type SearchState = { id?: number; error?: string } | null;
export type SearchStatus = { id: number; kind: string; status: "running" | "done" | "failed"; output: string; startedAt: string; dryRun: boolean; niche: string | null; location: string | null } | null;

/** Starts the free "find generic emails" run in the background. (Searching for companies is done by Lead Sourcer.) */
export async function startLeadSearch(_prev: SearchState, form: FormData): Promise<SearchState> {
  await requireLogin();
  if (!process.env.COMPANIES_HOUSE_API_KEY?.trim()) return { error: "The server can't see COMPANIES_HOUSE_API_KEY." };
  const [busy] = await query(`SELECT 1 FROM lead_searches WHERE status = 'running' AND started_at > now() - make_interval(mins => $1)`, [MAX_RUN_MINUTES]);
  if (busy) return { error: "A search is already running. Wait for it to finish." };
  const limit = Math.min(50, Math.max(10, Math.round(Number(form.get("limit")) || 25)));
  const [row] = await query<{ id: number }>(`INSERT INTO lead_searches (kind, niche, location, row_limit, dry_run) VALUES ('enrich', NULL, NULL, $1, false) RETURNING id`, [limit]);
  runChJob(Number(row.id), ["agency.companies_house", "--enrich", "--limit", String(limit)]);
  return { id: Number(row.id) };
}

export async function leadSearchStatus(id: number): Promise<SearchStatus> {
  await requireLogin();
  const [r] = await query<any>(id ? `SELECT * FROM lead_searches WHERE id = $1` : `SELECT * FROM lead_searches ORDER BY id DESC LIMIT 1`, id ? [id] : []);
  if (!r) return null;
  return { id: Number(r.id), kind: r.kind, status: r.status, output: r.output ?? "", startedAt: new Date(r.started_at).toISOString(), dryRun: r.dry_run, niche: r.niche, location: r.location };
}

/** Adds the companies you ticked to the CRM (using facts already fetched, so no further API calls). */
export async function addSearchResultsAction(searchId: number, numbers: string[]): Promise<{ ok?: string; error?: string }> {
  await requireLogin();
  const chosen = [...new Set(numbers.filter((n) => /^[A-Z0-9]{8}$/.test(n)))].slice(0, 200);
  if (chosen.length === 0) return { error: "Tick at least one company." };
  const [found] = await query(`SELECT 1 FROM lead_search_results WHERE search_id = $1 AND company_number = ANY($2) LIMIT 1`, [searchId, chosen]);
  if (!found) return { error: "Those companies aren't in this search." };
  const { cmd, args } = pythonCommand(["agency.companies_house", "--add", String(searchId), "--numbers", chosen.join(",")]);
  try {
    const { stdout } = await promisify(execFile)(cmd, args, { cwd: ROOT, env: process.env, timeout: 120_000, maxBuffer: 2_000_000 });
    revalidatePath("/companies");
    return { ok: scrub(String(stdout)).trim() };
  } catch (err: any) {
    return { error: scrub(String(err?.stderr || err?.message || err)).split("\n").filter(Boolean).slice(-3).join(" ") };
  }
}
