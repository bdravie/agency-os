import test from "node:test";
import assert from "node:assert/strict";
import { cleanMetrics, cleanPostEntries, cleanPostUrl, fmtMultiple, median, performance, scoreLabel } from "../lib/contentMath.ts";

test("post links are checked, stripped of tracking and tidied", () => {
  assert.deepEqual(cleanPostUrl("instagram", " https://www.instagram.com/reel/ABC123/?igsh=xyz#top "), { url: "https://www.instagram.com/reel/ABC123" });
  assert.deepEqual(cleanPostUrl("linkedin", "https://www.linkedin.com/posts/me_activity-1?utm_source=share&rcm=ACoAA"), { url: "https://www.linkedin.com/posts/me_activity-1" });
  assert.ok("error" in cleanPostUrl("instagram", "https://linkedin.com/posts/x"));
  assert.ok("error" in cleanPostUrl("instagram", "http://instagram.com/reel/a"));
  assert.ok("error" in cleanPostUrl("instagram", "https://instagram.com/"));
  assert.ok("error" in cleanPostUrl("instagram", "https://evilinstagram.com/reel/a"));
  assert.ok("error" in cleanPostUrl("instagram", "not a link"));
  assert.ok("error" in cleanPostUrl("myspace", "https://myspace.com/x"));
});
test("ticked platforms need a link each, only your platforms, none twice", () => {
  const ok = cleanPostEntries([{ platform: "instagram", url: "https://instagram.com/reel/a" }, { platform: "linkedin", url: "https://linkedin.com/posts/b" }], ["instagram", "linkedin"]);
  assert.equal(ok.entries.length, 2);
  assert.ok("error" in cleanPostEntries([{ platform: "tiktok", url: "https://tiktok.com/@a/video/1" }], ["instagram", "linkedin"]));
  assert.ok("error" in cleanPostEntries([{ platform: "instagram", url: "https://instagram.com/reel/a" }, { platform: "instagram", url: "https://instagram.com/reel/b" }], ["instagram"]));
  assert.ok("error" in cleanPostEntries([], ["instagram"]));
});
test("typed numbers: blanks are fine, views are required, junk is refused", () => {
  const r = cleanMetrics({ views: "1,250", likes: "40", comments: "", shares: "3", saves: "12", follows: "", avg_watch_s: "7.46" });
  assert.deepEqual(r.metrics, { views: 1250, likes: 40, comments: null, shares: 3, saves: 12, follows: null, avg_watch_s: 7.5 });
  assert.ok("error" in cleanMetrics({ likes: "4" }));
  assert.ok("error" in cleanMetrics({ views: "-5" }));
  assert.ok("error" in cleanMetrics({ views: "12.5" }));
  assert.ok("error" in cleanMetrics({ views: "lots" }));
  assert.equal(cleanMetrics({ views: "0" }).metrics.views, 0);
});
test("median", () => {
  assert.equal(median([]), null);
  assert.equal(median([5]), 5);
  assert.equal(median([1, 9, 3]), 3);
  assert.equal(median([1, 2, 3, 10]), 2.5);
});
test("the score is views at 72h over your median, and needs 3 other posts", () => {
  const m = { views: 1200, saves: 24, shares: 12, comments: 6 };
  const p = performance(m, [500, 400, 600]);
  assert.deepEqual([p.status, p.multiple, p.baseline, p.saveRate, p.shareRate, p.commentRate], ["ok", 2.4, 500, 0.02, 0.01, 0.005]);
  assert.deepEqual(performance(m, [500, 400]), { status: "not_enough_data", have: 2 });
  assert.deepEqual(performance(m, []), { status: "not_enough_data", have: 0 });
  assert.deepEqual(performance(null, [1, 2, 3]), { status: "no_metrics" });
  assert.deepEqual(performance({ ...m, views: null }, [1, 2, 3]), { status: "no_metrics" });
});
test("only the latest 20 count, a zero median cannot divide, zero views is a real 0×", () => {
  const many = [...Array(20).fill(100), ...Array(30).fill(1_000_000)]; // the first 20 are the most recent
  assert.equal(performance({ views: 200, saves: null, shares: null, comments: null }, many).multiple, 2);
  assert.equal(performance({ views: 50, saves: 1, shares: 1, comments: 1 }, [0, 0, 0]).status, "not_enough_data");
  const z = performance({ views: 0, saves: 0, shares: 0, comments: 0 }, [10, 20, 30]);
  assert.deepEqual([z.multiple, z.saveRate], [0, null]);
});
test("format", () => { assert.equal(fmtMultiple(2.44), "2.4×"); assert.equal(fmtMultiple(1), "1.0×"); });
test("card labels", () => {
  assert.equal(scoreLabel("instagram", { status: "ok", multiple: 2.4, baseline: 500, saveRate: null, shareRate: null, commentRate: null }), "Instagram 2.4×");
  assert.equal(scoreLabel("linkedin", { status: "no_metrics" }), "LinkedIn: add 72h numbers");
  assert.equal(scoreLabel("linkedin", { status: "not_enough_data", have: 1 }), "LinkedIn: not enough data yet");
});
