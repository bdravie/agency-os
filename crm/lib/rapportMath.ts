// Pure checks for the rapport research. Nothing here touches the network or the database. The AI is only trusted for what these checks confirm.

export type RapportPoint = { kind: "work" | "talk" | "background" | "role"; text: string; opener: string; source_url: string; source_title: string; quote: string };
export type Source = { id: number; url: string; title: string; text: string };

/** Social platforms and people-finder style sites are never read or used as a source. */
const BLOCKED_HOST = /(^|\.)(linkedin|facebook|instagram|twitter|x|tiktok|snapchat|pinterest|reddit|youtube|youtu|threads|whatsapp|telegram|quora|spokeo|pipl|192|ancestry|findagrave|companieshouse|company-information\.service\.gov)\.(com|co\.uk|be|gov\.uk)$/i;
const BLOCKED_HOST_WORD = /(linkedin|facebook|instagram|tiktok|snapchat|reddit|youtube|twitter)\./i;
export function allowedSourceHost(url: string): boolean {
  try { const h = new URL(url).hostname.toLowerCase().replace(/^www\./, ""); return !BLOCKED_HOST.test(h) && !BLOCKED_HOST_WORD.test(h) && h !== "x.com"; } catch { return false; }
}

const squash = (s: string) => s.toLowerCase().replace(/[’‘`´]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, " ").trim();
const plain = (s: string) => squash(s).replace(/[^a-z0-9' ]/g, " ").replace(/\s+/g, " ").trim();

/** Both names together, as the person is written on the page. A page that only has a first name, or a surname alone, does not count. */
export function mentionsPerson(text: string, first: string, last: string): boolean {
  return plain(text).includes(`${plain(first)} ${plain(last)}`);
}

/** The page is about this company too (its name or domain appears), so a same-named stranger is not mistaken for them. */
export function mentionsCompany(text: string, companyName: string, domain: string | null): boolean {
  const t = plain(text);
  if (domain && t.includes(plain(domain.replace(/^www\./, "")))) return true;
  const words = plain(companyName).replace(/\b(limited|ltd|llp|plc)\b/g, "").split(" ").filter((w) => w.length > 2);
  return words.length > 0 && (words.length === 1 ? t.includes(words[0]) : t.includes(words.join(" ")) || words.every((w) => t.includes(w)));
}

/** Up to three stretches of the page around where the person is named, so the AI reads the relevant part and not the whole page. */
export function excerptAround(text: string, first: string, last: string, width = 700): string {
  const flat = text.replace(/\s+/g, " ");
  const re = new RegExp(`${first.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s+${last.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "gi");
  const spans: [number, number][] = [];
  for (const m of flat.matchAll(re)) {
    const a = Math.max(0, m.index! - width), b = Math.min(flat.length, m.index! + m[0].length + width);
    const prev = spans[spans.length - 1];
    if (prev && a <= prev[1]) prev[1] = b; else spans.push([a, b]);
    if (spans.length >= 3) break;
  }
  return spans.map(([a, b]) => flat.slice(a, b)).join(" … ");
}

// Anything personal is refused even if the AI let it through.
const PERSONAL = /\b(wife|husband|married|marriage|divorc\w*|partner'?s?|girlfriend|boyfriend|children|daughters?|sons?|kids?|baby|pregnan\w*|cancer|illness|diagnos\w*|surgery|disabilit\w*|religio\w*|church|mosque|temple|politic\w*|labour party|conservative party|vote[sd]?|ethnic\w*|sexual\w*|funeral|bereave\w*|passed away|died|home address|lives at|birthday|years old|aged \d+|holiday|hobby|hobbies|bankrupt\w*|arrest\w*|convict\w*|court)\b/i;
export const looksPersonal = (s: string) => PERSONAL.test(s);

const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

/** Keeps only points whose source is one we actually read, whose quote really appears in that source, and that are professional, plain and short. Returns what was dropped and why. */
export function verifyPoints(raw: unknown, sources: Source[]): { points: RapportPoint[]; dropped: string[] } {
  const points: RapportPoint[] = [], dropped: string[] = [];
  const list = Array.isArray((raw as any)?.points) ? (raw as any).points : [];
  for (const p of list.slice(0, 8)) {
    const src = sources.find((s) => s.id === Number(p?.source));
    const text = String(p?.text ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
    const opener = String(p?.opener ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
    const quote = String(p?.quote ?? "").replace(/\s+/g, " ").trim();
    const kind = ["work", "talk", "background", "role"].includes(p?.kind) ? p.kind : null;
    const label = text.slice(0, 40) || "A point";
    if (!src) { dropped.push(`${label}: it named a source that wasn't one of the pages read`); continue; }
    if (!kind || !text || !opener) { dropped.push(`${label}: incomplete`); continue; }
    if (quote.length < 20 || quote.length > 300 || !plain(src.text).includes(plain(quote))) { dropped.push(`${label}: its quote wasn't found on the page, so it was not trusted`); continue; }
    if (looksPersonal(`${text} ${opener} ${quote}`)) { dropped.push(`${label}: personal, so it was left out`); continue; }
    if (words(opener) > 40 || /[!]/.test(opener)) { dropped.push(`${label}: the opening line was too long or too excited`); continue; }
    if (points.some((q) => q.source_url === src.url && q.kind === kind)) { dropped.push(`${label}: same source and kind as an earlier point`); continue; }
    points.push({ kind, text: text.slice(0, 200), opener: opener.slice(0, 260), source_url: src.url, source_title: src.title.slice(0, 120), quote: quote.slice(0, 300) });
    if (points.length >= 4) break;
  }
  return { points, dropped };
}
