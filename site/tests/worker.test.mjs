import test from "node:test";
import assert from "node:assert/strict";
import { handleHome, handleEvent, handleStats, pickVariant, parseCookies, isBot, ukDay } from "../shared/worker.ts";

const EXP = { id: "headline-angle", status: "running", started: "2026-11-10", variants: [{ id: "a", weight: 34 }, { id: "b", weight: 33 }, { id: "c", weight: 33 }] };
const NOW = () => new Date("2026-11-20T10:00:00Z");
const BROWSER = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15";

function fake() {
  const rows = new Map();
  const calls = [];
  const env = {
    ASSETS: { fetch: async (req) => new Response(`page:${new URL(req.url).pathname}`, { headers: { "content-type": "text/html" } }) },
    SITE_STATS_TOKEN: "t".repeat(32),
    DB: { prepare: (sql) => ({ bind: (...a) => ({
      run: async () => { calls.push(a); const k = a.slice(0, 4).join("|"); rows.set(k, (rows.get(k) ?? 0) + 1); },
      all: async () => ({ results: [...rows].map(([k, n]) => { const [day, experiment, variant, type] = k.split("|"); return { variant, type, n, day, experiment }; }) }),
    }) }) },
  };
  const pending = [];
  const ctx = { waitUntil: (p) => pending.push(p) };
  return { env, ctx, rows, calls, settle: () => Promise.all(pending) };
}
const req = (path, headers = {}, init = {}) => new Request(`https://clrsweb.uk${path}`, { headers: { "user-agent": BROWSER, ...headers }, ...init });

test("pickVariant follows the weights", () => {
  const picks = { a: 0, b: 0, c: 0 };
  for (let i = 0; i < 10000; i++) picks[pickVariant(EXP.variants, (i + 0.5) / 10000)]++;
  assert.ok(Math.abs(picks.a - 3400) <= 5 && Math.abs(picks.b - 3300) <= 5 && Math.abs(picks.c - 3300) <= 5);
});

test("parses cookies and spots bots", () => {
  assert.deepEqual(parseCookies("v=x.b; me=1"), { v: "x.b", me: "1" });
  assert.ok(isBot(null) && isBot("Googlebot/2.1") && isBot("Mozilla/5.0 Microsoft Office Safelinks"));
  assert.ok(!isBot(BROWSER));
  assert.equal(ukDay(new Date("2026-11-20T23:30:00Z")), "2026-11-20");
});

test("a new visitor gets a version, a cookie with the version only, and is counted once", async () => {
  const f = fake();
  const res = await handleHome(req("/"), f.env, f.ctx, EXP, { rand: () => 0.5, now: NOW });
  await f.settle();
  assert.equal(await res.text(), "page:/v/b");
  const cookie = res.headers.get("set-cookie");
  assert.match(cookie, /^v=headline-angle\.b;/);
  assert.match(cookie, /HttpOnly/);
  assert.equal(res.headers.get("cache-control"), "private, no-store");
  assert.deepEqual([...f.rows], [["2026-11-20|headline-angle|b|view", 1]]);
});

test("a returning visitor keeps their version and is not counted again", async () => {
  const f = fake();
  const res = await handleHome(req("/", { cookie: "v=headline-angle.c" }), f.env, f.ctx, EXP, { rand: () => 0, now: NOW });
  await f.settle();
  assert.equal(await res.text(), "page:/v/c");
  assert.equal(res.headers.get("set-cookie"), null);
  assert.equal(f.rows.size, 0);
});

test("a cookie from another experiment is replaced", async () => {
  const f = fake();
  const res = await handleHome(req("/", { cookie: "v=old-test.b" }), f.env, f.ctx, EXP, { rand: () => 0, now: NOW });
  await f.settle();
  assert.equal(await res.text(), "page:/v/a");
  assert.equal(f.rows.size, 1);
});

test("bots, prefetches, the owner and ?v= are served but never counted or given a cookie", async () => {
  const cases = [
    req("/", { "user-agent": "Googlebot/2.1" }),
    req("/", { "sec-purpose": "prefetch" }),
    req("/", { cookie: "me=1" }),
    req("/?v=c"),
  ];
  for (const r of cases) {
    const f = fake();
    const res = await handleHome(r, f.env, f.ctx, EXP, { rand: () => 0.5, now: NOW });
    await f.settle();
    assert.equal(res.status, 200);
    assert.equal(f.rows.size, 0);
    assert.equal(res.headers.get("set-cookie"), null);
  }
  const f = fake();
  assert.equal(await (await handleHome(req("/?v=c"), f.env, f.ctx, EXP, { rand: () => 0, now: NOW })).text(), "page:/v/c");
});

