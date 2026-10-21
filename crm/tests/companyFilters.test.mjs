import test from "node:test";
import assert from "node:assert/strict";
import { buildListQuery, cleanArea, SORTS, FILTERS } from "../lib/companyFilters.ts";
import { explainSuitability } from "../lib/suitability.ts";

test("no filters means no extra conditions and the usual order", () => {
  const q = buildListQuery({}, 4);
  assert.deepEqual(q.where, []); assert.deepEqual(q.params, []); assert.match(q.order, /^created_at DESC/);
});

test("recently added and most suitable sort as expected", () => {
  assert.match(buildListQuery({ sort: "junk" }, 1).order, /^created_at DESC/);
  assert.match(buildListQuery({}, 1).order, /^created_at DESC/);
  assert.match(buildListQuery({ sort: "followups" }, 1).order, /followup_due/);
  assert.match(buildListQuery({ sort: "suitable" }, 1).order, /^suitability DESC/);
  assert.match(buildListQuery({ sort: "name" }, 1).order, /lower\(name\)/);
});

test("every sort and filter choice in the menus has a working query", () => {
  for (const s of SORTS) assert.ok(buildListQuery({ sort: s.key }, 1).order);
  for (const [key, def] of Object.entries(FILTERS)) for (const [val] of def.options) {
    const q = buildListQuery({ [key]: val }, 1);
    assert.equal(q.where.length, val === "" ? 0 : 1, `${key}=${val}`);
  }
});

test("unknown or hostile values are ignored, never put into SQL", () => {
  const q = buildListQuery({ sort: "name; DROP TABLE companies", added: "1' OR '1'='1", tier: "zzz", source: "x" }, 1);
  assert.deepEqual(q.where, []); assert.doesNotMatch(q.order, /DROP/); assert.match(q.order, /^created_at DESC/);
});

test("filters combine, and the typed area is a numbered parameter", () => {
  const q = buildListQuery({ added: "7", tier: "ab", contact: "email", area: "Leeds", sort: "suitable" }, 4);
  assert.equal(q.where.length, 4); assert.deepEqual(q.params, ["Leeds"]);
  assert.match(q.where[3], /\$4/); assert.deepEqual(q.active.sort(), ["added", "area", "contact", "tier"]);
});

test("the area box can't act as a wildcard or inject anything", () => {
  assert.equal(cleanArea("  LS1 %_; DROP--  "), "LS1 DROP--");
  assert.equal(cleanArea("x".repeat(100)).length, 40);
  assert.equal(buildListQuery({ area: "%%" }, 1).where.length, 0);
});

const row = { suitability: 91, tier: "A", excluded: false, fit_pts: 51, eligible_pts: 15, website_pts: 5, email_pts: 8, phone_pts: 3, rating_pts: 5, reviews_pts: 4, fit_score: 85, maps_rating: 4.1, maps_reviews: 60 };
test("the tooltip explains the score in plain words", () => {
  const r = explainSuitability(row);
  assert.ok(r.some((x) => /\+51 Companies House size and filing health \(fit 85\/100\)/.test(x)));
  assert.ok(r.some((x) => /\+15 verified active limited company/.test(x)));
  assert.ok(r.some((x) => /\+5 Google rating 4.1/.test(x)));
});
test("missing pieces are named, and skipped companies say why", () => {
  const r = explainSuitability({ ...row, eligible_pts: 0, email_pts: 0, website_pts: 0, phone_pts: 0, maps_rating: null, maps_reviews: null, fit_pts: 0, fit_score: null });
  assert.ok(r.some((x) => /not checked yet/.test(x))); assert.ok(r.some((x) => /no generic email yet/.test(x)));
  assert.match(explainSuitability({ ...row, excluded: true })[0], /can't be contacted/);
});
