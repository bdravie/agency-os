// Extra ways to reach a company beyond the main boxes: TikTok, other social pages, a second email or phone. Company-level only.
// Pure (no imports), so it is tested on its own and shared by the server actions, the form and the site scan.

export const GENERIC_LOCALS = ["info", "hello", "contact", "enquiries", "enquiry", "office", "admin", "team", "sales", "support"];

export type MethodKind = "tiktok" | "youtube" | "x" | "social_other" | "whatsapp" | "email_secondary" | "phone_secondary" | "other";
export const METHOD_KINDS: { code: MethodKind; label: string; group: string; placeholder: string }[] = [
  { code: "tiktok", label: "TikTok", group: "Social media", placeholder: "tiktok.com/@name" },
  { code: "youtube", label: "YouTube channel", group: "Social media", placeholder: "youtube.com/@name" },
  { code: "x", label: "X (Twitter)", group: "Social media", placeholder: "x.com/name" },
  { code: "social_other", label: "Other social media page", group: "Social media", placeholder: "https://…" },
  { code: "email_secondary", label: "Secondary email", group: "Email and phone", placeholder: "sales@, support@, accounts@…" },
  { code: "phone_secondary", label: "Secondary phone", group: "Email and phone", placeholder: "Another company number" },
  { code: "whatsapp", label: "WhatsApp (business number)", group: "Email and phone", placeholder: "07… or +44…" },
  { code: "other", label: "Other web address", group: "Other", placeholder: "https://…" },
];
export const methodLabel = (k: string) => METHOD_KINDS.find((m) => m.code === k)?.label ?? k;
export const isMethodKind = (k: unknown): k is MethodKind => METHOD_KINDS.some((m) => m.code === k);

export type Result = { value: string | null; error?: string };
const clean = (s: string) => s.trim().replace(/^<|>$/g, "");
const asUrl = (s: string): URL | null => { try { return new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`); } catch { return null; } };
const host = (u: URL) => u.hostname.toLowerCase().replace(/^(www|m|mobile)\./, "");
const parts = (u: URL) => u.pathname.split("/").filter(Boolean);

export function normaliseTiktok(input: string): Result {
  const raw = clean(input);
  const bare = raw.match(/^@([A-Za-z0-9._]{2,24})$/);
  if (bare) return { value: `https://www.tiktok.com/@${bare[1]}` };
  const u = asUrl(raw);
  if (!u || host(u) !== "tiktok.com") return { value: null, error: "Use a tiktok.com/@name address." };
  const h = parts(u)[0]?.match(/^@([A-Za-z0-9._]{2,24})$/);
  return h ? { value: `https://www.tiktok.com/@${h[1]}` } : { value: null, error: "Use the account address (tiktok.com/@name), not a video link." };
}
export function normaliseYoutube(input: string): Result {
  const u = asUrl(clean(input));
  if (!u || host(u) !== "youtube.com") return { value: null, error: "Use a youtube.com channel address." };
  const [a, b] = parts(u);
  if (a?.startsWith("@") && /^@[A-Za-z0-9._-]{2,40}$/.test(a)) return { value: `https://www.youtube.com/${a}` };
  if (["channel", "c", "user"].includes(a) && b && /^[A-Za-z0-9._-]{2,60}$/.test(b)) return { value: `https://www.youtube.com/${a}/${b}` };
  return { value: null, error: "Use the channel address (youtube.com/@name), not a video or playlist." };
}
export function normaliseX(input: string): Result {
  const u = asUrl(clean(input).replace(/^@/, "x.com/"));
  if (!u || !["x.com", "twitter.com"].includes(host(u))) return { value: null, error: "Use an x.com/name address." };
  const h = parts(u)[0];
  if (!h || !/^[A-Za-z0-9_]{1,15}$/.test(h) || ["home", "i", "intent", "share", "search", "hashtag", "explore", "login", "messages"].includes(h.toLowerCase())) return { value: null, error: "Use the account address (x.com/name)." };
  return { value: `https://x.com/${h}` };
}
const normaliseWebAddress = (input: string): Result => {
  const raw = clean(input), u = asUrl(raw);
  if (!u || !/^https?:$/.test(u.protocol) || !u.hostname.includes(".") || u.username || u.password || raw.length > 300) return { value: null, error: "Use a normal web address." };
  return { value: u.toString() };
};
export function normaliseSecondaryEmail(input: string): Result {
  const e = clean(input).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/.test(e)) return { value: null, error: "That doesn't look like an email address." };
  if (!GENERIC_LOCALS.includes(e.split("@")[0])) return { value: null, error: "Only generic company addresses are stored (info@, hello@, contact@, enquiries@, office@, sales@, support@…)." };
  return { value: e };
}
export function normalisePhone(input: string): Result {
  const v = clean(input).replace(/\s+/g, " ");
  const digits = v.replace(/\D/g, "");
  if (!/^[+\d][\d\s()-]*$/.test(v) || digits.length < 9 || digits.length > 15) return { value: null, error: "That doesn't look like a phone number." };
  return { value: v.slice(0, 40) };
}

/** Checks and tidies one extra contact method. Returns the value to store, or why it was refused. */
export function normaliseMethod(kind: string, input: string | null | undefined): Result {
  const v = String(input ?? "").trim();
  if (!v) return { value: null, error: "Enter the address, number or link." };
  switch (kind) {
    case "tiktok": return normaliseTiktok(v);
    case "youtube": return normaliseYoutube(v);
    case "x": return normaliseX(v);
    case "social_other": case "other": return normaliseWebAddress(v);
    case "email_secondary": return normaliseSecondaryEmail(v);
    case "phone_secondary": case "whatsapp": return normalisePhone(v);
    default: return { value: null, error: "Choose a type." };
  }
}

/** Where a stored value should link to (or null for plain text). */
export const methodHref = (kind: string, value: string) => (kind === "email_secondary" ? `mailto:${value}` : kind === "phone_secondary" || kind === "whatsapp" ? `tel:${value.replace(/[^\d+]/g, "")}` : /^https?:\/\//.test(value) ? value : null);
