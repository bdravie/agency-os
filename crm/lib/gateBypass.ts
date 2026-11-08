// Rules for the owner's bypass of the Companies House check (owner-approved 6 Nov 2026). Pure functions, no database, no network.
// The database view `lead_gate` is still the single definition of "may be contacted"; it accepts a bypass only for a company that is still
// 'unchecked'. These rules decide who may be offered the bypass, what the owner must write, and how often a wrong password may be tried.
import { containsContactDetails } from "./audit.ts";

export const BYPASS_REASON_MIN = 15, BYPASS_REASON_MAX = 300;
/** Wrong passwords allowed inside the window before the bypass locks. */
export const MAX_WRONG_PASSWORDS = 5, LOCK_WINDOW_MS = 15 * 60_000;

/** A bypass is only for a company that was never matched on Companies House. Not for one looked up and found not eligible (that is a real answer),
 *  not for one that has opted out, not for one on the suppression list, and not when a bypass is already in place. */
export function canBypass(g: { compliance_status: string; opted_out: boolean; suppressed: boolean; bypassed?: boolean }): boolean {
  return g.compliance_status === "unchecked" && !g.opted_out && !g.suppressed && !g.bypassed;
}

/** Why the bypass is not on offer, in plain words (empty when it is). */
export function bypassBlockedReason(g: { compliance_status: string; opted_out: boolean; suppressed: boolean; bypassed?: boolean }): string | null {
  if (g.bypassed) return "A bypass is already in place for this company.";
  if (g.opted_out) return "This company has opted out. That is permanent and cannot be bypassed.";
  if (g.suppressed) return "This company is on your suppression list. That cannot be bypassed.";
  if (g.compliance_status === "not_eligible") return "Companies House was checked and this is not an active limited company, LLP or PLC. That answer cannot be bypassed.";
  if (g.compliance_status === "eligible") return "This company is already verified.";
  return null;
}

/** The owner's own words on why they know it is a real, limited company even though Companies House does not show it. */
export function checkBypassReason(raw: unknown): { reason?: string; error?: string } {
  const reason = String(raw ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  if (reason.length < BYPASS_REASON_MIN) return { error: `Write why you are sure this is a registered limited company (at least ${BYPASS_REASON_MIN} characters), for example the name it is registered under, or where you saw it.` };
  if (reason.length > BYPASS_REASON_MAX) return { error: `Keep the reason to ${BYPASS_REASON_MAX} characters.` };
  if (containsContactDetails(reason)) return { error: "Leave email addresses and phone numbers out of the reason." };
  return { reason };
}

/** Wrong-password history for the bypass: keeps only the failures still inside the window. */
export function recentFailures(failures: number[], now: number): number[] {
  return failures.filter((t) => now - t < LOCK_WINDOW_MS);
}

/** After too many wrong passwords the bypass locks for a while, so someone at an unlocked laptop cannot guess their way through. */
export function lockState(failures: number[], now: number): { locked: boolean; minutesLeft: number } {
  const recent = recentFailures(failures, now);
  if (recent.length < MAX_WRONG_PASSWORDS) return { locked: false, minutesLeft: 0 };
  const until = Math.min(...recent) + LOCK_WINDOW_MS;
  return { locked: true, minutesLeft: Math.max(1, Math.ceil((until - now) / 60_000)) };
}

/** What the activity log and the company page say about a bypass. Never includes the password. */
export const bypassLogText = (name: string, reason: string) => `Owner bypassed the Companies House check for ${name} with their password. Reason given: "${reason}"`;
