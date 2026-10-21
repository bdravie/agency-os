import test from "node:test";
import assert from "node:assert/strict";
import { normaliseMethod, methodHref } from "../lib/contactMethods.ts";
import { nameWords, domainBases, socialCandidates } from "../lib/siteLinks.ts";

test("TikTok: account addresses and @handles are kept, videos and other sites refused", () => {
  assert.equal(normaliseMethod("tiktok", "https://www.tiktok.com/@acme.uk?lang=en").value, "https://www.tiktok.com/@acme.uk");
  assert.equal(normaliseMethod("tiktok", "@acmeroofing").value, "https://www.tiktok.com/@acmeroofing");
  assert.ok(normaliseMethod("tiktok", "https://www.tiktok.com/@acme/video/123").value);   // the account is kept, the video part dropped
  assert.equal(normaliseMethod("tiktok", "https://www.tiktok.com/@acme/video/123").value, "https://www.tiktok.com/@acme");
  assert.ok(normaliseMethod("tiktok", "https://www.tiktok.com/tag/roofing").error);
  assert.ok(normaliseMethod("tiktok", "https://instagram.com/acme").error);
});
test("YouTube and X accept accounts and refuse videos and share links", () => {
  assert.equal(normaliseMethod("youtube", "youtube.com/@AcmeRoofing").value, "https://www.youtube.com/@AcmeRoofing");
  assert.equal(normaliseMethod("youtube", "https://www.youtube.com/channel/UC123abc").value, "https://www.youtube.com/channel/UC123abc");
  assert.ok(normaliseMethod("youtube", "https://www.youtube.com/watch?v=abc").error);
  assert.equal(normaliseMethod("x", "https://twitter.com/acme_ltd").value, "https://x.com/acme_ltd");
  assert.ok(normaliseMethod("x", "https://x.com/intent/tweet").error);
});
test("a secondary email must be a generic company inbox; phones need real digits", () => {
  assert.equal(normaliseMethod("email_secondary", "Sales@Acme.co.uk").value, "sales@acme.co.uk");
  assert.ok(normaliseMethod("email_secondary", "sam.taylor@acme.co.uk").error);
  assert.equal(normaliseMethod("phone_secondary", "020 7946 0000").value, "020 7946 0000");
  assert.ok(normaliseMethod("whatsapp", "call me").error);
  assert.ok(normaliseMethod("tiktok", "").error); assert.ok(normaliseMethod("nope", "x").error);
});
test("other web addresses must be plain http(s) with no login in them", () => {
  assert.ok(normaliseMethod("other", "https://user:pass@acme.com").error);
  assert.ok(normaliseMethod("other", "javascript:alert(1)").error);
  assert.equal(normaliseMethod("social_other", "https://www.threads.net/@acme").value, "https://www.threads.net/@acme");
});
test("links: email and phone get mailto and tel", () => {
  assert.equal(methodHref("email_secondary", "a@b.co"), "mailto:a@b.co"); assert.equal(methodHref("whatsapp", "+44 7700 900123"), "tel:+447700900123"); assert.equal(methodHref("tiktok", "https://x"), "https://x");
});

test("apostrophes no longer split a company name, so Women's finds womens", () => {
  assert.deepEqual(nameWords("London Women's Clinic Limited"), ["london", "womens", "clinic"]);
  assert.ok(domainBases("London Women's Clinic Limited").includes("londonwomensclinic"));
  assert.deepEqual(domainBases("AB"), []);
});
test("social pages are found in links, JSON-LD sameAs lists and escaped scripts", () => {
  const html = `<a href="https://www.instagram.com/p/XYZ/">post</a><a href='https://www.instagram.com/acme/'>ig</a>
    <script type="application/ld+json">{"sameAs":["https:\\/\\/www.tiktok.com\\/@acme","https://www.facebook.com/AcmeUK"]}</script><a href="//twitter.com/acme">x</a>
    <a href="https://example.com/instagram.com/fake">no</a>`;
  const c = socialCandidates(html);
  assert.equal(c.instagram.length, 2); assert.ok(c.tiktok[0].endsWith("/@acme")); assert.ok(c.facebook[0].includes("AcmeUK")); assert.ok(c.x[0].includes("twitter.com/acme"));
});

import { pageNamesCompany, decodeEntities } from "../lib/siteLinks.ts";
test("a page proves it is the company even when the name is only in the title, meta tags or JSON-LD, with encoded apostrophes", () => {
  const html = `<html><head><title>World Class Fertility | London Women&#39;s Clinic</title><meta property="og:site_name" content="London Women's Clinic">
    <script type="application/ld+json">{"legalName":"London Women's Clinic Ltd"}</script><script>var x="nothing here"</script></head><body><p>Welcome</p></body></html>`;
  assert.equal(pageNamesCompany(html, "London Women's Clinic Limited"), true);
  assert.equal(pageNamesCompany(`<p>Smith &amp; Sons Roofing</p>`, "Smith & Sons Roofing Ltd"), true);
  assert.equal(pageNamesCompany(`<title>London Clinic</title>`, "London Women's Clinic Limited"), false);
  assert.equal(pageNamesCompany(`<script>var n="london womens clinic"</script><p>hi</p>`, "London Women's Clinic Limited"), false);   // scripts that aren't JSON-LD don't count
  assert.equal(decodeEntities("Women&#39;s &rsquo;"), "Women's '");
});

test("a name with 'and' also tries the 'and' spelling, and the 'and' is kept only for those variants", () => {
  const b = domainBases("FHA Building and Roofing Limited");
  assert.ok(b.includes("fhabuildingandroofing") && b.includes("fhabuildingroofing") && b.includes("fha-building-and-roofing"));
  assert.deepEqual(nameWords("FHA Building & Roofing Ltd"), ["fha", "building", "roofing"]);
});

import { socialSearchQuery } from "../lib/siteLinks.ts";
test("the social search names the platforms and keeps the name in quotes", () => {
  assert.equal(socialSearchQuery("Fha Building And Roofing Ltd", "BB1"), '"Fha Building And Roofing Ltd" BB1 instagram tiktok facebook');
  assert.equal(socialSearchQuery('A "B" Ltd', ""), '"A B Ltd" instagram tiktok facebook');
});
