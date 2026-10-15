import test from "node:test";
import assert from "node:assert/strict";
import { apifySettings, planRun, perPlaceUsd, parsePlace, genericOnly, postcodeDistrict, matchCompanyHouse, priorityScore, domainOf } from "../lib/apifyMath.ts";

const S = apifySettings({});

test("defaults suit the free plan: about $0.15 a day, $4 a month", () => {
  assert.equal(S.dailyUsd, 0.15); assert.equal(S.monthlyUsd, 4);
  assert.equal(perPlaceUsd(true, S), 0.006); assert.equal(perPlaceUsd(false, S), 0.004);
  assert.equal(apifySettings({ APIFY_DAILY_BUDGET_USD: "0.5" }).dailyUsd, 0.5);
  assert.equal(apifySettings({ APIFY_DAILY_BUDGET_USD: "junk" }).dailyUsd, 0.15);
});

test("a run is cut down to what today's budget allows, and the cap never exceeds what is left", () => {
  const p = planRun({ requested: 50, contacts: true, dailyLeft: 0.15, monthlyLeft: 4, s: S });
  assert.equal(p.ok, true); assert.equal(p.places, 25); assert.equal(p.limitedBy, "daily");
  assert.ok(p.maxChargeUsd <= 0.15 && p.maxChargeUsd >= p.estUsd);
  const small = planRun({ requested: 10, contacts: true, dailyLeft: 0.15, monthlyLeft: 4, s: S });
  assert.equal(small.places, 10); assert.equal(small.estUsd, 0.06); assert.equal(small.limitedBy, null);
  assert.ok(small.maxChargeUsd > small.estUsd && small.maxChargeUsd <= 0.15);
});

