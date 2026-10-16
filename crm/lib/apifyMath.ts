import { classifyCompany } from "./compliance.ts";
import { normaliseName, pickExact, type ChCandidate } from "./companiesHouse.ts";

// Pure logic for the Apify (Google Maps) lead search: budget limits, reading a place, matching it to Companies House, and ranking it.
// No network or database here, so the money rules and the ranking are testable.

// ---------- budget ----------
export type Settings = { dailyUsd: number; monthlyUsd: number; basePlaceUsd: number; contactsPlaceUsd: number; maxPlaces: number; minCapUsd: number };
const num = (v: string | undefined, d: number) => { const n = Number(v); return v !== undefined && v.trim() !== "" && Number.isFinite(n) && n >= 0 ? n : d; };

/** Limits for the free plan ($5 a month, about $0.16 a day). Prices are our estimate for planning only: Apify's own spend cap is what actually protects you. */
export function apifySettings(env: Record<string, string | undefined> = process.env): Settings {
  return { dailyUsd: num(env.APIFY_DAILY_BUDGET_USD, 0.15), monthlyUsd: num(env.APIFY_MONTHLY_BUDGET_USD, 4), basePlaceUsd: num(env.APIFY_PRICE_PER_PLACE_USD, 0.004), contactsPlaceUsd: num(env.APIFY_PRICE_CONTACTS_PER_PLACE_USD, 0.002), maxPlaces: 50, minCapUsd: num(env.APIFY_MIN_RUN_CAP_USD, 0.5) };
}
export const perPlaceUsd = (contacts: boolean, s: Settings) => s.basePlaceUsd + (contacts ? s.contactsPlaceUsd : 0);
const round4 = (n: number) => Math.round(n * 10_000) / 10_000;

export type Plan = { ok: true; places: number; estUsd: number; maxChargeUsd: number; limitedBy: "daily" | "monthly" | "size" | null }
  | { ok: false; error: string };

/**
 * How many places can be asked for right now, and the safety cap to send to Apify.
 * Apify refuses any run whose cap is under its minimum (currently $0.50), so the cap is only a backstop: the number of places is what keeps the real cost inside today's budget.
 * `learnedPerPlace` is the real cost per place from the last finished run; the higher of that and our estimate is used. `headroomUsd` is what the Apify account has left this month:
 * a run is refused if it could not afford its own cap.
 */
export function planRun(i: { requested: number; contacts: boolean; dailyLeft: number; monthlyLeft: number; s: Settings; learnedPerPlace?: number | null; headroomUsd?: number | null }): Plan {
  const each = Math.max(perPlaceUsd(i.contacts, i.s), i.learnedPerPlace ?? 0);
  const left = Math.max(0, Math.min(i.dailyLeft, i.monthlyLeft));
  const requested = Math.max(1, Math.min(Math.round(i.requested) || 1, i.s.maxPlaces));
  const affordable = each > 0 ? Math.floor((left + 1e-9) / each) : requested;
  const dailyIsTheLimit = i.dailyLeft <= i.monthlyLeft;
  if (affordable < 1) return { ok: false, error: dailyIsTheLimit
    ? `Today's Apify budget is used up (about $${i.dailyLeft.toFixed(3)} left, and one place costs about $${each.toFixed(3)}). Try again tomorrow, or raise APIFY_DAILY_BUDGET_USD.`
    : `This month's Apify budget is used up (about $${i.monthlyLeft.toFixed(3)} left). It resets with your Apify billing cycle.` };
  const places = Math.min(requested, affordable);
  const estUsd = round4(places * each);
  const maxChargeUsd = round4(Math.max(i.s.minCapUsd, estUsd * 1.3));
  if (i.headroomUsd !== null && i.headroomUsd !== undefined && i.headroomUsd < maxChargeUsd)
    return { ok: false, error: `Your Apify account has only about $${Math.max(0, i.headroomUsd).toFixed(2)} of credit left this month, and Apify needs a safety cap of at least $${maxChargeUsd.toFixed(2)} on every run. It resets with your Apify billing cycle.` };
  return { ok: true, places, estUsd, maxChargeUsd, limitedBy: places < requested ? (dailyIsTheLimit ? "daily" : "monthly") : requested >= i.s.maxPlaces ? "size" : null };
}

