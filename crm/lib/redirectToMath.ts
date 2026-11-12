// Pure rules for redirects behind a proxy (no Next imports), so they can be tested on their own.

export const LOCAL = ["127.0.0.1:3000", "localhost:3000"];

/** The private addresses the CRM is also opened on (CRM_EXTRA_ORIGINS, e.g. the Tailscale name for the phone; docs/SETUP.md). */
export function extraHosts(raw = process.env.CRM_EXTRA_ORIGINS ?? ""): string[] {
  return raw.split(",").map((h) => h.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "")).filter((h) => h && !h.includes("*"));
}

/**
 * The origin the browser actually used. Behind Tailscale serve, Next's own req.url says localhost:3000, so a redirect built from it
 * sends the phone to localhost. The forwarded host is trusted only when it is one of the CRM's own addresses; anything else falls
 * back to req.url, so a forged header cannot redirect anywhere.
 */
export function publicOrigin(headers: { get(name: string): string | null }, fallback: string, allowed = [...LOCAL, ...extraHosts()]): string {
  const host = (headers.get("x-forwarded-host") ?? headers.get("host") ?? "").split(",")[0].trim().toLowerCase();
  if (!host || !allowed.includes(host)) return new URL(fallback).origin;
  const proto = (headers.get("x-forwarded-proto") ?? "").split(",")[0].trim().toLowerCase() === "https" ? "https" : new URL(fallback).protocol.replace(":", "");
  return `${proto}://${host}`;
}
