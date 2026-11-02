import test from "node:test";
import assert from "node:assert/strict";
import { briefDigest, briefIsEmpty, cleanProse, cleanTrend } from "../lib/briefMath.ts";
import { numbersNotIn } from "../lib/insightsMath.ts";

const NICHES = ["trades", "dental"];
const numbers = (o = {}) => ({
  weekStart: "2026-11-02", target: 4,
  lastWeek: [{ hook: "Quotes going quiet?", platform: "instagram", label: "Instagram 2.4×" }, { hook: "Reviews on autopilot", platform: "linkedin", label: "LinkedIn: not enough data yet" }],
  pillars: [{ key: "Show the build", n: 6, median: 1.8, thin: false }, { key: "Niche pain", n: 2, median: 3.1, thin: true }],
  hookTypes: [{ key: "Question", n: 4, median: 1.5, thin: false }],
  keywordReplies: 7, outliers: { total: 2, top: [{ handle: "creator_one", platform: "instagram", x: 5.7, keyword: "SITE" }] },
  trends: [{ id: 3, title: "Missed call text back" }], film: [{ id: 9, idea: "Show a quote chaser", rank: 9 }, { id: 4, idea: "Steal this review text", rank: 8 }], ...o,
});

test("a trend needs a title, takes an https link with tracking removed, and only a niche you work in", () => {
  const ok = cleanTrend({ title: "  Missed call text back  ", url: "https://www.instagram.com/reel/ABC/?igsh=xyz#t", detail: "Seen on three creators", niche: "trades" }, NICHES);
  assert.deepEqual(ok.trend, { title: "Missed call text back", url: "https://www.instagram.com/reel/ABC", detail: "Seen on three creators", niche: "trades" });
  assert.equal(cleanTrend({ title: "Plain", url: "https://example.com/post?utm_source=x&id=4" }, NICHES).trend.url, "https://example.com/post?id=4");
  assert.deepEqual(cleanTrend({ title: "No link" }, NICHES).trend, { title: "No link", url: null, detail: null, niche: null });
  assert.ok("error" in cleanTrend({ title: "ab" }, NICHES));
  assert.ok("error" in cleanTrend({ title: "Fine", url: "http://example.com" }, NICHES));
  assert.ok("error" in cleanTrend({ title: "Fine", url: "javascript:alert(1)" }, NICHES));
  assert.ok("error" in cleanTrend({ title: "Fine", niche: "gardening" }, NICHES));
});
test("the digest holds every figure the brief shows, and only the non-thin best groups count as best", () => {
  const d = briefDigest(numbers());
  assert.match(d, /Posts last week: 2 against a target of 4 a week\./);
  assert.match(d, /"Quotes going quiet\?": Instagram 2\.4×/);
  assert.match(d, /Best pillar: Show the build, median 1\.8× over 6 posts/);   // not the thin 3.1× group
  assert.match(d, /Best hook type: Question, median 1\.5× over 4 posts/);
  assert.match(d, /Keyword replies counted by hand last week: 7\./);
  assert.match(d, /New outliers from creators you follow: 2\./);
  assert.match(d, /- 5\.7× their usual on instagram, keyword SITE/);
  assert.match(d, /1\. Show a quote chaser \(rank 9\)/);
  assert.ok(!d.includes("3.1"));
  assert.match(briefDigest(numbers({ pillars: [{ key: "x", n: 1, median: 9, thin: true }] })), /Best pillar: no group has 3 posts yet/);
});
test("a brief that quotes only the digest's numbers passes the number check, and one that invents a figure fails", () => {
  const d = briefDigest(numbers());
  assert.deepEqual(numbersNotIn("Show the build is strongest at 1.8× over 6 posts, and 7 keyword replies came in.", d), []);
  assert.deepEqual(numbersNotIn("You gained 40% more followers.", d), ["40"]);
});
test("emptiness and prose tidy-up", () => {
  assert.equal(briefIsEmpty(numbers()), false);
  assert.equal(briefIsEmpty(numbers({ lastWeek: [], outliers: { total: 0, top: [] }, trends: [], film: [] })), true);
  assert.deepEqual(cleanProse({ headline: " A week ", what_happened: ["a", "b", "c", "d"], what_to_do: ["x", "y", "z"] }), { headline: "A week", what_happened: ["a", "b", "c"], what_to_do: ["x", "y", "z"] });
  assert.equal(cleanProse({ headline: "h", what_happened: ["a"], what_to_do: ["x", "y", "z"] }), null);
  assert.equal(cleanProse({}), null);
});
