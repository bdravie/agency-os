"use server";

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync } from "node:fs";
import path from "node:path";
import { revalidatePath } from "next/cache";
import { query } from "./db";
import { requireLogin } from "./auth";
import { listNiches } from "./leadConfig";

// Runs the Companies House search (agency.companies_house) in the background and records what it printed.
// Free to run. Only a niche from config/niches.yaml and a plain place name can be passed, and no shell is involved.
const ROOT = path.resolve(process.cwd(), "..");
const MAX_RUN_MINUTES = 20;

export type SearchState = { id?: number; error?: string } | null;
export type SearchStatus = { id: number; kind: string; status: "running" | "done" | "failed"; output: string; startedAt: string; dryRun: boolean; niche: string | null; location: string | null } | null;

/** The project's own Python (no PATH setup needed), falling back to uv. */
function pythonCommand(args: string[]): { cmd: string; args: string[] } {
  const venv = path.join(ROOT, ".venv", "bin", "python");
  return existsSync(venv) ? { cmd: venv, args: ["-m", ...args] } : { cmd: "uv", args: ["run", "python", "-m", ...args] };
}

/** Never let a secret reach the screen or the database, even inside an error message. */
const scrub = (text: string) => ["DATABASE_URL", "COMPANIES_HOUSE_API_KEY", "ANTHROPIC_API_KEY", "GOOGLE_PLACES_API_KEY", "SEARCH_API_KEY", "APP_PASSWORD", "SESSION_SECRET"]
  .reduce((t, k) => { const v = process.env[k]; return v && v.length > 6 ? t.split(v).join("[hidden]") : t; }, text).slice(-6000);

export async function startLeadSearch(_prev: SearchState, form: FormData): Promise<SearchState> {
  await requireLogin();
  const kind = form.get("kind") === "enrich" ? "enrich" : "search";
  const dryRun = false;
  const limit = Math.min(100, Math.max(10, Math.round(Number(form.get("limit")) || 50)));
  let niche: string | null = null, location: string | null = null;
  if (kind === "search") {
    niche = String(form.get("niche") ?? "");
    if (!(await listNiches()).some((n) => n.key === niche)) return { error: "Choose a niche from the list." };
    location = String(form.get("location") ?? "").trim() || null;
    if (location && !/^[A-Za-z0-9 .,'&-]{2,60}$/.test(location)) return { error: "Use a plain town, county or area name (letters, numbers and spaces)." };
  }
  if (!process.env.COMPANIES_HOUSE_API_KEY?.trim()) return { error: "The server can't see COMPANIES_HOUSE_API_KEY (it is missing or empty). Put it in the .env file in the top-level folder as COMPANIES_HOUSE_API_KEY=yourkey, or set it as a Codespaces secret, then stop and restart the CRM." };
  await query(`UPDATE lead_searches SET status = 'failed', finished_at = now(), output = coalesce(output, '') || 'Timed out.' WHERE status = 'running' AND started_at < now() - make_interval(mins => $1)`, [MAX_RUN_MINUTES]);
  const [busy] = await query(`SELECT 1 FROM lead_searches WHERE status = 'running'`);
  if (busy) return { error: "A search is already running. Wait for it to finish." };

  const [row] = await query<{ id: number }>(`INSERT INTO lead_searches (kind, niche, location, row_limit, dry_run) VALUES ($1,$2,$3,$4,$5) RETURNING id`, [kind, niche, location, limit, dryRun]);
  // A search never saves anything itself: it keeps what it found (--stage) so you choose which companies to add.
  const args = kind === "enrich" ? ["agency.companies_house", "--enrich", "--limit", String(Math.min(limit, 50))]
    : ["agency.companies_house", "--niche", niche!, "--limit", String(limit), ...(location ? ["--location", location] : []), "--stage", String(row.id)];
  const { cmd, args: full } = pythonCommand(args);
  execFile(cmd, full, { cwd: ROOT, env: process.env, timeout: MAX_RUN_MINUTES * 60_000, maxBuffer: 5_000_000 }, (err, stdout, stderr) => {
    const output = scrub(`${stdout}${err ? `\n${stderr || err.message}` : ""}`.trim());
    void query(`UPDATE lead_searches SET status = $2, output = $3, finished_at = now() WHERE id = $1`, [row.id, err ? "failed" : "done", output]).then(() => { revalidatePath("/companies"); });
  });
  return { id: Number(row.id) };
}

export async function leadSearchStatus(id: number): Promise<SearchStatus> {
  await requireLogin();
  const [r] = await query<any>(id ? `SELECT * FROM lead_searches WHERE id = $1` : `SELECT * FROM lead_searches ORDER BY id DESC LIMIT 1`, id ? [id] : []);
  if (!r) return null;
  return { id: Number(r.id), kind: r.kind, status: r.status, output: r.output ?? "", startedAt: new Date(r.started_at).toISOString(), dryRun: r.dry_run, niche: r.niche, location: r.location };
}

export type SearchResult = { number: string; name: string; postcode: string | null; address: string | null; fit: number | null; notes: string | null; est: number | null; skip: string | null; added: boolean };

/** What a search found, best fit first. */
export async function leadSearchResults(searchId: number): Promise<SearchResult[]> {
  await requireLogin();
  const rows = await query<any>(`SELECT company_number, name, postcode, address, fit_score, fit_notes, est_revenue_gbp::float AS est, skip_reason, added_at FROM lead_search_results WHERE search_id = $1
                                  ORDER BY (skip_reason IS NOT NULL OR added_at IS NOT NULL), fit_score DESC NULLS LAST, name LIMIT 200`, [searchId]);
  return rows.map((r) => ({ number: r.company_number, name: r.name, postcode: r.postcode, address: r.address, fit: r.fit_score, notes: r.fit_notes, est: r.est, skip: r.skip_reason, added: !!r.added_at }));
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
