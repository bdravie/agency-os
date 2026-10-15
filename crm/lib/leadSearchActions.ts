"use server";

import { execFile } from "node:child_process";
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
  const dryRun = form.get("dry_run") === "on";
  const limit = Math.min(100, Math.max(10, Math.round(Number(form.get("limit")) || 50)));
  let niche: string | null = null, location: string | null = null;
  if (kind === "search") {
    niche = String(form.get("niche") ?? "");
    if (!(await listNiches()).some((n) => n.key === niche)) return { error: "Choose a niche from the list." };
    location = String(form.get("location") ?? "").trim() || null;
    if (location && !/^[A-Za-z0-9 .,'&-]{2,60}$/.test(location)) return { error: "Use a plain town, county or area name (letters, numbers and spaces)." };
  }
  if (!process.env.COMPANIES_HOUSE_API_KEY) return { error: "COMPANIES_HOUSE_API_KEY isn't set. Add it to .env (or your Codespaces secrets) and restart." };
  await query(`UPDATE lead_searches SET status = 'failed', finished_at = now(), output = coalesce(output, '') || 'Timed out.' WHERE status = 'running' AND started_at < now() - make_interval(mins => $1)`, [MAX_RUN_MINUTES]);
  const [busy] = await query(`SELECT 1 FROM lead_searches WHERE status = 'running'`);
  if (busy) return { error: "A search is already running. Wait for it to finish." };

  const [row] = await query<{ id: number }>(`INSERT INTO lead_searches (kind, niche, location, row_limit, dry_run) VALUES ($1,$2,$3,$4,$5) RETURNING id`, [kind, niche, location, limit, dryRun]);
  const args = kind === "enrich" ? ["agency.companies_house", "--enrich", "--limit", String(Math.min(limit, 50))]
    : ["agency.companies_house", "--niche", niche!, "--limit", String(limit), ...(location ? ["--location", location] : []), ...(dryRun ? ["--dry-run"] : [])];
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
