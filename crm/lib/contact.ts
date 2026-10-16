import { normaliseDomain } from "./csv";

// Company-level contact routes only. No personal LinkedIn profiles, no named people's emails.
// Pure functions, shared by the server actions and the forms.

export const GENERIC_LOCALS = ["info", "hello", "contact", "enquiries", "enquiry", "office", "admin", "team", "sales", "support"];

export type UrlKind = "linkedin" | "instagram" | "facebook" | "contact";
export type Result = { value: string | null; error?: string };

const clean = (s: string) => s.trim().replace(/^<|>$/g, "");
const asUrl = (s: string): URL | null => {
  try { return new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`); } catch { return null; }
};
const host = (u: URL) => u.hostname.toLowerCase().replace(/^(www|m|uk)\./, "");

export function normaliseSocial(kind: UrlKind, input: string | null | undefined): Result {
  const raw = clean(input ?? "");
  if (!raw) return { value: null };
  const u = asUrl(raw);
  if (!u) return { value: null, error: "That doesn't look like a web address." };
  const parts = u.pathname.split("/").filter(Boolean);
  const h = host(u);

  if (kind === "linkedin") {
    if (h !== "linkedin.com") return { value: null, error: "Use a linkedin.com/company/… address." };
    if (parts[0] !== "company" || !parts[1]) return { value: null, error: "Company pages only (linkedin.com/company/…). Personal profiles aren't stored." };
    return { value: `https://www.linkedin.com/company/${parts[1]}` };
  }
  if (kind === "instagram") {
    if (h !== "instagram.com") return { value: null, error: "Use an instagram.com/… address." };
    const handle = parts[0];
    if (!handle || ["p", "reel", "reels", "explore", "stories", "accounts", "tv"].includes(handle) || !/^[A-Za-z0-9._]{1,30}$/.test(handle)) return { value: null, error: "Use the business profile address (instagram.com/name)." };
    return { value: `https://www.instagram.com/${handle}/` };
  }
  if (kind === "facebook") {
    if (h !== "facebook.com" && h !== "fb.com") return { value: null, error: "Use a facebook.com/… page address." };
    const first = parts[0];
    if (!first || ["sharer", "sharer.php", "share", "groups", "people", "profile.php", "login", "plugins", "dialog", "events", "photo", "watch"].includes(first)) return { value: null, error: "Use the business Page address (facebook.com/pagename)." };
    return { value: `https://www.facebook.com/${first === "pages" && parts[2] ? `pages/${parts[1]}/${parts[2]}` : first}` };
  }
  // contact page
  if (!/^https?:$/.test(u.protocol) || raw.length > 300) return { value: null, error: "Use a normal web address." };
  return { value: u.toString() };
}

export function normaliseEmail(input: string | null | undefined): Result {
  const e = clean(input ?? "").toLowerCase();
  if (!e) return { value: null };
  if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/.test(e)) return { value: null, error: "That doesn't look like an email address." };
  if (!GENERIC_LOCALS.includes(e.split("@")[0])) return { value: null, error: "Only generic company addresses are stored (info@, hello@, contact@, enquiries@, office@…)." };
  return { value: e };
}

export const normaliseWebsite = (input: string | null | undefined): Result => {
  const raw = clean(input ?? "");
  if (!raw) return { value: null };
  const d = normaliseDomain(raw);
  return d ? { value: d } : { value: null, error: "That doesn't look like a website address." };
};

/** Pull generic emails, company social pages, websites and phone numbers out of pasted text. */
export function extractFromText(text: string, ownDomain?: string | null) {
  const out = { emails: [] as string[], linkedin: null as string | null, instagram: null as string | null, facebook: null as string | null, websites: [] as string[], phones: [] as string[] };
  for (const e of text.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) ?? []) {
    const r = normaliseEmail(e);
    if (r.value && !out.emails.includes(r.value)) out.emails.push(r.value);
  }
  for (const m of text.match(/(?:https?:\/\/)?(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/[^\s"'<>)]*)?/gi) ?? []) {
    const h = host(asUrl(m) ?? new URL("https://x.invalid"));
    if (h === "linkedin.com") { const r = normaliseSocial("linkedin", m); if (r.value && !out.linkedin) out.linkedin = r.value; }
    else if (h === "instagram.com") { const r = normaliseSocial("instagram", m); if (r.value && !out.instagram) out.instagram = r.value; }
    else if (h === "facebook.com" || h === "fb.com") { const r = normaliseSocial("facebook", m); if (r.value && !out.facebook) out.facebook = r.value; }
    else if (!/@/.test(m) && !/\.(png|jpg|jpeg|gif|svg|css|js)$/i.test(m)) {
      const d = normaliseDomain(m);
      if (d && d !== ownDomain && !out.websites.includes(d) && !/^(google|bing|youtube|twitter|x|tiktok|goo)\./.test(d)) out.websites.push(d);
    }
  }
  for (const p of text.match(/(?:\+44\s?\(?0?\)?\s?|0)(?:\d[\s-]?){9,10}/g) ?? []) {
    const digits = p.replace(/[^\d+]/g, "");
    if (digits.length >= 10 && !out.phones.includes(p.trim())) out.phones.push(p.trim());
  }
  return out;
}

export type SearchLink = { label: string; href: string; hint: string };

/** Ready-made searches that open in a new tab. They use no API and cost nothing. */
export function searchLinks(c: { name: string; postcode?: string | null; company_number?: string | null }): SearchLink[] {
  const name = c.name.replace(/\s+(limited|ltd\.?|llp|plc)$/i, "").trim();
  const q = (s: string) => encodeURIComponent(s);
  const g = (s: string) => `https://www.google.com/search?q=${q(s)}`;
  return [
    { label: "Website", hint: "Google the company and its postcode", href: g(`"${name}" ${c.postcode ?? ""} website`.trim()) },
    { label: "LinkedIn page", hint: "Company page only, not people", href: g(`"${name}" site:linkedin.com/company`) },
    { label: "Instagram", hint: "Business profile", href: g(`"${name}" site:instagram.com`) },
    { label: "Facebook page", hint: "Business Page", href: g(`"${name}" site:facebook.com`) },
    { label: "Their ads", hint: "Meta Ad Library: do they run ads?", href: `https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=GB&q=${q(name)}&search_type=keyword_unordered` },
    { label: "Google Maps", hint: "Phone, reviews, website", href: `https://www.google.com/maps/search/${q(`${name} ${c.postcode ?? ""}`.trim())}` },
    ...(c.company_number ? [{ label: "Companies House", hint: "Filings and accounts", href: `https://find-and-update.company-information.service.gov.uk/company/${c.company_number}` }] : []),
  ];
}