// ---------- reading a place ----------
export type Place = {
  placeId: string; title: string; address: string | null; street: string | null; city: string | null; postcode: string | null;
  latitude: number | null; longitude: number | null; phone: string | null; website: string | null; domain: string | null;
  rating: number | null; reviews: number | null; categories: string[]; mapsUrl: string | null; emails: string[];
  socials: Partial<Record<"facebook" | "instagram" | "linkedin" | "twitter" | "youtube" | "tiktok", string>>; closed: "temporary" | "permanent" | null;
};

const str = (v: unknown, n = 200): string | null => { const t = typeof v === "string" ? v.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim() : ""; return t ? t.slice(0, n) : null; };
const numOrNull = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const firstStr = (v: unknown): string | null => (Array.isArray(v) ? str(typeof v[0] === "object" && v[0] ? (v[0] as any).value : v[0], 300) : str(v, 300));

export function domainOf(url: string | null): string | null {
  if (!url) return null;
  try { const h = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).hostname.toLowerCase().replace(/^www\./, ""); return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(h) ? h : null; } catch { return null; }
}
const GENERIC = new Set(["info", "hello", "contact", "enquiries", "enquiry", "office", "admin", "team", "sales", "support", "bookings", "reception"]);
/** Keep only generic company addresses on the company's own website domain. Named people and personal addresses are dropped. */
export function genericOnly(raw: unknown, domain: string | null): string[] {
  const list = (Array.isArray(raw) ? raw : []).map((e) => (typeof e === "object" && e ? (e as any).value : e)).filter((e): e is string => typeof e === "string");
  const out = new Set<string>();
  for (const e of list) {
    const [local, host] = e.trim().toLowerCase().split("@");
    if (local && host && GENERIC.has(local) && domain && (host === domain || host.endsWith(`.${domain}`))) out.add(`${local}@${host}`);
  }
  return [...out].slice(0, 3);
}

