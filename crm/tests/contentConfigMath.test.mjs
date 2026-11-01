import test from "node:test";
import assert from "node:assert/strict";
import { audienceText, backlogState, fillNiche, parseContentConfig } from "../lib/contentConfigMath.ts";

test("defaults: 4 posts, 15 ideas, first focus niche", () => {
  const c = parseContentConfig(undefined, ["hvac", "roofing"]);
  assert.deepEqual([c.posts_per_week, c.max_open_ideas, c.niches, c.audience], [4, 15, ["hvac"], ""]);
  assert.deepEqual(parseContentConfig({}, undefined).niches, []);
});
test("reads the owner's settings, a list or a single key, and ignores nonsense numbers", () => {
  const c = parseContentConfig({ posts_per_week: 5, max_open_ideas: "lots", content_niche: ["trades", "dental"], content_audience: " trades and clinics " }, ["hvac"]);
  assert.deepEqual([c.posts_per_week, c.max_open_ideas, c.niches, c.audience], [5, 15, ["trades", "dental"], "trades and clinics"]);
  assert.deepEqual(parseContentConfig({ content_niche: "dental" }, []).niches, ["dental"]);
  assert.equal(parseContentConfig({ posts_per_week: 0 }, []).posts_per_week, 4);
});
test("audience wording: the sentence, or built from the keys", () => {
  assert.equal(audienceText({ posts_per_week: 4, max_open_ideas: 15, niches: ["x"], audience: "plumbers" }), "plumbers");
  assert.equal(audienceText({ posts_per_week: 4, max_open_ideas: 15, niches: ["pest_control"], audience: "" }), "pest control");
  assert.equal(audienceText({ posts_per_week: 4, max_open_ideas: 15, niches: ["hvac", "roofing", "pest_control"], audience: "" }), "hvac, roofing and pest control");
  assert.equal(audienceText({ posts_per_week: 4, max_open_ideas: 15, niches: [], audience: "" }), "small UK businesses");
});
test("the placeholder is filled everywhere, and a missing one is an error", () => {
  assert.equal(fillNiche("For {{NICHE}}. Again: {{NICHE}}.", "roofers"), "For roofers. Again: roofers.");
  assert.throws(() => fillNiche("no placeholder", "roofers"), /placeholder/);
});
test("the backlog blocks only when over the limit, and can be overridden", () => {
  assert.equal(backlogState(15, 15, false).blocked, false);
  assert.equal(backlogState(16, 15, false).blocked, true);
  assert.match(backlogState(39, 15, false).message, /39 ideas.*limit is 15.*archive/);
  assert.equal(backlogState(39, 15, true).blocked, false);
});
