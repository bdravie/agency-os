// Rules for changing a niche on the Niches screen (docs/NICHE_FOCUS_PLAN.md, N3). Pure: no database, no files, so it can be tested.
// Status rules are read through nicheStatus.ts; this file decides which changes are allowed, which need the owner's password, and
// what the owner may write as a niche's promise and offer.
import { containsContactDetails } from "./audit.ts";
import { activeNiches, CHANNELS, MAX_ACTIVE, NICHE_PLATFORMS, STATUS_LABEL, STATUSES, type Channel, type NichePlatform, type NicheStatus, type NicheTable } from "./nicheStatus.ts";

/** Paying clients an active niche needs before another niche may become active (the unlock rule). */
export const CLIENTS_TO_UNLOCK = 2;
export const OVERRIDE_REASON_MIN = 15, OVERRIDE_REASON_MAX = 300;
export const PROMISE_MAX = 200, OFFER_MAX = 300;

export type StatusCheck =
  | { ok: true }
  | { refuse: string }
  | { needsOverride: string };

/**
 * Whether a niche may move to this status. Only a move to active is ever held back: moving to seeding, audience or parked only tightens,
 * so it needs no password. A move to active is refused outright while MAX_ACTIVE other niches are active (no override), and otherwise
 * needs an override unless one of the other active niches already has CLIENTS_TO_UNLOCK paying clients (deals Won with a monthly value).
 * `paying` counts those deals per niche key.
 */
export function statusChangeCheck(t: NicheTable, key: string, to: string, paying: Record<string, number>): StatusCheck {
  const n = t[key];
  if (!n) return { refuse: "That niche is not in your list." };
  if (!(STATUSES as readonly string[]).includes(to)) return { refuse: "Unknown status." };
  if (n.status === to) return { refuse: `${n.label} is already ${STATUS_LABEL[to as NicheStatus].toLowerCase()}.` };
  if (to !== "active") return { ok: true };
  const others = activeNiches(t).filter((k) => k !== key);
  if (others.length >= MAX_ACTIVE) {
    return { refuse: `${others.length} niches are already active (${others.map((k) => t[k].label).join(", ")}). At most ${MAX_ACTIVE} run at once: move one to seeding, audience or parked first.` };
  }
  if (others.some((k) => (paying[k] ?? 0) >= CLIENTS_TO_UNLOCK)) return { ok: true };
  const tally = others.length
    ? `No active niche has ${CLIENTS_TO_UNLOCK} paying clients yet (${others.map((k) => `${t[k].label} ${paying[k] ?? 0}`).join(", ")}).`
    : `No niche is active, so none has ${CLIENTS_TO_UNLOCK} paying clients yet.`;
  return { needsOverride: `${tally} A niche becomes active once an active one has ${CLIENTS_TO_UNLOCK} deals Won with a monthly value. To go ahead anyway, write your reason and type your password.` };
}

const clean = (raw: unknown) => String(raw ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

/** The owner's own words on why a niche is being unlocked early. Same length and contact-detail rule as the verification bypass. */
export function checkOverrideReason(raw: unknown): { reason?: string; error?: string } {
  const reason = clean(raw);
  if (reason.length < OVERRIDE_REASON_MIN) return { error: `Write why you are unlocking it before ${CLIENTS_TO_UNLOCK} clients are won (at least ${OVERRIDE_REASON_MIN} characters).` };
  if (reason.length > OVERRIDE_REASON_MAX) return { error: `Keep the reason to ${OVERRIDE_REASON_MAX} characters.` };
  if (containsContactDetails(reason)) return { error: "Leave email addresses and phone numbers out of the reason." };
  return { reason };
}

/** A figure is any digit, or a money, percentage or multiplier sign. A promise is one plain sentence a stranger would repeat, so it has none. */
const FIGURE = /[0-9£$€%]/;

/** A niche's promise: one plain-English sentence, no figures, no contact details. */
export function checkPromise(raw: unknown): { value?: string; error?: string } {
  const value = clean(raw);
  if (value.length < 10) return { error: "Write the promise as one plain sentence (at least 10 characters)." };
  if (value.length > PROMISE_MAX) return { error: `Keep the promise to ${PROMISE_MAX} characters.` };
  if (FIGURE.test(value)) return { error: "Leave figures out of the promise (no numbers, £, % or multipliers): say what changes, not by how much." };
  if (containsContactDetails(value)) return { error: "Leave email addresses and phone numbers out of the promise." };
  return { value };
}

/** A niche's offer: short business wording, no contact details. Figures are allowed here (it is never sent as is), but not over the length. */
export function checkOffer(raw: unknown): { value?: string; error?: string } {
  const value = clean(raw);
  if (value.length < 5) return { error: "Describe the offer in a few words." };
  if (value.length > OFFER_MAX) return { error: `Keep the offer to ${OFFER_MAX} characters.` };
  if (containsContactDetails(value)) return { error: "Leave email addresses and phone numbers out of the offer." };
  return { value };
}

/** Only the known channels and platforms, each once, in their usual order. */
export const pickChannels = (raw: unknown[]): Channel[] => CHANNELS.filter((c) => raw.map(String).includes(c));
export const pickPlatforms = (raw: unknown[]): NichePlatform[] => NICHE_PLATFORMS.filter((p) => raw.map(String).includes(p));

/** What changed between two versions of a niche's wording and lists, for the activity log. Empty when nothing did. */
export function wordingChanges(before: { promise: string; offer: string; channels: string[]; platforms: string[] },
  after: { promise: string; offer: string; channels: string[]; platforms: string[] }): { offer: boolean; lists: boolean; text: string[] } {
  const text: string[] = [];
  const offer = before.promise !== after.promise || before.offer !== after.offer;
  if (before.promise !== after.promise) text.push(`Promise: "${before.promise || "none"}" → "${after.promise}"`);
  if (before.offer !== after.offer) text.push(`Offer: "${before.offer || "none"}" → "${after.offer}"`);
  const same = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);
  const lists = !same(before.channels, after.channels) || !same(before.platforms, after.platforms);
  if (!same(before.channels, after.channels)) text.push(`Channels: ${before.channels.join(", ") || "none"} → ${after.channels.join(", ") || "none"}`);
  if (!same(before.platforms, after.platforms)) text.push(`Platforms: ${before.platforms.join(", ") || "none"} → ${after.platforms.join(", ") || "none"}`);
  return { offer, lists, text };
}

/** What the activity log says about a status change. Never includes the password. */
export const statusLogText = (label: string, from: NicheStatus, to: NicheStatus, reason?: string) =>
  `${label}: ${STATUS_LABEL[from]} → ${STATUS_LABEL[to]}${reason ? `, unlocked early with your password. Reason given: "${reason}"` : ""}`;