test("?me marks the owner's browser so it is never counted", async () => {
  const f = fake();
  const res = await handleHome(req("/?me"), f.env, f.ctx, EXP, { rand: () => 0.5, now: NOW });
  assert.match(res.headers.get("set-cookie"), /^me=1;/);
  assert.equal(f.rows.size, 0);
});

test("before the start date, or when paused, only the control is served and nothing is counted", async () => {
  for (const exp of [{ ...EXP, started: "2026-12-01" }, { ...EXP, status: "paused" }]) {
    const f = fake();
    const res = await handleHome(req("/"), f.env, f.ctx, exp, { rand: () => 0.99, now: NOW });
    await f.settle();
    assert.equal(await res.text(), "page:/v/a");
    assert.equal(f.rows.size, 0);
    assert.equal(res.headers.get("set-cookie"), null);
  }
});

const post = (body, headers = {}) => req("/e", { cookie: "v=headline-angle.b", "content-type": "application/json", ...headers }, { method: "POST", body: JSON.stringify(body) });

test("events are counted against the version in the cookie, whatever the client says", async () => {
  const f = fake();
  const res = await handleEvent(post({ t: "booked", variant: "c" }), f.env, f.ctx, EXP, { rand: Math.random, now: NOW });
  await f.settle();
  assert.equal(res.status, 204);
  assert.deepEqual([...f.rows], [["2026-11-20|headline-angle|b|booked", 1]]);
});

test("events with an unknown type, no cookie, a bot, the owner or another origin are not counted", async () => {
  const cases = [
    [post({ t: "hack" }), 400],
    [req("/e", { "content-type": "application/json" }, { method: "POST", body: '{"t":"booked"}' }), 204],
    [post({ t: "booked" }, { "user-agent": "curl/8" }), 204],
    [post({ t: "booked" }, { cookie: "v=headline-angle.b; me=1" }), 204],
    [post({ t: "booked" }, { origin: "https://evil.example" }), 403],
    [post({ t: "booked" }, { cookie: "v=headline-angle.z" }), 204],
  ];
  for (const [r, status] of cases) {
    const f = fake();
    const res = await handleEvent(r, f.env, f.ctx, EXP, { rand: Math.random, now: NOW });
    await f.settle();
    assert.equal(res.status, status);
    assert.equal(f.rows.size, 0);
  }
});

test("stats need the token and return counts per version", async () => {
  const f = fake();
  for (const t of ["view", "view", "cta_click", "booked"]) await handleEvent(post({ t }), f.env, f.ctx, EXP, { rand: Math.random, now: NOW }).catch(() => {});
  f.rows.set("2026-11-20|headline-angle|b|view", 2);
  assert.equal((await handleStats(req("/api/stats"), f.env, [EXP])).status, 401);
  assert.equal((await handleStats(req("/api/stats", { authorization: "Bearer nope" }), f.env, [EXP])).status, 401);
  assert.equal((await handleStats(req("/api/stats", { authorization: "Bearer short" }), { ...f.env, SITE_STATS_TOKEN: "short" }, [EXP])).status, 401);
  const ok = await handleStats(req("/api/stats", { authorization: `Bearer ${"t".repeat(32)}` }), f.env, [EXP]);
  assert.equal(ok.status, 200);
  const body = await ok.json();
  const b = body.experiments[0].variants.find((v) => v.id === "b");
  assert.equal(b.visitors, 2);
  assert.equal(b.booked, 1);
  assert.equal(b.clicks, 1);
});

test("the site names the owner and address until there is a company number, then the company", async () => {
  const { identityLine } = await import("../src/identity.ts");
  const s = { businessName: "CLRS Web", ownerFullName: "Sam Example", businessAddress: "1 Example Street, London" };
  assert.equal(identityLine({ ...s, companyNumber: "" }), "CLRS Web is the trading name of Sam Example, 1 Example Street, London");
  assert.equal(identityLine({ ...s, companyNumber: "12345678" }), "CLRS Web, company number 12345678, 1 Example Street, London");
});
