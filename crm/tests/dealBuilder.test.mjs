import test from "node:test";
import assert from "node:assert/strict";
import { cleanLines, suggestTitle } from "../lib/dealBuilder.ts";
import { validateOffer } from "../lib/offerCatalogue.ts";
import { totals } from "../lib/dealOffers.ts";

const known = new Map([[1, "setup"], [2, "monthly"]]);
const line = (o) => ({ offerId: 1, name: "", billing: "setup", price: 100, durationDays: null, bundleName: null, ...o });

test("a catalogue line takes its billing type from the database, not from the browser", () => {
  const r = cleanLines([line({ billing: "monthly" })], known);
  assert.equal(r.lines[0].billing, "setup");
});

test("a custom service needs a name and a billing type, and keeps no package", () => {
  assert.match(cleanLines([line({ offerId: null, name: "  ", billing: "one_off" })], known).error, /name/);
  assert.match(cleanLines([line({ offerId: null, name: "Photo shoot", billing: "weekly" })], known).error, /billed/);
  const r = cleanLines([line({ offerId: null, name: " Photo shoot ", billing: "one_off", bundleName: "SEO package" })], known);
  assert.deepEqual([r.lines[0].customName, r.lines[0].offerId, r.lines[0].bundleName], ["Photo shoot", null, null]);
});

test("bad prices, days, unknown services and empty deals are refused", () => {
  assert.ok(cleanLines([line({ price: -1 })], known).error);
  assert.ok(cleanLines([line({ price: "abc" })], known).error);
  assert.ok(cleanLines([line({ durationDays: 0 })], known).error);
  assert.ok(cleanLines([line({ offerId: 99 })], known).error);
  assert.ok(cleanLines([], known).error);
  assert.ok(cleanLines(Array.from({ length: 31 }, () => line()), known).error);
});

test("a price can be changed from the default and is rounded to pence", () => {
  assert.equal(cleanLines([line({ price: 1234.567 })], known).lines[0].price, 1234.57);
});

test("a built deal keeps one-off and monthly money apart", () => {
  const r = cleanLines([line({ price: 7500 }), line({ offerId: 2, billing: "monthly", price: 250 }), line({ offerId: null, name: "Logo", billing: "one_off", price: 400 })], known);
  const t = totals(r.lines.map((l) => ({ billing: l.billing, price: l.price, credit: 0 })));
  assert.equal(t.oneOff, 7900);
  assert.equal(t.monthly, 250);
});

test("deal titles", () => {
  assert.equal(suggestTitle([]), "");
  assert.equal(suggestTitle([{ name: "A", bundleName: "SEO package" }, { name: "B", bundleName: "SEO package" }]), "SEO package");
  assert.equal(suggestTitle([{ name: "A", bundleName: "SEO package" }, { name: "B", bundleName: "Website package" }]), "SEO package + 1 more");
  assert.equal(suggestTitle([{ name: "A", bundleName: "SEO package" }, { name: "Custom", bundleName: null }]), "SEO package + 1 more");
  assert.equal(suggestTitle([{ name: "Chatbot", bundleName: null }]), "Chatbot");
});

const svc = (name, extra = {}) => ({ name, billing: "setup", setup_price_gbp: 100, price_min_gbp: 50, price_max_gbp: 200, deliverables: ["x"], ...extra });

test("catalogue: a package must list real services and cannot nest", () => {
  const all = [svc("A"), svc("B", { billing: null }), { name: "P", includes: ["A"] }];
  assert.deepEqual(validateOffer(all[2], all), []);
  assert.match(validateOffer({ name: "Q", includes: ["Missing"] }, all)[0], /not an offer/);
  assert.match(validateOffer({ name: "Q", includes: ["P"] }, all)[0], /packages cannot contain/);
  assert.match(validateOffer({ name: "Q", includes: ["B"] }, all)[0], /no billing/);
  assert.match(validateOffer({ name: "Q", includes: ["A", "A"] }, all)[0], /twice/);
  assert.match(validateOffer({ name: "Q", includes: [] }, all)[0], /at least one/);
  assert.match(validateOffer({ name: "Q", includes: ["A"], billing: "setup" }, all)[0], /no billing of its own/);
});

test("catalogue: a service's default price must sit inside its range", () => {
  assert.deepEqual(validateOffer(svc("A")), []);
  assert.match(validateOffer(svc("A", { setup_price_gbp: 500 }))[0], /outside/);
  assert.match(validateOffer(svc("A", { billing: "monthly", monthly_price_gbp: 10, setup_price_gbp: 0 }))[0], /outside/);
  assert.match(validateOffer(svc("A", { deliverables: [] }))[0], /deliverables/);
});

test("offer tiers: known codes, one offer per tier, and only on something that can be sold on a deal", async () => {
  const { readFileSync } = await import("node:fs");
  const { parse } = await import("yaml");
  const svc = (o) => ({ billing: "one_off", deliverables: ["x"], ...o });
  assert.deepEqual(validateOffer(svc({ name: "A", tier: "entry" }), []), []);
  assert.match(validateOffer(svc({ name: "A", tier: "gold" }), []).join(), /tier must be one of/);
  const two = [svc({ name: "A", tier: "mid" }), svc({ name: "B", tier: "mid" })];
  assert.match(validateOffer(two[0], two).join(), /more than one offer/);
  assert.match(validateOffer({ name: "Old", tier: "entry" }, []).join(), /needs a billing type/);
  // The real catalogue is valid and names exactly one offer for each of the three tiers.
  const items = parse(readFileSync(new URL("../../config/offers.yaml", import.meta.url), "utf8")).offers;
  assert.deepEqual(items.flatMap((o) => validateOffer(o, items)), []);
  assert.deepEqual(items.filter((o) => o.tier).map((o) => o.tier).sort(), ["entry", "mid", "premium"]);
});
