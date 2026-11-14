import { copyFile, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { query } from "./db";
import { nicheTable } from "./nicheGate";
import { configProblems, STATUSES, type Niche, type NicheTable } from "./nicheStatus";
import { applyNicheEdit, type NichePatch } from "./nicheYaml";

// The Niches screen's data (docs/NICHE_FOCUS_PLAN.md, N3): one card per niche with live counts, plus the recent niche changes.
// Server-side only. The rules live in nicheStatus.ts and nicheChange.ts.

export type NicheCounts = { companies: number; touches: number; calls: number; clients: number };
export type NicheCard = Niche & { counts: NicheCounts; override: { at: string; reason: string } | null };
export type NicheChange = { id: number; type: string; body: string | null; occurred_at: string };

/** Logged sends that count as a touch (the same three the stop rule in N4 counts). */
export const TOUCH_TYPES = ["email_logged", "dm_logged", "linkedin_note_logged"];

const byKey = (rows: { key: string | null; n: string }[]) => Object.fromEntries(rows.filter((r) => r.key).map((r) => [r.key as string, Number(r.n)]));

/** Paying clients per niche: companies with a deal Won that has a monthly value. The unlock rule reads this. */
export async function payingClients(): Promise<Record<string, number>> {
  return byKey(await query<{ key: string | null; n: string }>(
    `SELECT c.niche AS key, count(DISTINCT d.company_id) AS n FROM deals d JOIN companies c ON c.id = d.company_id
      WHERE d.stage = 'Won' AND d.monthly_value_gbp > 0 GROUP BY c.niche`));
}

export async function loadNicheScreen(): Promise<{ cards: NicheCard[]; problems: string[]; recent: NicheChange[] }> {
  const t = await nicheTable();
  const [companies, touches, calls, clients, overrides, recent] = await Promise.all([
    query<{ key: string | null; n: string }>(`SELECT niche AS key, count(*) AS n FROM companies GROUP BY niche`),
    query<{ key: string | null; n: string }>(
      `SELECT c.niche AS key, count(*) AS n FROM activities a JOIN companies c ON c.id = a.company_id WHERE a.type = ANY($1) GROUP BY c.niche`, [TOUCH_TYPES]),
    // Meetings booked from the CRM, plus calendar events with a saved contact that the CRM did not book (so nothing is counted twice).
    query<{ key: string | null; n: string }>(
      `SELECT c.niche AS key, count(*) AS n FROM (
         SELECT COALESCE(m.company_id, ct.company_id) AS company_id FROM meetings m LEFT JOIN contacts ct ON ct.id = m.contact_id WHERE m.status = 'scheduled'
         UNION ALL
         SELECT company_id FROM calendar_events WHERE company_id IS NOT NULL AND meeting_id IS NULL AND status <> 'cancelled'
       ) x JOIN companies c ON c.id = x.company_id GROUP BY c.niche`),
    payingClients(),
    query<{ key: string; at: string; reason: string }>(
      `SELECT DISTINCT ON (meta->>'niche') meta->>'niche' AS key, occurred_at AS at, COALESCE(meta->>'reason', '') AS reason
         FROM activities WHERE type = 'niche_unlock_override' ORDER BY meta->>'niche', occurred_at DESC`),
    query<NicheChange>(`SELECT id, type, body, occurred_at FROM activities WHERE type LIKE 'niche\\_%' ORDER BY occurred_at DESC LIMIT 12`),
  ]);
  const co = byKey(companies), to = byKey(touches), ca = byKey(calls);
  const ov = Object.fromEntries(overrides.map((o) => [o.key, { at: o.at, reason: o.reason }]));
  const cards = Object.values(t)
    .map((n) => ({ ...n, counts: { companies: co[n.key] ?? 0, touches: to[n.key] ?? 0, calls: ca[n.key] ?? 0, clients: clients[n.key] ?? 0 }, override: n.status === "active" ? ov[n.key] ?? null : null }))
    .sort((a, b) => STATUSES.indexOf(a.status) - STATUSES.indexOf(b.status) || Number(a.custom) - Number(b.custom) || a.label.localeCompare(b.label));
  return { cards, problems: configProblems(t), recent };
}

const NICHES_FILE = () => path.join(path.resolve(process.cwd(), ".."), "config", "niches.yaml");

/** Saves a change to a yaml niche back into config/niches.yaml, keeping the previous file as niches.yaml.bak. */
async function writeYamlNiche(key: string, patch: NichePatch): Promise<string | null> {
  const file = NICHES_FILE();
  const r = applyNicheEdit(await readFile(file, "utf8"), key, patch);
  if (r.error) return r.error;
  await copyFile(file, `${file}.bak`);
  const tmp = `${file}.tmp`;
  await writeFile(tmp, r.text!);
  await rename(tmp, file);   // in one step, so the Python tools and the next request never read half a file
  return null;
}

/** Saves a change to a niche where it lives: config/niches.yaml for the yaml niches, custom_niches for the ones added in the CRM. */
export async function saveNiche(n: Niche, patch: NichePatch): Promise<string | null> {
  if (n.custom) {
    const sets: string[] = [], vals: unknown[] = [n.key];
    const COLUMNS = new Set(["status", "promise", "offer", "channels", "platforms"]);   // never a column name from anywhere else
    for (const [field, value] of Object.entries(patch)) if (value !== undefined && COLUMNS.has(field)) { vals.push(value); sets.push(`${field} = $${vals.length}`); }
    if (sets.length) await query(`UPDATE custom_niches SET ${sets.join(", ")} WHERE key = $1`, vals);
    return null;
  }
  return writeYamlNiche(n.key, patch);
}

/** The niche table again after a change, which also brings the database copy (niche_rules) into step. */
export const freshTable = (): Promise<NicheTable> => nicheTable();
