// Pure logic for the Apollo decision-maker search: limits, reading Apollo's answers safely, ranking people, and accepting only real work emails.

// ---------- limits ----------
export type ApolloSettings = { dailyCredits: number; maxPerClick: number };
const n = (v: string | undefined, d: number, max: number) => { const x = Number(v); return v !== undefined && v.trim() !== "" && Number.isFinite(x) && x >= 0 ? Math.min(x, max) : d; };
/** Defaults are deliberately small: 10 credits a day and 3 people per click. Change them in .env. */
export function apolloSettings(env: Record<string, string | undefined> = process.env): ApolloSettings {
  return { dailyCredits: Math.floor(n(env.APOLLO_DAILY_CREDITS, 10, 1000)), maxPerClick: Math.max(1, Math.floor(n(env.APOLLO_MAX_PEOPLE_PER_CLICK, 3, 10))) };
}
/** How many of the ticked people can be revealed now, given credits left today. One credit per person is the most a work-email reveal costs. */
export function planReveal(i: { wanted: number; creditsLeft: number; maxPerClick: number }): { count: number; limitedBy: "click" | "credits" | null } {
  const byCredits = Math.max(0, Math.floor(i.creditsLeft)), cap = Math.min(i.maxPerClick, byCredits);
  const count = Math.max(0, Math.min(i.wanted, cap));
  return { count, limitedBy: count < i.wanted ? (byCredits < i.maxPerClick ? "credits" : "click") : null };
}

// ---------- reading Apollo's answers (untrusted) ----------
export type Person = { id: string; firstName: string; lastInitial: string; title: string | null; org: string | null; hasEmail: boolean };
const clean = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, max) : "");

export function parsePeople(raw: any): Person[] {
  const out: Person[] = [];
  for (const p of Array.isArray(raw?.people) ? raw.people : []) {
    const id = clean(p?.id, 60), first = clean(p?.first_name, 40);
    if (!id || !/^[A-Za-z0-9_-]+$/.test(id) || !first) continue;
    const last = clean(p?.last_name_obfuscated ?? p?.last_name, 40).match(/[A-Za-z]/)?.[0]?.toUpperCase() ?? "";
    out.push({ id, firstName: first, lastInitial: last, title: clean(p?.title, 80) || null, org: clean(p?.organization?.name, 80) || null, hasEmail: p?.has_email === true });
  }
  return out;
}

/** Lower is more senior. Used to put owners and directors first. */
export function seniorityRank(title: string | null): number {
  const t = (title ?? "").toLowerCase();
  if (/\b(owner|founder|co-?founder|proprietor|managing director|ceo|chief executive|principal)\b/.test(t)) return 1;
  if (/\b(chief|c[a-z]o|president|partner|director|head of|vp|vice president)\b/.test(t)) return 2;
  if (/\bmanager\b/.test(t)) return 3;
  return 9;
}
export const rankPeople = (people: Person[]) => [...people].sort((a, b) => Number(b.hasEmail) - Number(a.hasEmail) || seniorityRank(a.title) - seniorityRank(b.title) || a.firstName.localeCompare(b.firstName));

// ---------- the email ----------
const FREE_MAIL = /^(?:[a-z0-9-]+\.)*(?:gmail|googlemail|yahoo|ymail|hotmail|outlook|live|msn|icloud|me|aol|proton|protonmail|btinternet|sky|virginmedia|talktalk|mail)\.(?:com|co\.uk|net|me|org|uk|ie)$/i;
/** Accepts only a work address on the company's own website domain. Personal or free-mail addresses, or another company's, are refused. */
export function workEmail(email: unknown, companyDomain: string | null): string | null {
  const e = typeof email === "string" ? email.trim().toLowerCase() : "";
  if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/.test(e) || !companyDomain) return null;
  const host = e.split("@")[1], dom = companyDomain.toLowerCase().replace(/^www\./, "");
  if (FREE_MAIL.test(host)) return null;
  return host === dom || host.endsWith(`.${dom}`) ? e : null;
}

/** A LinkedIn profile address for the contact record (a person's profile is fine on a contact, never on a company). */
export function linkedinProfile(url: unknown): string | null {
  const m = typeof url === "string" ? url.trim().match(/^https?:\/\/([a-z]{2,3}\.)?linkedin\.com\/in\/([A-Za-z0-9\-_%]{2,100})\/?/i) : null;
  return m ? `https://www.linkedin.com/in/${m[2]}` : null;
}

export const consentText = (date: string) => `B2B corporate subscriber + legitimate interest. Work details found via Apollo on ${date}.`;
