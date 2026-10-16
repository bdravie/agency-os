import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

// Fetching other people's websites from the server must never reach internal addresses, even through a redirect or a hostname that
// points at a private IP. Public https pages only, a size cap, a time cap, and every redirect hop is checked again.

/** Loopback, private, link-local, CGNAT, multicast and other non-public IPv4/IPv6 addresses. */
export function isPrivateIp(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) {
    const [a, b] = ip.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19));
  }
  if (v === 6) {
    const t = ip.toLowerCase();
    if (t === "::1" || t === "::") return true;
    if (t.startsWith("::ffff:")) return isPrivateIp(t.slice(7));
    return /^f[cd]/.test(t) || /^fe[89ab]/.test(t) || t.startsWith("ff");
  }
  return true;   // not an IP at all: treat as unsafe
}

export const publicHostname = (h: string) => /^(?!-)[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/.test(h.toLowerCase()) && !/\.(local|internal|localhost|lan|home|corp)$/.test(h.toLowerCase());

async function assertPublic(url: URL) {
  if (url.protocol !== "https:") throw new Error("Only https pages are read.");
  if (url.port && url.port !== "443") throw new Error("Unusual port.");
  if (!publicHostname(url.hostname)) throw new Error("Not a public website address.");
  const addrs = await lookup(url.hostname, { all: true });
  if (addrs.length === 0 || addrs.some((a) => isPrivateIp(a.address))) throw new Error("Address is not public.");
}

export type Fetched = { ok: boolean; status: number; finalUrl: string; html: string | null; reason?: string };

/** GET a public https page as HTML. Follows up to 3 redirects, re-checking each. Never throws. */
export async function fetchPublicHtml(rawUrl: string, opts: { userAgent?: string; maxBytes?: number; timeoutMs?: number } = {}): Promise<Fetched> {
  const { userAgent = "AgencyOSBot", maxBytes = 600_000, timeoutMs = 8000 } = opts;
  let url: URL;
  try { url = new URL(rawUrl); } catch { return { ok: false, status: 0, finalUrl: rawUrl, html: null, reason: "Bad address" }; }
  try {
    for (let hop = 0; hop < 4; hop++) {
      await assertPublic(url);
      const res = await fetch(url, { headers: { "user-agent": userAgent, accept: "text/html" }, redirect: "manual", signal: AbortSignal.timeout(timeoutMs) });
      if (res.status >= 300 && res.status < 400 && res.headers.get("location")) { url = new URL(res.headers.get("location")!, url); continue; }
      if (!res.ok) return { ok: false, status: res.status, finalUrl: url.toString(), html: null, reason: `The site answered ${res.status}` };
      if (!(res.headers.get("content-type") ?? "").includes("html")) return { ok: false, status: res.status, finalUrl: url.toString(), html: null, reason: "Not a web page" };
      const reader = res.body?.getReader();
      if (!reader) return { ok: false, status: res.status, finalUrl: url.toString(), html: null, reason: "Empty" };
      const chunks: Uint8Array[] = []; let size = 0;
      while (size < maxBytes) { const { done, value } = await reader.read(); if (done) break; chunks.push(value); size += value.length; }
      reader.cancel().catch(() => {});
      return { ok: true, status: res.status, finalUrl: url.toString(), html: Buffer.concat(chunks).toString("utf8").slice(0, maxBytes) };
    }
    return { ok: false, status: 0, finalUrl: url.toString(), html: null, reason: "Too many redirects" };
  } catch (e) {
    return { ok: false, status: 0, finalUrl: url.toString(), html: null, reason: e instanceof Error ? e.message : "Could not load" };
  }
}
