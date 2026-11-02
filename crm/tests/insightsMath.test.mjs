import test from "node:test";
import assert from "node:assert/strict";
import { cleanTags } from "../lib/contentMath.ts";
import { dayPart, digest, funnel, groupScores, lengthBand, numbersNotIn, rankIdeas, topBottom, weekdayOf, winner } from "../lib/insightsMath.ts";

const post = (o = {}) => ({ postId: 1, contentId: 1, platform: "instagram", multiple: 1, views72: 500, postedAt: "2026-11-02T10:00:00Z", url: "u", idea: "i", hookUsed: "h", pillar: "Show the build", hookType: null, format: null, niche: null, lengthS: null, ...o });

test("groups: median per group, thin groups (under 3 posts) last and flagged, untagged in Not set", () => {
  const posts = [post({ multiple: 2 }), post({ multiple: 3 }), post({ multiple: 1 }), post({ pillar: "Niche pain", multiple: 9 }), post({ pillar: null, multiple: 0.5 })];
  const g = groupScores(posts, (p) => p.pillar);
  assert.deepEqual(g.map((x) => [x.key, x.n, x.median, x.thin]), [["Show the build", 3, 2, false], ["Niche pain", 1, 9, true], ["Not set", 1, 0.5, true]]);
  assert.equal(winner(g).key, "Show the build");
  assert.equal(winner(groupScores([post({ multiple: 5 })], (p) => p.pillar)), null); // one post is never a winner
  assert.equal(winner(groupScores([post({ multiple: 0.5 }), post({ multiple: 0.6 }), post({ multiple: 0.7 })], (p) => p.pillar)), null); // below your usual
});
test("top and bottom five never share a post", () => {
  const six = [1, 2, 3, 4, 5, 6].map((m) => post({ postId: m, multiple: m }));
  const { top, bottom } = topBottom(six);
  assert.deepEqual(top.map((p) => p.multiple), [6, 5, 4, 3, 2]);
  assert.deepEqual(bottom.map((p) => p.multiple), [1]);
  assert.deepEqual(topBottom([post()]).bottom, []);
});
test("length bands, weekday and time of day in UK time", () => {
  assert.deepEqual([null, 10, 15, 45, 90].map(lengthBand), [null, "Under 15s", "15 to 29s", "30 to 59s", "60s or more"]);
  assert.equal(weekdayOf("2026-11-02T10:00:00Z"), "Monday");
  assert.equal(weekdayOf("2026-11-01T23:30:00Z"), "Sunday"); // 23:30 UK in winter is still Sunday
  assert.equal(dayPart("2026-11-02T08:00:00Z"), "Morning (5am to 11am)");
  assert.equal(dayPart("2026-07-02T17:30:00Z"), "Evening (6pm to 11pm)"); // 18:30 in British Summer Time
});
test("next to film: idea score plus one per matching winner, with reasons", () => {
  const pw = { key: "Show the build", n: 6, median: 1.8, thin: false };
  const hw = { key: "Question", n: 4, median: 1.5, thin: false };
  const ideas = [
    { id: 1, idea: "a", idea_score: 8, pillar: "Niche pain", hook_type: null },
    { id: 2, idea: "b", idea_score: 7, pillar: "Show the build", hook_type: "Question" },
    { id: 3, idea: "c", idea_score: null, pillar: "Show the build", hook_type: null },
  ];
  const r = rankIdeas(ideas, pw, hw);
  assert.deepEqual(r.map((x) => [x.id, x.rank]), [[2, 9], [1, 8], [3, 6]]);
  assert.equal(r[0].reasons.length, 3);
  assert.match(r[0].reasons[1], /Show the build is your best pillar \(median 1\.8×, 6 posts\)/);
  assert.match(r[2].reasons[0], /Not scored yet/);
  assert.equal(rankIdeas(ideas, null, null, 2).length, 2);
});
test("funnel per pillar", () => {
  const f = funnel(
    [{ contentId: 1, pillar: "Niche pain", views72: 100 }, { contentId: 1, pillar: "Niche pain", views72: null }, { contentId: 2, pillar: null, views72: 40 }],
    new Map([[1, 3], [9, 1]]), new Map([[1, "Niche pain"], [2, null]]));
  assert.deepEqual(f.find((r) => r.pillar === "Niche pain"), { pillar: "Niche pain", posts: 2, withNumbers: 1, views72: 100, keywordReplies: 3 });
  assert.equal(f.find((r) => r.pillar === "Not set").keywordReplies, 1);
});
test("the AI may only use numbers that are in the data", () => {
  const input = "Show the build: 6 posts, median 1.8×\nQuestion: 4 posts, median 1.5×, 12,400 views";
  assert.deepEqual(numbersNotIn("Show the build is strongest at 1.8× over 6 posts.", input), []);
  assert.deepEqual(numbersNotIn("It averaged 2.0× on 6 posts.", input), ["2.0"]);
  assert.deepEqual(numbersNotIn("12400 views is a lot, and 1.80 matches.", input), []); // compared as numbers
  assert.deepEqual(numbersNotIn("Try three hooks this week.", input), []); // words are fine
  assert.deepEqual(numbersNotIn("Post 5 more", input), ["5"]);
});
test("the digest holds every number the page shows", () => {
  const g = groupScores([post({ multiple: 2 }), post({ multiple: 3 }), post({ multiple: 1 })], (p) => p.pillar);
  const text = digest([{ title: "Pillar", groups: g }], [post({ multiple: 3 })], [], [{ pillar: "Show the build", posts: 3, withNumbers: 3, views72: 1500, keywordReplies: 2 }]);
  assert.match(text, /Show the build: 3 posts, median 2×/);
  assert.deepEqual(numbersNotIn("Show the build: 3 posts, median 2×, 1500 views, 2 keyword replies", text), []);
});
test("tags are checked against the known pillars and hook types", () => {
  assert.deepEqual(cleanTags({ pillar: "Niche pain", hook_type: "Question", niche: " dental ", length_s: "35" }).tags, { pillar: "Niche pain", hook_type: "Question", niche: "dental", length_s: 35 });
  assert.deepEqual(cleanTags({}).tags, { pillar: null, hook_type: null, niche: null, length_s: null });
  assert.ok("error" in cleanTags({ pillar: "Nonsense" }));
  assert.ok("error" in cleanTags({ hook_type: "Nonsense" }));
  assert.ok("error" in cleanTags({ length_s: "12.5" }));
  assert.ok("error" in cleanTags({ length_s: "0" }));
});
