import test from "node:test";
import assert from "node:assert/strict";
import { parseSourcerForm, chLimit, mapsPlaces, mapsStars, mapsWebsite, hasSizeFilter } from "../lib/sourcerFilters.ts";
import { mergeRows, applyFilters, splitForAdd } from "../lib/sourcerMerge.ts";

const form = (o) => (k) => (k in o ? o[k] : null);
const BASE = { src_ch: "on", niche: "roofing", location: "Leeds" };

test("the form needs a source, a niche and a place", () => {
  assert.equal(parseSourcerForm(form({ niche: "x", location: "y" })).ok, false);
  assert.match(parseSourcerForm(form({ src_ch: "on", location: "y" })).error, /niche/);
  assert.match(parseSourcerForm(form({ src_ch: "on", niche: "x" })).error, /town or area/);
  assert.equal(parseSourcerForm(form(BASE)).ok, true);
});

test("choices are read safely: only the offered values count", () => {
  const f = parseSourcerForm(form({ ...BASE, src_maps: "on", revMin: "100000", revMax: "99", empMin: "5", website: "has", rating: "lt4", reviewsMin: "25", limit: "7", types: "all", includeUnknown: "on" })).filters;
  assert.equal(f.revMin, 100000); assert.equal(f.revMax, null); assert.equal(f.empMin, 5); assert.equal(f.website, "has"); assert.equal(f.rating, "lt4");
  assert.equal(f.reviewsMin, 25); assert.equal(f.limit, 50); assert.equal(f.types, "all"); assert.equal(f.includeUnknown, true); assert.deepEqual(f.sources, ["ch", "maps"]);
  const junk = parseSourcerForm(form({ ...BASE, website: "<script>", rating: "9", types: "x", limit: "1e9" })).filters;
  assert.equal(junk.website, "any"); assert.equal(junk.rating, "any"); assert.equal(junk.types, "limited"); assert.equal(junk.limit, 50);
});

test("impossible ranges are refused", () => {
  assert.match(parseSourcerForm(form({ ...BASE, revMin: "500000", revMax: "250000" })).error, /revenue/);
  assert.match(parseSourcerForm(form({ ...BASE, empMin: "25", empMax: "10" })).error, /employees/);
});

test("a size filter over-fetches from Companies House, and paid places are capped at 50", () => {
  const plain = parseSourcerForm(form(BASE)).filters, sized = parseSourcerForm(form({ ...BASE, revMin: "100000", limit: "50" })).filters;
  assert.equal(hasSizeFilter(plain), false); assert.equal(chLimit(plain), 50); assert.equal(hasSizeFilter(sized), true); assert.equal(chLimit(sized), 100);
  assert.equal(chLimit(parseSourcerForm(form({ ...BASE, empMin: "5", limit: "100" })).filters), 100);
  assert.equal(mapsPlaces(parseSourcerForm(form({ ...BASE, limit: "100" })).filters), 50);
});

test("filters map onto what Google Maps can do itself", () => {
  const f = (o) => parseSourcerForm(form({ ...BASE, ...o })).filters;
  assert.equal(mapsWebsite(f({ website: "has" })), "withWebsite"); assert.equal(mapsWebsite(f({ website: "none" })), "withoutWebsite"); assert.equal(mapsWebsite(f({})), "allPlaces");
  assert.equal(mapsStars(f({ rating: "4" })), "four"); assert.equal(mapsStars(f({ rating: "45" })), "fourAndHalf"); assert.equal(mapsStars(f({ rating: "lt4" })), "");
});

const TODAY = "2026-10-16";
const ch = (n, o = {}) => ({ number: n, name: `ACME ${n} LTD`, postcode: "LS1 4DJ", address: "1 High St", type: "ltd", status: "active", fit: 60, notes: null, est: 150000, employees: 8, incorporatedOn: "2015-01-01", skip: null, added: false, ...o });
const mp = (id, o = {}) => ({ placeId: id, title: `Place ${id}`, address: null, city: "Leeds", postcode: "LS1 4DJ", phone: "0113 000", website: "https://x.co.uk", domain: "x.co.uk", rating: 4.2, reviews: 40, categories: ["Roofer"], mapsUrl: null, emails: [], closed: null, chNumber: null, chName: null, chType: null, chStatus: null, eligible: "unmatched", skip: null, added: false, ...o });

test("a Maps result matched to a Companies House company joins its row; others stand alone", () => {
  const rows = mergeRows([ch("1"), ch("2")], [mp("p1", { chNumber: "1", chName: "ACME 1 LTD", chType: "ltd", chStatus: "active", eligible: "eligible" }), mp("p2"), mp("p3", { closed: "permanent" })], TODAY);
  assert.equal(rows.length, 3);
  const both = rows.find((r) => r.chNumber === "1");
  assert.deepEqual(both.sources, ["ch", "maps"]); assert.equal(both.phone, "0113 000"); assert.equal(both.fit, 60); assert.equal(both.name, "Acme 1 Ltd"); assert.equal(both.eligible, "eligible");
  assert.deepEqual(rows.find((r) => r.key === "m:p2").sources, ["maps"]); assert.equal(rows.find((r) => r.key === "m:p2").eligible, "unmatched");
  assert.equal(rows.find((r) => r.key === "c:2").phone, null);
  assert.ok(!rows.some((r) => r.mapsPlaceId === "p3"));
});

test("already-added or suppressed flags survive the merge", () => {
  const rows = mergeRows([ch("1", { skip: "Already in the CRM" })], [mp("p1", { chNumber: "1", eligible: "eligible", added: true })], TODAY);
  assert.equal(rows[0].skip, "Already in the CRM"); assert.equal(rows[0].added, true);
});