test("the monthly budget limits too, and a spent budget refuses with a clear reason", () => {
  const m = planRun({ requested: 20, contacts: false, dailyLeft: 0.15, monthlyLeft: 0.04, s: S });
  assert.equal(m.places, 10); assert.equal(m.limitedBy, "monthly");
  const none = planRun({ requested: 5, contacts: true, dailyLeft: 0.003, monthlyLeft: 4, s: S });
  assert.equal(none.ok, false); assert.match(none.error, /Today's Apify budget/);
  const month = planRun({ requested: 5, contacts: true, dailyLeft: 0.15, monthlyLeft: 0, s: S });
  assert.equal(month.ok, false); assert.match(month.error, /month/);
  assert.equal(planRun({ requested: 5, contacts: true, dailyLeft: -1, monthlyLeft: 4, s: S }).ok, false);
});

test("requests are capped at 50 places however much budget there is", () => {
  const big = planRun({ requested: 500, contacts: false, dailyLeft: 50, monthlyLeft: 50, s: S });
  assert.equal(big.places, 50);
});

const RAW = { placeId: "ChIJ1", title: "Bright Plumbing & Heating Ltd", address: "1 High St, Leeds LS1 4DJ", street: "1 High St", city: "Leeds", postalCode: "ls1 4dj",
  location: { lat: 53.8, lng: -1.55 }, phone: "0113 496 0000", website: "https://www.brightplumbing.co.uk/contact?x=1", totalScore: 4.26, reviewsCount: 87,
  categories: ["Plumber", "Heating contractor"], url: "https://www.google.com/maps/place/?q=place_id:ChIJ1", permanentlyClosed: false, temporarilyClosed: false,
  emails: ["info@brightplumbing.co.uk", "john.smith@brightplumbing.co.uk", "hello@other.com", { value: "sales@brightplumbing.co.uk" }],
  facebooks: ["https://www.facebook.com/brightplumbing"], instagrams: [], linkedIns: ["javascript:alert(1)"] };

test("a place is cleaned: domain, postcode, rating, and ONLY generic company emails", () => {
  const p = parsePlace(RAW);
  assert.equal(p.domain, "brightplumbing.co.uk"); assert.equal(p.postcode, "LS1 4DJ"); assert.equal(p.rating, 4.3);
  assert.deepEqual(p.emails, ["info@brightplumbing.co.uk", "sales@brightplumbing.co.uk"]);   // named person and other-domain addresses dropped
  assert.deepEqual(p.socials, { facebook: "https://www.facebook.com/brightplumbing" });       // non-http link dropped
  assert.equal(p.closed, null); assert.ok(p.mapsUrl.startsWith("https://www.google.com/maps"));
});

test("unusable or hostile items are handled", () => {
  assert.equal(parsePlace({}), null); assert.equal(parsePlace({ title: "x" }), null); assert.equal(parsePlace(null), null);
  const p = parsePlace({ placeId: "a", title: "<script>alert(1)</script>Acme", url: "http://evil.example/maps", website: "javascript:alert(1)" });
  assert.equal(p.title, "alert(1) Acme"); assert.equal(p.mapsUrl, null); assert.equal(p.domain, null); assert.equal(p.website, null);
  assert.equal(parsePlace({ placeId: "a", title: "T", permanentlyClosed: true }).closed, "permanent");
  assert.equal(parsePlace({ placeId: "a", title: "T", temporarilyClosed: true }).closed, "temporary");
});

test("emails: generic only, own domain only", () => {
  assert.deepEqual(genericOnly(["Info@Example.com", "bob@example.com", "info@evil.com"], "example.com"), ["info@example.com"]);
  assert.deepEqual(genericOnly(["info@example.com"], null), []);
  assert.deepEqual(genericOnly("nope", "example.com"), []);
});

test("domains and postcode districts", () => {
  assert.equal(domainOf("https://www.Example.co.uk/a"), "example.co.uk"); assert.equal(domainOf("javascript:alert(1)"), null); assert.equal(domainOf(null), null);
  assert.equal(postcodeDistrict("LS1 4DJ"), "LS1"); assert.equal(postcodeDistrict("ls14dj"), "LS1"); assert.equal(postcodeDistrict("EC1A 1BB"), "EC1A"); assert.equal(postcodeDistrict("1 High St, Leeds LS6 2AB"), "LS6"); assert.equal(postcodeDistrict("no postcode here"), null);
  assert.equal(postcodeDistrict(null), null);
});

const cand = (name, status, address, number = "01234567", type = "ltd") => ({ number, name, type, status, address });
test("matching to Companies House trusts exact names, most when the area agrees", () => {
  const place = { title: "Bright Plumbing & Heating Ltd", postcode: "LS1 4DJ" };
  const both = matchCompanyHouse(place, [cand("BRIGHT PLUMBING AND HEATING LIMITED", "active", "1 High St, Leeds, LS1 4DJ"), cand("Bright Plumbing Services Ltd", "active", "Leeds LS1 4DJ")]);
  assert.equal(both.match, "exact+postcode"); assert.equal(both.candidate.number, "01234567");
  assert.equal(matchCompanyHouse(place, [cand("Bright Plumbing & Heating Limited", "active", "5 Elsewhere Rd, London, E1 1AA")]).match, "exact");
  assert.equal(matchCompanyHouse(place, [cand("Bright Plumbing Services Ltd", "active", "Leeds LS1 4DJ")]).match, "none");
  assert.equal(matchCompanyHouse(place, []).match, "none");
  const two = matchCompanyHouse(place, [cand("Bright Plumbing & Heating Ltd", "active", "London E1 1AA", "1"), cand("Bright Plumbing & Heating Ltd", "active", "Bristol BS1 1AA", "2")]);
  assert.equal(two.match, "ambiguous"); assert.equal(two.candidate, null);
});

const P = { website: "x.co.uk", phone: "0113", emails: ["info@x.co.uk"], rating: 4.0, reviews: 80, closed: null };
test("ranking: an eligible, reachable, established business with room to improve scores top", () => {
  const r = priorityScore(P, "eligible", { type: "ltd", status: "active" });
  assert.equal(r.score, 75); assert.equal(r.tier, "A"); assert.ok(r.reasons.some((x) => /active limited company/.test(x)));
});
test("ranking: unmatched businesses can never be an A, and not-eligible or closed ones are skipped", () => {
  const u = priorityScore(P, "unmatched", null);
  assert.equal(u.score, 40); assert.equal(u.tier, "B"); assert.ok(u.reasons.some((x) => /can't be contacted/.test(x)));
  const n = priorityScore(P, "not_eligible", { type: "limited-partnership", status: "active" });
  assert.equal(n.tier, "Skip"); assert.match(n.reasons[0], /Not a limited company/);
  assert.equal(priorityScore({ ...P, closed: "permanent" }, "eligible", { type: "ltd", status: "active" }).tier, "Skip");
  assert.equal(priorityScore({ ...P, closed: "temporary" }, "eligible", { type: "ltd", status: "active" }).score, 55);
});
test("ranking: reviews and ratings move the score sensibly", () => {
  const base = { website: null, phone: null, emails: [], closed: null };
  assert.equal(priorityScore({ ...base, rating: null, reviews: 0 }, "eligible", { type: "ltd", status: "active" }).score, 30);
  assert.equal(priorityScore({ ...base, rating: 4.8, reviews: 900 }, "eligible", { type: "ltd", status: "active" }).score, 39);
  assert.equal(priorityScore({ ...base, rating: 2.5, reviews: 20 }, "eligible", { type: "ltd", status: "active" }).score, 44);
});

import { tidyName } from "../lib/apifyMath.ts";
test("all-capitals company names are tidied, mixed case is left alone", () => {
  assert.equal(tidyName("BRIGHT PLUMBING & HEATING LTD"), "Bright Plumbing & Heating Ltd");
  assert.equal(tidyName("CREAM (UK) LIMITED"), "Cream (UK) Limited");
  assert.equal(tidyName("McDonald's Roofing"), "McDonald's Roofing");
  assert.equal(tidyName("123"), "123");
});
