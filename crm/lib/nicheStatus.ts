// What each niche may be used for (docs/NICHE_FOCUS_PLAN.md). Pure: the niche table is passed in, so it can be tested.
// The one place a niche's status, channels and platforms are read. It sits on top of lead_gate, never instead of it:
// a company still has to pass lead_gate to be contacted, and now its niche has to allow the channel too.

export const STATUSES = ["active", "seeding", "audience", "parked"] as const;
export type NicheStatus = (typeof STATUSES)[number];
export const CHANNELS = ["email", "linkedin", "instagram_dm"] as const;
export type Channel = (typeof CHANNELS)[number];
export const NICHE_PLATFORMS = ["linkedin", "instagram", "tiktok"] as const;
export type NichePlatform = (typeof NICHE_PLATFORMS)[number];
export const TIERS = ["low", "mid", "high"] as const;
export type NicheTier = (typeof TIERS)[number];
/** At most this many niches may be active at once (the plan's "one after another, not side by side"). */
export const MAX_ACTIVE = 2;

export const STATUS_LABEL: Record<NicheStatus, string> = { active: "Active", seeding: "Seeding", audience: "Audience", parked: "Parked" };
export const STATUS_MEANING: Record<NicheStatus, string> = {
  active: "Full lead sourcing, outreach drafts, sends, DMs and content.",
  seeding: "LinkedIn content plus a few LinkedIn connection notes. No Lead Sourcer runs, no cold email.",
  audience: "Content only. No outreach of any kind.",
  parked: "Not worked on now. Its companies keep their history but get no new searches or drafts.",
};
export const CHANNEL_LABEL: Record<Channel, string> = { email: "email", linkedin: "LinkedIn", instagram_dm: "Instagram DMs" };

export type Niche = {
  key: string; label: string; status: NicheStatus; tier: NicheTier | null;
  channels: Channel[]; platforms: NichePlatform[]; promise: string; painPoints: string[]; offer: string; custom: boolean;
};
export type NicheTable = Record<string, Niche>;

const list = (v: unknown) => (Array.isArray(v) ? v : typeof v === "string" ? [v] : []).map((x) => String(x).trim()).filter(Boolean);
const oneOf = <T extends string>(v: unknown, allowed: readonly T[]): T | null => (allowed.includes(String(v ?? "").trim().toLowerCase() as T) ? (String(v).trim().toLowerCase() as T) : null);
const allowedList = <T extends string>(v: unknown, allowed: readonly T[]): T[] => [...new Set(list(v).map((x) => x.toLowerCase()).filter((x): x is T => allowed.includes(x as T)))];
export const labelOf = (key: string) => key.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

/**
 * One niche from config/niches.yaml or a custom_niches row, made safe: an unknown or missing status is parked (so a typo never opens outreach),
 * and only the allowed channels and platforms are kept. A parked niche has no channels or platforms, whatever its row says.
 */
export function cleanNiche(key: string, raw: any, custom = false): Niche {
  const status = oneOf(raw?.status, STATUSES) ?? "parked";
  const parked = status === "parked";
  return {
    key, custom, status,
    label: String(raw?.label ?? "").trim() || labelOf(key),
    tier: oneOf(raw?.tier, TIERS),
    channels: parked ? [] : allowedList(raw?.channels, CHANNELS),
    platforms: parked ? [] : allowedList(raw?.platforms, NICHE_PLATFORMS),
    promise: String(raw?.promise ?? "").trim(),
    painPoints: list(raw?.pain_points ?? raw?.painPoints),
    offer: String(raw?.offer ?? "").trim(),
  };
}

/** The niche table: the yaml niches, plus the CRM's custom niches whose key is not already in the yaml (the yaml wins, as in the Python tools). */
export function buildNicheTable(yamlNiches: Record<string, any> | null | undefined, customRows: any[] = []): NicheTable {
  const table: NicheTable = {};
  for (const [key, raw] of Object.entries(yamlNiches ?? {})) table[key] = cleanNiche(key, raw);
  for (const r of customRows) if (r?.key && !table[r.key]) table[r.key] = cleanNiche(String(r.key), r, true);
  return table;
}

/** A niche's status. A key that is not in the table (a typo, a deleted niche, a company with no niche) counts as parked. */
export const nicheStatus = (t: NicheTable, key: string | null | undefined): NicheStatus => (key && t[key] ? t[key].status : "parked");

/** Whether the Lead Sourcer may search for this niche: active niches only. */
export const canSource = (t: NicheTable, key: string | null | undefined): boolean => nicheStatus(t, key) === "active";

/**
 * Whether a company in this niche may be contacted on this channel (lead_gate must still pass as well).
 * Active: any channel the niche lists. Seeding: LinkedIn only, and only if the niche lists it. Audience and parked: never.
 */
export function canOutreach(t: NicheTable, key: string | null | undefined, channel: Channel): boolean {
  const status = nicheStatus(t, key);
  if (status !== "active" && status !== "seeding") return false;
  if (status === "seeding" && channel !== "linkedin") return false;
  return t[key as string].channels.includes(channel);
}

/** Where content made for this niche is posted. Parked or unknown niches get none. */
export const platformsFor = (t: NicheTable, key: string | null | undefined): NichePlatform[] => (key && t[key] && t[key].status !== "parked" ? t[key].platforms : []);

/** The focus list that replaced `defaults.focus_niches`: the active niches, in table order. */
export const activeNiches = (t: NicheTable): string[] => Object.values(t).filter((n) => n.status === "active").map((n) => n.key);

/**
 * Why a contact attempt is blocked by the niche, in words, or null if it is allowed. Says which status blocked it, so the owner knows what to change.
 * (The link to the Niches screen is added by the page that shows it.)
 */
export function outreachBlock(t: NicheTable, key: string | null | undefined, channel: Channel): string | null {
  if (canOutreach(t, key, channel)) return null;
  const name = key && t[key] ? t[key].label : key ? labelOf(key) : "No niche";
  const status = nicheStatus(t, key);
  if (!key) return `This company has no niche, so it counts as parked: no ${CHANNEL_LABEL[channel]}. Give it an active niche first.`;
  if (!t[key]) return `“${name}” is not a niche in your list, so it counts as parked: no ${CHANNEL_LABEL[channel]}. Move the company to an active niche.`;
  if (status === "parked") return `${name} is parked: no ${CHANNEL_LABEL[channel]}. Move the company to an active niche, or change the niche's status.`;
  if (status === "audience") return `${name} is an audience niche: content only, no ${CHANNEL_LABEL[channel]}.`;
  if (status === "seeding") return `${name} is seeding: LinkedIn notes only, no ${CHANNEL_LABEL[channel]}.`;
  return `${name} is active but does not use ${CHANNEL_LABEL[channel]}. Add it to the niche's channels if you mean to.`;
}

/** Problems with the table as configured, worth showing to the owner: more active niches than allowed, or an active niche with no channel. */
export function configProblems(t: NicheTable): string[] {
  const out: string[] = [];
  const active = activeNiches(t);
  if (active.length > MAX_ACTIVE) out.push(`${active.length} niches are active (${active.join(", ")}); the plan allows ${MAX_ACTIVE} at a time.`);
  for (const n of Object.values(t)) {
    if ((n.status === "active" || n.status === "seeding") && n.channels.length === 0) out.push(`${n.label} is ${n.status} but has no channels, so nobody in it can be contacted.`);
    if (n.status === "seeding" && n.channels.some((c) => c !== "linkedin")) out.push(`${n.label} is seeding, so only LinkedIn is used; its other channels are ignored.`);
  }
  return out;
}
