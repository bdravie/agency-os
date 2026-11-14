import { safeEqual } from "./session";
import { lockState, recentFailures } from "./gateBypass";

// The login password typed again to confirm something that loosens a rule: the verification bypass (gateBypassActions.ts) and unlocking a
// niche early (nicheScreenActions.ts). Plain server-side helper, not a server action, so it cannot be called from the browser.
// Both share one count of wrong passwords, so guessing cannot be spread across the two screens. Kept in memory: a restart clears it,
// which is fine for a single-user app on one machine.

const g = globalThis as unknown as { __bypassFailures?: number[] };
const failures = () => (g.__bypassFailures = recentFailures(g.__bypassFailures ?? [], Date.now()));

/** Why a password may not be tried right now (too many wrong ones recently), or null. Check it before anything else. */
export function passwordLocked(what: string): string | null {
  const lock = lockState(failures(), Date.now());
  return lock.locked ? `Too many wrong passwords. ${what} is locked for about ${lock.minutesLeft} more minute${lock.minutesLeft === 1 ? "" : "s"}.` : null;
}

/** Null when the password is right; otherwise the error to show. A wrong one is counted and answered slowly, like the login page. */
export async function checkOwnerPassword(raw: unknown, what: string): Promise<string | null> {
  const locked = passwordLocked(what);
  if (locked) return locked;
  const expected = process.env.APP_PASSWORD;
  if (!expected) return `APP_PASSWORD is not set on the server, so ${what.toLowerCase()} cannot be confirmed.`;
  if (!safeEqual(String(raw ?? ""), expected)) {
    g.__bypassFailures = [...failures(), Date.now()];
    await new Promise((ok) => setTimeout(ok, 800));
    return "Wrong password.";
  }
  g.__bypassFailures = [];
  return null;
}
