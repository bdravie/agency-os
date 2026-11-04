// Edge logic for the public site's split tests. Pure functions with injected dependencies so they can be tested without Cloudflare.
// Stores ONLY anonymous counts per day, experiment, version and event type. No IPs, no user agents, no per-visitor rows.

export type Variant = { id: string; weight: number };
export type Experiment = { id: string; status: string; started: string; variants: Variant[] };
export type Stmt = { bind(...a: unknown[]): { run(): Promise<unknown>; all(): Promise<{ results: any[] }> } };
export type Env = { DB: { prepare(sql: string): Stmt }; ASSETS: { fetch(r: Request): Promise<Response> }; SITE_STATS_TOKEN?: string };
export type Ctx = { waitUntil(p: Promise<unknown>): void };
export type Deps = { rand: () => number; now: () => Date };

export const EVENT_TYPES = ["cta_click", "scroll_75", "booked"] as const;
const BOT = /bot|crawl|spider|slurp|preview|headless|monitor|scan|fetch|curl|wget|python|java\/|go-http|facebookexternalhit|slack|whatsapp|telegram|mimecast|proofpoint|barracuda|safelinks/i;

export const isBot = (ua: string | null) => !ua || BOT.test(ua);
export const isPrefetch = (h: Headers) => /prefetch|prerender/i.test(`${h.get("sec-purpose") ?? ""} ${h.get("purpose") ?? ""}`);
export const ukDay = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(d);

export function parseCookies(header: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (header ?? "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return out;
}

export function pickVariant(variants: Variant[], r: number): string {
  const total = variants.reduce((n, v) => n + v.weight, 0);
  let x = r * total;
  for (const v of variants) { if (x < v.weight) return v.id; x -= v.weight; }
  return variants[variants.length - 1].id;
}

export const isRunning = (e: Experiment | undefined, today: string): e is Experiment => !!e && e.status === "running" && today >= e.started;

/** The cookie holds the experiment and the version only, e.g. "headline-angle.b". It identifies nobody. */
export function variantFromCookie(e: Experiment, cookies: Record<string, string>): string | null {
  const [exp, id] = (cookies.v ?? "").split(".");
  return exp === e.id && e.variants.some((v) => v.id === id) ? id : null;
}

export async function increment(env: Env, day: string, experiment: string, variant: string, type: string) {
  await env.DB.prepare(
    "INSERT INTO events (day, experiment, variant, type, n) VALUES (?, ?, ?, ?, 1) ON CONFLICT (day, experiment, variant, type) DO UPDATE SET n = n + 1",
  ).bind(day, experiment, variant, type).run();
}

async function serve(request: Request, env: Env, variant: string, extra: Record<string, string> = {}) {
  const asset = await env.ASSETS.fetch(new Request(new URL(`/v/${variant}`, request.url), { headers: { accept: "text/html" } }));
  const res = new Response(asset.body, asset);
  res.headers.set("Cache-Control", "private, no-store");
  res.headers.set("Vary", "Cookie");
  for (const [k, v] of Object.entries(extra)) res.headers.append(k, v);
  return res;
}

const cookieAttrs = "Path=/; Max-Age=2592000; SameSite=Lax; Secure; HttpOnly";

/** GET "/": pick or remember a version, count a new visitor once, serve that version's page. */
export async function handleHome(request: Request, env: Env, ctx: Ctx, experiment: Experiment | undefined, deps: Deps) {
  const url = new URL(request.url);
  const today = ukDay(deps.now());
  const control = experiment?.variants[0]?.id ?? "a";
  const cookies = parseCookies(request.headers.get("cookie"));

  if (url.searchParams.has("me")) return serve(request, env, control, { "Set-Cookie": `me=1; Path=/; Max-Age=31536000; SameSite=Lax; Secure; HttpOnly` });
  const forced = url.searchParams.get("v");
  if (forced && experiment?.variants.some((v) => v.id === forced)) return serve(request, env, forced);
  if (cookies.me || isBot(request.headers.get("user-agent")) || isPrefetch(request.headers) || !isRunning(experiment, today)) return serve(request, env, control);

  const known = variantFromCookie(experiment, cookies);
  if (known) return serve(request, env, known);

  const variant = pickVariant(experiment.variants, deps.rand());
  ctx.waitUntil(increment(env, today, experiment.id, variant, "view"));
  return serve(request, env, variant, { "Set-Cookie": `v=${experiment.id}.${variant}; ${cookieAttrs}` });
}

/** POST "/e": count one event for the version in the visitor's cookie. The client never says which version. */
export async function handleEvent(request: Request, env: Env, ctx: Ctx, experiment: Experiment | undefined, deps: Deps) {
  const url = new URL(request.url);
  const origin = request.headers.get("origin");
  if (origin && origin !== url.origin) return new Response(null, { status: 403 });
  if (Number(request.headers.get("content-length") ?? 0) > 200) return new Response(null, { status: 413 });
  const today = ukDay(deps.now());
  const cookies = parseCookies(request.headers.get("cookie"));
  if (cookies.me || isBot(request.headers.get("user-agent")) || !isRunning(experiment, today)) return new Response(null, { status: 204 });

  let type = "";
  try { type = String(((await request.json()) as { t?: unknown }).t ?? ""); } catch { return new Response(null, { status: 400 }); }
  if (!(EVENT_TYPES as readonly string[]).includes(type)) return new Response(null, { status: 400 });

  const variant = variantFromCookie(experiment, cookies);
  if (!variant) return new Response(null, { status: 204 });
  ctx.waitUntil(increment(env, today, experiment.id, variant, type));
  return new Response(null, { status: 204 });
}

function sameToken(a: string, b: string) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

/** GET "/api/stats": totals per version since the experiment started, for the CRM. Needs the bearer token. */
export async function handleStats(request: Request, env: Env, experiments: Experiment[]) {
  const token = env.SITE_STATS_TOKEN ?? "";
  const given = (request.headers.get("authorization") ?? "").replace(/^Bearer /, "");
  if (token.length < 24 || !sameToken(given, token)) return new Response("Unauthorised", { status: 401 });

  const out = [];
  for (const e of experiments) {
    const { results } = await env.DB.prepare("SELECT variant, type, SUM(n) AS n FROM events WHERE experiment = ? AND day >= ? GROUP BY variant, type").bind(e.id, e.started).all();
    const variants = e.variants.map((v) => {
      const n = (t: string) => Number(results.find((r) => r.variant === v.id && r.type === t)?.n ?? 0);
      return { id: v.id, visitors: n("view"), clicks: n("cta_click"), scroll75: n("scroll_75"), booked: n("booked") };
    });
    out.push({ id: e.id, status: e.status, started: e.started, variants });
  }
  return new Response(JSON.stringify({ experiments: out }), { headers: { "content-type": "application/json", "Cache-Control": "no-store" } });
}