/** Turn one untrusted Apify item into a clean Place, or null if it is unusable. */
export function parsePlace(raw: any): Place | null {
  const title = str(raw?.title, 160), placeId = str(raw?.placeId, 120);
  if (!title || !placeId) return null;
  const rawSite = str(raw?.website, 300), domain = /^https?:\/\//i.test(rawSite ?? "") ? domainOf(rawSite) : null;
  const website = domain ? rawSite : null;   // only a real http(s) address is kept: anything else (javascript:, data:) is dropped
  const social = (k: string) => { const u = firstStr(raw?.[k]); return u && /^https?:\/\//i.test(u) ? u : null; };
  const s = { facebook: social("facebooks"), instagram: social("instagrams"), linkedin: social("linkedIns"), twitter: social("twitters"), youtube: social("youtubes"), tiktok: social("tiktoks") };
  return {
    placeId, title, address: str(raw?.address, 250), street: str(raw?.street, 150), city: str(raw?.city, 80), postcode: str(raw?.postalCode, 12)?.toUpperCase() ?? null,
    latitude: numOrNull(raw?.location?.lat), longitude: numOrNull(raw?.location?.lng), phone: str(raw?.phone, 30), website, domain,
    rating: numOrNull(raw?.totalScore) !== null ? Math.round(raw.totalScore * 10) / 10 : null, reviews: numOrNull(raw?.reviewsCount),
    categories: (Array.isArray(raw?.categories) ? raw.categories : []).map((c: unknown) => str(c, 60)).filter((c: string | null): c is string => !!c).slice(0, 6),
    mapsUrl: (() => { const u = str(raw?.url, 400); return u && /^https:\/\/(www\.)?google\.[a-z.]+\/maps|^https:\/\/maps\.google\./i.test(u) ? u : null; })(),
    emails: genericOnly(raw?.emails, domain), socials: Object.fromEntries(Object.entries(s).filter(([, v]) => v)) as Place["socials"],
    closed: raw?.permanentlyClosed === true ? "permanent" : raw?.temporarilyClosed === true ? "temporary" : null,
  };
}

/** Finds a UK postcode anywhere in some text and returns its first part: "1 High St, Leeds LS1 4DJ" -> "LS1", "ls14dj" -> "LS1". Used to confirm a Companies House match is in the same area. */
export function postcodeDistrict(text: string | null | undefined): string | null {
  const m = (text ?? "").toUpperCase().match(/\b([A-Z]{1,2}\d[A-Z\d]?)\s*\d[A-Z]{2}\b/);
  return m ? m[1] : null;
}

// ---------- matching to Companies House ----------
export type ChMatch = { match: "exact+postcode" | "exact" | "ambiguous" | "none"; candidate: ChCandidate | null };

/** Only an exact name match counts, and a match in the same postcode area is trusted most. A trading name that differs from the registered name won't match: that is expected and safe. */
export function matchCompanyHouse(place: Pick<Place, "title" | "postcode">, candidates: ChCandidate[]): ChMatch {
  const district = postcodeDistrict(place.postcode), want = normaliseName(place.title);
  const exact = candidates.filter((c) => normaliseName(c.name) === want);
  const local = district ? exact.filter((c) => postcodeDistrict(c.address ?? "") === district) : [];
  if (local.length) return { match: "exact+postcode", candidate: local.find((c) => c.status === "active") ?? local[0] };
  const single = pickExact(place.title, candidates);
  if (single && (!district || exact.length === 1)) return { match: "exact", candidate: single };
  return exact.length > 1 ? { match: "ambiguous", candidate: null } : { match: "none", candidate: null };
}

// ---------- ranking ----------
export type Eligibility = "eligible" | "not_eligible" | "unmatched";
export type Priority = { score: number; tier: "A" | "B" | "C" | "Skip"; reasons: string[] };

/** A transparent 0-75 score with the reasons shown. Eligibility counts most, because only active ltd/llp/plc companies may be contacted. */
export function priorityScore(p: Pick<Place, "website" | "phone" | "emails" | "rating" | "reviews" | "closed">, eligibility: Eligibility, ch: { type: string | null; status: string | null } | null): Priority {
  const reasons: string[] = [];
  if (p.closed === "permanent") return { score: 0, tier: "Skip", reasons: ["Permanently closed"] };
  if (eligibility === "not_eligible") return { score: 0, tier: "Skip", reasons: [classifyCompany(ch?.type, ch?.status).reason ?? "Not an active limited company"] };
  let s = 0;
  if (eligibility === "eligible") { s += 30; reasons.push("+30 active limited company, so it can be contacted"); }
  else reasons.push("Not matched to Companies House: can't be contacted until you find its company number");
  if (p.website) { s += 10; reasons.push("+10 has a website"); } else reasons.push("No website listed");
  if (p.emails.length) { s += 10; reasons.push("+10 generic email found"); }
  if (p.phone) { s += 5; reasons.push("+5 phone listed"); }
  const n = p.reviews ?? 0;
  if (n >= 15 && n <= 400) { s += 10; reasons.push(`+10 established and active (${n} reviews)`); }
  else if (n > 400) { s += 3; reasons.push(`+3 ${n} reviews: probably bigger than a one-person-agency client`); }
  else reasons.push(n === 0 ? "No reviews yet" : `Only ${n} reviews`);
  if (p.rating !== null) {
    if (p.rating >= 3 && p.rating < 4.5) { s += 10; reasons.push(`+10 rated ${p.rating}: room to improve through follow-up and review requests`); }
    else if (p.rating >= 4.5) { s += 6; reasons.push(`+6 rated ${p.rating}: a good reputation to build on`); }
    else { s += 4; reasons.push(`+4 rated ${p.rating}: reputation needs work`); }
  }
  if (p.closed === "temporary") { s -= 20; reasons.push("-20 temporarily closed"); }
  if (eligibility === "unmatched") s = Math.min(s, 40);   // never an A: it can't be contacted yet
  s = Math.max(0, s);
  return { score: s, tier: s >= 55 ? "A" : s >= 35 ? "B" : "C", reasons };
}

/** "BRIGHT PLUMBING LIMITED" -> "Bright Plumbing Limited". Companies House names are often all capitals; mixed-case names are left alone. */
export function tidyName(name: string): string {
  const t = name.trim();
  if (t !== t.toUpperCase() || !/[A-Z]/.test(t)) return t;
  return t.toLowerCase().replace(/(^|[\s(&/-])([a-z])/g, (_, a, b) => a + b.toUpperCase()).replace(/\b(Ltd|Llp|Plc|Uk)\b/g, (m) => (m === "Uk" ? "UK" : m.toUpperCase() === "LTD" ? "Ltd" : m.toUpperCase()));
}
