import test from "node:test";
import assert from "node:assert/strict";
import { rankCandidates, startsTicked, searchLinks, trust } from "../lib/findRank.ts";

const c = (name, status, address, number = "01234567", type = "ltd") => ({ number, name, type, status, address });

test("an exact, active, same-area match is the best and gets reasons", () => {
  const r = rankCandidates("Bright Plumbing & Heating", "LS1 4DJ", [c("BRIGHT PLUMBING AND HEATING LIMITED", "active", "1 High St, Leeds, LS1 4DJ", "1"), c("Bright Plumbing Services Ltd", "active", "Leeds LS1 4DJ", "2")]);
  assert.equal(r.best.candidate.number, "1"); assert.ok(r.best.why.includes("name matches exactly")); assert.ok(r.best.why.some((w) => /same postcode area/.test(w)));
  assert.equal(r.ranked[0].candidate.number, "1"); assert.equal(r.best.eligible, true);
});

test("close but not exact names are listed to choose from, never picked", () => {
  const r = rankCandidates("Bright Plumbing", "", [c("Bright Plumbing Services Ltd", "active", "Leeds", "2"), c("Brightside Plumbing Ltd", "active", "Hull", "3")]);
  assert.equal(r.best, null); assert.equal(r.ranked.length, 2); assert.equal(r.ranked[0].candidate.number, "2");
  assert.ok(r.ranked[0].why.some((w) => /words match/.test(w)));
});

test("two equally good exact names: no guess, unless the place settles it", () => {
  const two = [c("Acme Ltd", "active", "London E1 1AA", "1"), c("ACME LIMITED", "active", "Bristol BS1 1AA", "2")];
  assert.equal(rankCandidates("Acme", "", two).best, null);
  assert.equal(rankCandidates("Acme", "BS1 1AA", two).best.candidate.number, "2");
  assert.equal(rankCandidates("Acme", "Bristol", two).best.candidate.number, "2");
});

test("an active exact name beats a dissolved one, and a dissolved-only match is found but not eligible", () => {
  const r = rankCandidates("Acme", "", [c("Acme Ltd", "dissolved", "x", "1"), c("Acme Limited", "active", "y", "2")]);
  assert.equal(r.best.candidate.number, "2");
  const d = rankCandidates("Acme", "", [c("Acme Ltd", "dissolved", "x", "1")]);
  assert.equal(d.best.candidate.number, "1"); assert.equal(d.best.eligible, false);
});

test("a sole trader that isn't on the register gives no match", () => {
  const r = rankCandidates("Dave's Digital Marketing", "BS3 1AA", [c("Davenport Holdings Ltd", "active", "Leeds", "9")]);
  assert.equal(r.best, null);
  assert.deepEqual(rankCandidates("Anything", "", []), { ranked: [], best: null });
});

test("only well-supported links start ticked", () => {
  assert.equal(startsTicked(trust.given().confidence), true); assert.equal(startsTicked(trust.verifiedByNumber().confidence), true);
  assert.equal(startsTicked(trust.verifiedByName().confidence), true); assert.equal(startsTicked(trust.linkedFromSite().confidence), true);
  assert.equal(startsTicked(trust.fromSearch(null).confidence), false); assert.equal(startsTicked(trust.fromSearch("name").confidence), true);
  assert.match(trust.fromSearch(null).how, /check it/);
});

test("manual search links are properly encoded", () => {
  const l = searchLinks("Smith & Sons", "Leeds");
  assert.equal(l.length, 5); assert.ok(l[4].href.includes("site%3Atiktok.com")); assert.ok(l[0].href.includes("Smith%20%26%20Sons%20Leeds")); assert.ok(l[1].href.includes("site%3Alinkedin.com%2Fcompany"));
});
