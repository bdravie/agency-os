import test from "node:test";
import assert from "node:assert/strict";
import { buildCategoryTimeSeries, slugifyNicheKey } from "../lib/categoryTimeSeries.ts";

test("slugifyNicheKey cleans special characters and spaces", () => {
  assert.equal(slugifyNicheKey("Home Services & Trades!"), "home_services_trades");
  assert.equal(slugifyNicheKey("Dental Clinics"), "dental_clinics");
  assert.equal(slugifyNicheKey("  "), "niche");
});

test("buildCategoryTimeSeries groups posts into expected number of months", () => {
  const points = buildCategoryTimeSeries([], 6);
  assert.equal(points.length, 6);
  assert.ok(points[0].label);
  assert.ok(points[0].period);
});

test("posts are attributed to their category and month", () => {
  const now = new Date();
  const currentMonth = now.toISOString();
  const posts = [
    { niche: "trades", postedAt: currentMonth, views72: 500, multiple: 1.2 },
    { niche: "trades", postedAt: currentMonth, views72: 1500, multiple: 1.6 },
    { niche: "dental", postedAt: currentMonth, views72: 800, multiple: 2.0 },
  ];
  const points = buildCategoryTimeSeries(posts, 3);
  const latest = points[points.length - 1];

  assert.equal(latest.categories.trades?.count, 2);
  assert.equal(latest.categories.trades?.totalViews, 2000);
  assert.equal(latest.categories.trades?.avgMultiple, 1.4);
  assert.equal(latest.categories.dental?.count, 1);
  assert.equal(latest.categories.dental?.totalViews, 800);
  assert.equal(latest.categories.dental?.avgMultiple, 2.0);
});
