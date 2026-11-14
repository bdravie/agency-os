import test from "node:test";
import assert from "node:assert/strict";
import { audienceText, backlogState, fillNiche, inNiche, nicheAudience, nicheLabel, parseContentConfig, pickNiche } from "../lib/contentConfigMath.ts";

test("defaults: 4 posts, 15 ideas, first active niche", () => {
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
test("platforms: the ones named, ignoring unknown, or all four by default", () => {
  assert.deepEqual(parseContentConfig({ platforms: ["instagram", "linkedin", "myspace"] }, []).platforms, ["instagram", "linkedin"]);
  assert.deepEqual(parseContentConfig({}, []).platforms, ["tiktok", "instagram", "youtube", "linkedin"]);
  assert.deepEqual(parseContentConfig({ platforms: "linkedin" }, []).platforms, ["linkedin"]);
});
test("audience wording: the sentence, or built from the keys", () => {
  assert.equal(audienceText({ posts_per_week: 4, max_open_ideas: 15, niches: ["x"], audience: "plumbers", platforms: [] }), "plumbers");
  assert.equal(audienceText({ posts_per_week: 4, max_open_ideas: 15, niches: ["pest_control"], audience: "", platforms: [] }), "pest control");
  assert.equal(audienceText({ posts_per_week: 4, max_open_ideas: 15, niches: ["hvac", "roofing", "pest_control"], audience: "", platforms: [] }), "hvac, roofing and pest control");
  assert.equal(audienceText({ posts_per_week: 4, max_open_ideas: 15, niches: [], audience: "", platforms: [] }), "small UK businesses");
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
test("niche filter: labels, descriptions from the search terms, and which items show", () => {
  assert.equal(nicheLabel("pest_control"), "Pest control");
  const table = { trades: { search_terms: ["plumber", "roofer", "electrician", "heating engineer", "gardener"] }, dental: { search_terms: ["dentist"] } };
  assert.equal(nicheAudience("trades", table), "trades businesses (plumber, roofer, electrician, heating engineer)");
  assert.equal(nicheAudience("dental", table), "dental businesses (dentist)");
  assert.equal(nicheAudience("unknown_one", table), "unknown one businesses");
  assert.deepEqual(parseContentConfig({ content_niche: ["trades", "dental"] }, [], table).descriptions.dental, "dental businesses (dentist)");
  const items = [{ id: 1, niche: "trades" }, { id: 2, niche: "dental" }, { id: 3, niche: null }, { id: 4 }];
  assert.deepEqual(inNiche(items, "all").length, 4);
  assert.deepEqual(inNiche(items, "dental").map((i) => i.id), [2]);
  assert.deepEqual(inNiche(items, "untagged").map((i) => i.id), [3, 4]);
});
test("only a niche you work in (or untagged) can be asked for", () => {
  assert.equal(pickNiche("dental", ["trades", "dental"]), "dental");
  assert.equal(pickNiche("untagged", ["trades"]), "untagged");
  assert.equal(pickNiche("gardening", ["trades"]), "all");
  assert.equal(pickNiche(undefined, ["trades"]), "all");
});
