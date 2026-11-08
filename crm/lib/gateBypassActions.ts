"use server";

import { revalidatePath } from "next/cache";
import { query } from "./db";
import { requireLogin } from "./auth";
import { logActivity } from "./activity";
import { safeEqual } from "./session";
import { bypassBlockedReason, bypassLogText, checkBypassReason, lockState, recentFailures } from "./gateBypass";

export type BypassState = { ok?: string; error?: string } | null;

// Wrong passwords this server has seen for the bypass. Kept in memory: a restart clears it, which is fine for a single-user app on one machine.
const g = globalThis as unknown as { __bypassFailures?: number[] };
const failures = () => (g.__bypassFailures = recentFailures(g.__bypassFailures ?? [], Date.now()));

function refresh(companyId: number) {
  revalidatePath(`/companies/${companyId}`); revalidatePath("/companies"); revalidatePath("/");
}

/** Lets the owner treat a company they cannot find on Companies House as contactable. Needs three things: the owner's own words on why they
 *  are sure it is a limited company, a tick to say so, and the login password again. Opted-out, suppressed and looked-up-and-not-eligible
 *  companies cannot be bypassed. Nothing is sent: the company then goes through every other gate (draft, send guard, per-person checks). */
export async function bypassVerificationAction(_prev: BypassState, form: FormData): Promise<BypassState> {
  await requireLogin();
  const companyId = Number(form.get("company_id")) || 0;

  const lock = lockState(failures(), Date.now());
  if (lock.locked) return { error: `Too many wrong passwords. The bypass is locked for about ${lock.minutesLeft} more minute${lock.minutesLeft === 1 ? "" : "s"}.` };

  const r = checkBypassReason(form.get("reason"));
  if (r.error) return { error: r.error };
  if (form.get("confirm_ltd") !== "on") return { error: "Tick the box to confirm this is a registered limited company, LLP or PLC (not a sole trader or partnership)." };

  const expected = process.env.APP_PASSWORD;
  if (!expected) return { error: "APP_PASSWORD is not set on the server, so the bypass cannot be confirmed." };
  if (!safeEqual(String(form.get("password") ?? ""), expected)) {
    g.__bypassFailures = [...failures(), Date.now()];
    await new Promise((ok) => setTimeout(ok, 800));   // slow down guessing, like the login page
    return { error: "Wrong password. The bypass was not applied." };
  }
  g.__bypassFailures = [];

  const [c] = await query<{ name: string; compliance_status: string; opted_out: boolean; suppressed: boolean; bypassed: boolean }>(
    `SELECT c.name, c.compliance_status, g.opted_out, g.suppressed, (c.gate_bypass_at IS NOT NULL) AS bypassed FROM companies c JOIN lead_gate g ON g.company_id = c.id WHERE c.id = $1`, [companyId]);
  if (!c) return { error: "Company not found." };
  const blocked = bypassBlockedReason(c);
  if (blocked) return { error: blocked };

  // The WHERE repeats the rule, so a company that changed state in another tab is not bypassed by mistake.
  const done = await query(
    `UPDATE companies SET gate_bypass_at = now(), gate_bypass_reason = $2 WHERE id = $1 AND compliance_status = 'unchecked' AND NOT opted_out AND gate_bypass_at IS NULL RETURNING id`,
    [companyId, r.reason]);
  if (done.length === 0) return { error: "This company changed while you were confirming. Reload the page and check it again." };
  await logActivity("gate_bypassed", { company_id: companyId, channel: "manual", body: bypassLogText(c.name, r.reason!) });
  refresh(companyId);
  return { ok: "Bypass applied. This company can now be drafted for and contacted one at a time, as if verified. Everything else (opt-outs, the suppression list, daily caps) still applies." };
}

/** Takes the bypass off again. Needs no password: it only makes things stricter. */
export async function removeBypassAction(form: FormData): Promise<{ error?: string } | void> {
  await requireLogin();
  const companyId = Number(form.get("company_id")) || 0;
  const [c] = await query<{ name: string }>(`UPDATE companies SET gate_bypass_at = NULL, gate_bypass_reason = NULL WHERE id = $1 AND gate_bypass_at IS NOT NULL RETURNING name`, [companyId]);
  if (!c) return { error: "There is no bypass on this company." };
  await logActivity("gate_bypass_removed", { company_id: companyId, channel: "manual", body: `Bypass removed for ${c.name}: it is blocked again until verified on Companies House.` });
  refresh(companyId);
}
