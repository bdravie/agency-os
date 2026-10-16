import { query } from "./db";
import { STALE_DAYS, gateReasons } from "./compliance.ts";

export type Gate = { sendable: boolean; reasons: string[]; checkedAt: Date | null; stale: boolean };

/** Reads the gate for one lead. `sendable` comes straight from the database view. */
export async function loadGate(companyId: number): Promise<Gate | null> {
  const [r] = await query<any>(
    `SELECT g.sendable, g.suppressed, c.compliance_status, c.company_type, c.company_status, c.opted_out, c.opted_out_at, c.compliance_checked_at
       FROM lead_gate g JOIN companies c ON c.id = g.company_id WHERE g.company_id = $1`, [companyId]);
  if (!r) return null;
  const checkedAt = r.compliance_checked_at ? new Date(r.compliance_checked_at) : null;
  return { sendable: r.sendable, reasons: r.sendable ? [] : gateReasons(r), checkedAt, stale: !!checkedAt && Date.now() - checkedAt.getTime() > STALE_DAYS * 86_400_000 };
}

/** Throws unless the lead may be contacted. Call this first in anything that sends or logs a send. */
export async function assertSendable(companyId: number): Promise<void> {
  const g = await loadGate(companyId);
  if (!g) throw new Error("Company not found.");
  if (!g.sendable) throw new Error(`Blocked: ${g.reasons.join(" ")}`);
}
