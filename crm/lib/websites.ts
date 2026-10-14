// Finding a company's website and generic contact email. Company-level only: no named people.
const GENERIC = new Set(["info", "hello", "contact", "enquiries", "enquiry", "office", "admin", "team", "sales", "support"]);
const UA = "AgencyOSBot";

export const googleSearchUrl = (name: string, postcode?: string | null) =>
  `https://www.google.com/search?q=${encodeURIComponent([name, postcode, "website"].filter(Boolean).join(" "))}`;

/** A plain public hostname only: no IPs, localhost or internal names (the server fetches this). */
export function safeDomain(domain: string): boolean {
  return /^(?!-)[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/.test(domain) && !/\.(local|internal|localhost|lan)$/.test(domain);
}

export function genericEmails(html: string, domain: string): string[] {
  const found = new Set<string>();
  for (const e of html.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) ?? []) {
    const [local, host] = e.toLowerCase().split("@");
    if (GENERIC.has(local) && (host === domain || host.endsWith("." + domain))) found.add(`${local}@${host}`);
  }
  return [...found].sort();
}

/** Minimal robots.txt check for our user agent or *. If robots.txt cannot be read, do not fetch. */
async function robotsAllows(domain: string, path: string): Promise<boolean> {
  let text: string;
  try {
    const res = await fetch(`https://${domain}/robots.txt`, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(8000) });
    if (res.status === 404) return true;
    if (!res.ok) return false;
    text = await res.text();
  } catch { return false; }
  let applies = false;
  const disallow: string[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.split("#")[0].trim();
    const [k, ...rest] = line.split(":");
    const v = rest.join(":").trim();
    if (/^user-agent$/i.test(k)) applies = v === "*" || v.toLowerCase() === UA.toLowerCase();
    else if (applies && /^disallow$/i.test(k) && v) disallow.push(v);
  }
  return !disallow.some((d) => path.startsWith(d));
}

export async function findGenericEmail(domain: string): Promise<string | null> {
  for (const path of ["/", "/contact", "/contact-us"]) {
    if (!(await robotsAllows(domain, path))) continue;
    try {
      const res = await fetch(`https://${domain}${path}`, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(10000) });
      if (!res.ok) continue;
      const emails = genericEmails((await res.text()).slice(0, 500_000), domain);
      if (emails.length) return emails[0];
    } catch { /* try the next page */ }
  }
  return null;
}
