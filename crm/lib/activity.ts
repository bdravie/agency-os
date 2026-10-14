import { query } from "./db";

// Plain server-side helper (not a server action, so it is not callable from the browser).
export async function logActivity(
  type: string, o: { company_id?: number | null; contact_id?: number | null; deal_id?: number | null; channel?: string | null; body?: string | null } = {},
) {
  await query(
    `INSERT INTO activities (company_id, contact_id, deal_id, type, channel, body) VALUES ($1,$2,$3,$4,$5,$6)`,
    [o.company_id ?? null, o.contact_id ?? null, o.deal_id ?? null, type, o.channel ?? null, o.body ?? null],
  );
}
