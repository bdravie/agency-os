import { query } from "./db";
import { loadNicheTable } from "./leadConfig";
import { canOutreach, sendBlock, sourceBlock, type Channel, type NicheTable } from "./nicheStatus";

// The niche gate, on the server (docs/NICHE_FOCUS_PLAN.md, N2). Rules in nicheStatus.ts; this file only loads the table and the company.
// It sits on top of lead_gate (complianceGate.ts), never instead of it: call both. The database trigger applies the same rule to logged sends.

let lastSynced = "";

/**
 * Copies the yaml niches' status and channels into niche_rules, so the database trigger reads the same statuses as the app.
 * Only writes when they changed since the last sync in this process. Niches added in the CRM keep theirs in custom_niches, which the trigger reads directly.
 */
export async function syncNicheRules(t: NicheTable): Promise<void> {
  const rows = Object.values(t).filter((n) => !n.custom).map((n) => ({ key: n.key, status: n.status, channels: n.channels }));
  const json = JSON.stringify(rows);
  if (json === lastSynced) return;
  try {
    await query(
      `WITH src AS (SELECT * FROM jsonb_to_recordset($1::jsonb) AS x(key text, status text, channels text[])),
            gone AS (DELETE FROM niche_rules WHERE key NOT IN (SELECT key FROM src))
       INSERT INTO niche_rules (key, status, channels, synced_at) SELECT key, status, channels, now() FROM src
       ON CONFLICT (key) DO UPDATE SET status = EXCLUDED.status, channels = EXCLUDED.channels, synced_at = now()
         WHERE (niche_rules.status, niche_rules.channels) IS DISTINCT FROM (EXCLUDED.status, EXCLUDED.channels)`,
      [json]);
    lastSynced = json;
  } catch { /* before the migration has run: the app check still applies */ }
}

/** The niche table, with the database copy kept in step. Use this in every action that checks a niche. */
export async function nicheTable(): Promise<NicheTable> {
  const t = await loadNicheTable();
  await syncNicheRules(t);
  return t;
}

async function companyNiche(companyId: number): Promise<string | null> {
  const [c] = await query<{ niche: string | null }>(`SELECT niche FROM companies WHERE id = $1`, [companyId]);
  return c?.niche ?? null;
}

/** Why this company may not be drafted for or contacted on this channel, in words (ending with a pointer to the Niches screen), or null if its niche allows it. */
export async function nicheBlockFor(companyId: number, channel: Channel | "active"): Promise<string | null> {
  const [t, niche] = await Promise.all([nicheTable(), companyNiche(companyId)]);
  return sendBlock(t, niche, channel);
}

/** Throws unless the company's niche allows this channel. Call it beside assertSendable. */
export async function assertNicheAllows(companyId: number, channel: Channel | "active"): Promise<void> {
  const b = await nicheBlockFor(companyId, channel);
  if (b) throw new Error(`Blocked: ${b}`);
}

/** Why the Lead Sourcer may not search this niche, or null. */
export async function sourceBlockFor(nicheKey: string): Promise<string | null> {
  return sourceBlock(await nicheTable(), nicheKey);
}

/** Which channels a company's niche allows right now (for showing or hiding drafting panels; the actions check again). */
export async function nicheChannelsFor(companyId: number): Promise<Record<Channel, boolean> & { niche: string | null; t: NicheTable }> {
  const [t, niche] = await Promise.all([nicheTable(), companyNiche(companyId)]);
  return { niche, t, email: canOutreach(t, niche, "email"), linkedin: canOutreach(t, niche, "linkedin"), instagram_dm: canOutreach(t, niche, "instagram_dm") };
}