const cq = (loc, o = {}) => ({ id: Number(loc.replace(/\D/g, "")) || 1, locationId: loc, name: `Practice ${loc}`, provider: "SMILE GROUP LTD", address: null, postcode: "LS2 7AA", phone: null, website: null, domain: null,
  serviceTypes: ["Dental service"], localAuthority: "Leeds", chNumber: null, chName: null, chType: null, chStatus: null, eligible: "unmatched", skip: null, added: false, ...o });
const SAME_CO = { chNumber: "00244415", chName: "SMILE GROUP LTD", chType: "ltd", chStatus: "active", eligible: "eligible" };

test("two Google Maps branches of one company merge into one Maps row, never claiming Companies House (Leeds dental, 18 Nov 2026)", () => {
  // The Companies House part of the search failed, so no row came from it. Two branches of one group were matched to the same number, and a CQC location too.
  const rows = mergeRows([], [mp("p1", { ...SAME_CO, phone: null }), mp("p2", { ...SAME_CO, phone: "0113 222", website: "https://other.co.uk", domain: "other.co.uk" })], TODAY, [cq("1-1", SAME_CO), cq("1-2")]);
  const group = rows.filter((r) => r.chNumber === "00244415");
  assert.equal(group.length, 1);
  assert.deepEqual(group[0].sources, ["maps", "cqc"]);
  assert.equal(group[0].key, "m:p1"); assert.equal(group[0].mapsPlaceId, "p1");
  assert.equal(group[0].phone, "0113 222");            // a gap filled from the other branch
  assert.equal(group[0].domain, "x.co.uk");            // what the first branch had is kept
  const { ch: viaCh, others } = splitForAdd(rows);
  assert.equal(viaCh.length, 0, "nothing may be sent to the Companies House add when that search found nothing");
  assert.equal(others.length, rows.length);
});

test("a second Maps place for a Companies House company fills gaps only, and the row still adds through Companies House", () => {
  const rows = mergeRows([ch("1")], [mp("p1", { chNumber: "1", eligible: "eligible", phone: null }), mp("p2", { chNumber: "1", eligible: "eligible", phone: "0113 999", domain: "two.co.uk" })], TODAY);
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0].sources, ["ch", "maps"]); assert.equal(rows[0].mapsPlaceId, "p1"); assert.equal(rows[0].phone, "0113 999"); assert.equal(rows[0].domain, "x.co.uk");
  assert.deepEqual(splitForAdd(rows).ch.map((r) => r.key), ["c:1"]);
});

const F = (o) => parseSourcerForm(form({ ...BASE, src_maps: "on", ...o })).filters;
const SET = () => mergeRows([ch("1", { est: 300000, employees: 12 }), ch("2", { est: 80000, employees: 3, incorporatedOn: "2025-06-01" }), ch("3", { est: null, employees: null })],
  [mp("p9", { chNumber: "1", eligible: "eligible", rating: 3.6, reviews: 12 }), mp("p8", { rating: 4.9, reviews: 200 })], TODAY);

test("limited-company filter drops sole traders and tells you why", () => {
  const { kept, dropped } = applyFilters(SET(), F({}));
  assert.equal(kept.length, 3); assert.equal(Object.values(dropped).reduce((a, b) => a + b, 0), 1);
  assert.match(Object.keys(dropped)[0], /not matched to a limited company/);
  assert.equal(applyFilters(SET(), F({ types: "all" })).kept.length, 4);
});

test("revenue and employee ranges, with unknowns kept only if you say so", () => {
  const strict = applyFilters(SET(), F({ revMin: "100000" }));
  assert.deepEqual(strict.kept.map((r) => r.key), ["c:1"]);
  assert.equal(strict.dropped["revenue outside your range"], 1); assert.equal(strict.dropped["revenue unknown"], 1);
  const loose = applyFilters(SET(), F({ revMin: "100000", includeUnknown: "on" }));
  assert.deepEqual(loose.kept.map((r) => r.key).sort(), ["c:1", "c:3"]);
  assert.deepEqual(applyFilters(SET(), F({ empMin: "10" })).kept.map((r) => r.key), ["c:1"]);
  assert.deepEqual(applyFilters(SET(), F({ revMin: "50000", revMax: "250000", includeUnknown: "on" })).kept.map((r) => r.key).sort(), ["c:2", "c:3"]);
});

test("company age uses the incorporation date", () => {
  assert.deepEqual(applyFilters(SET(), F({ ageMin: "5" })).kept.map((r) => r.key), ["c:1", "c:3"]);   // company 2 was incorporated last year
});

test("rating, reviews and website filters use Google Maps data, and unknowns follow the same rule", () => {
  assert.deepEqual(applyFilters(SET(), F({ rating: "lt4", types: "all" })).kept.map((r) => r.key), ["c:1"]);
  assert.deepEqual(applyFilters(SET(), F({ rating: "45", types: "all" })).kept.map((r) => r.key), ["m:p8"]);
  assert.deepEqual(applyFilters(SET(), F({ reviewsMin: "100", types: "all" })).kept.map((r) => r.key), ["m:p8"]);
  assert.deepEqual(applyFilters(SET(), F({ website: "has", types: "all", includeUnknown: "on" })).kept.map((r) => r.key).sort(), ["c:1", "c:2", "c:3", "m:p8"]);
  assert.deepEqual(applyFilters(SET(), F({ website: "has", types: "all" })).kept.map((r) => r.key).sort(), ["c:1", "m:p8"]);
});
