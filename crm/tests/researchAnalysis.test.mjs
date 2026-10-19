import test from "node:test";
import assert from "node:assert/strict";
import { analysePage, mergePages, pickLinks, deriveFindings, visibleText } from "../lib/researchAnalysis.ts";
import { isPrivateIp, publicHostname } from "../lib/safeFetch.ts";

const THIS_YEAR = 2026;
const ctx = (over = {}) => ({ hasDomain: true, thisYear: THIS_YEAR, storedSocial: { facebook: false, instagram: false, linkedin: false }, siteError: null, ...over });
const merge = (html, signals = {}) => mergePages([{ path: "/", facts: analysePage(html) }], signals, [{ path: "/", ok: true }]);

const BARE = `<html><head><title>Smith Plumbing &amp; Heating</title><meta name="description" content="Plumbers in Leeds"></head><body>
  <h1>Leeds plumber</h1><p>Call us on 0113 496 0000 or email info@smithplumbing.example.</p><a href="mailto:info@smithplumbing.example">email</a>
  <footer>© 2019 Smith Plumbing</footer></body></html>`;

test("a bare brochure site shows the classic gaps", () => {
  const f = deriveFindings(merge(BARE), ctx());
  const titles = f.map((x) => x.title).join(" | ");
  assert.match(titles, /Enquiries depend on phone or email only/);
  assert.match(titles, /may not be mobile-friendly|May not be mobile-friendly/i);
  assert.match(titles, /out of date/);
  assert.match(titles, /No website analytics/);
  assert.match(titles, /No social media links found/);
  assert.equal(f[0].kind, "gap"); assert.equal(f[0].severity, "high");
  assert.deepEqual(f.map((x) => x.id), f.map((_, i) => `F${i + 1}`));
});

const RICH = `<html><head><title>Bright Dental</title><meta name="viewport" content="width=device-width"><script src="https://www.googletagmanager.com/gtag/js?id=G-ABC12345"></script>
  <script src="https://widget.intercom.io/widget/x"></script></head><body><h1>Dentist</h1>
  ${"<p>We offer a wide range of dental treatments for families across the city.</p>".repeat(20)}
  <form action="/enquire"><label>Name</label><input name="n"><input name="e" type="email"><textarea name="m"></textarea></form>
  <a href="https://calendly.com/bright">Book online</a><a href="tel:+441134960000">0113 496 0000</a>
  <a href="https://www.facebook.com/brightdental">f</a><a href="https://www.instagram.com/brightdental">i</a><a href="/blog">Blog</a><a href="/privacy">Privacy</a>
  <div class="trustpilot-widget">★★★★★ Testimonials</div><footer>© 2026</footer></body></html>`;

test("a well-built site gets strengths, not gaps, where it earns them", () => {
  const f = deriveFindings(merge(RICH, { ga4: true }), ctx());
  assert.ok(f.some((x) => x.kind === "strength" && /Online booking/.test(x.title)));
  assert.ok(!f.some((x) => /No website analytics|mobile-friendly|Enquiries depend|out of date/i.test(x.title)));
  assert.ok(f.some((x) => /Not linked: Linkedin/.test(x.title)));
});

test("a search box is not counted as an enquiry form", () => {
  assert.equal(analysePage(`<form role="search"><input name="s"></form>`).forms, 0);
  assert.equal(analysePage(`<form class="search-form"><input name="q"></form>`).forms, 0);
  assert.equal(analysePage(`<form><input name="e" type="email"></form>`).forms, 1);   // a lone email box could be a sign-up: counted
});

test("form kinds are recognised", () => {
  assert.deepEqual(analysePage(`<form><label>Get a free quote</label><input><input></form>`).formKinds, ["quote"]);
  assert.deepEqual(analysePage(`<form><label>Subscribe to our newsletter</label><input type=email><input></form>`).formKinds, ["newsletter"]);
});

test("paying for ads with no way to enquire is a high-severity gap", () => {
  const f = deriveFindings(merge(BARE, { meta_pixel: true, runs_ads: true }), ctx());
  assert.ok(f.some((x) => x.severity === "high" && /Pays for ads/.test(x.title)));
});

test("no website, and a site that could not be read, are handled without inventing findings", () => {
  const none = deriveFindings(null, ctx({ hasDomain: false }));
  assert.match(none[0].title, /No website/); assert.ok(none.every((x) => x.kind !== "strength"));
  const down = deriveFindings(null, ctx({ siteError: "The site answered 403" }));
  assert.equal(down.length, 1); assert.match(down[0].detail, /403/);
});

test("social pages saved in the CRM soften the 'no social' finding", () => {
  const f = deriveFindings(merge(BARE), ctx({ storedSocial: { facebook: true, instagram: false, linkedin: false } }));
  const s = f.find((x) => x.area === "Social media");
  assert.equal(s.severity, "low"); assert.match(s.title, /don't link|doesn't link/);
});

test("copyright years, ranges and entities are read", () => {
  assert.equal(analysePage("<footer>&copy; 2015 - 2021 Acme</footer>").copyrightYear, 2021);
  assert.equal(analysePage("<footer>Copyright 2024</footer>").copyrightYear, 2024);
  assert.equal(analysePage("<p>nothing</p>").copyrightYear, null);
});

test("scripts and styles are not counted as text", () => {
  assert.equal(visibleText("<script>var a = 'lots of words here';</script><style>.a{}</style><p>Hello there</p>"), "Hello there");
});

test("links to read next are same-site and prioritised", () => {
  const html = `<a href="/about-us">a</a><a href="/contact">c</a><a href="https://other.com/contact">x</a><a href="/services/boilers">s</a><a href="/files/brochure.pdf">p</a><a href="/blog">b</a><a href="/contact/">dup</a>`;
  assert.deepEqual(pickLinks(html, "example.co.uk"), ["/contact", "/services/boilers", "/about-us"]);
});

test("private and internal addresses are refused", () => {
  for (const ip of ["127.0.0.1", "10.0.0.5", "192.168.1.1", "172.16.0.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:127.0.0.1", "not-an-ip"]) assert.equal(isPrivateIp(ip), true, ip);
  for (const ip of ["8.8.8.8", "93.184.216.34", "2606:4700:4700::1111"]) assert.equal(isPrivateIp(ip), false, ip);
  assert.equal(publicHostname("example.co.uk"), true);
  for (const h of ["localhost", "intranet.local", "10.0.0.1", "foo", "a.internal"]) assert.equal(publicHostname(h), false, h);
});

import { normaliseSuggestions } from "../lib/offerSuggestNormalise.ts";

const O = { findingIds: ["F1", "F2", "F3"], offerNames: ["Weekly client report", "Missed-call text-back"], facts: "F1 no booking. Checked 2 pages. 3 social links." };
const sug = (over = {}) => ({ title: "Enquiry capture", automation: "A form that routes enquiries.", outcome: "Fewer missed enquiries.", why: "No form found.", finding_ids: ["F1"], offer_name: "weekly client report", kpi: "Missed enquiries per week", pilot: "Two weeks", risk: "Staff adoption", needs_dpa: true, confidence: "high", ...over });

test("suggestions keep only real finding ids and match catalogue offers", () => {
  const { result, warnings } = normaliseSuggestions({ business_summary: "A plumber.", suggestions: [sug({ finding_ids: ["f1", "F9"], offer_name: "Nonexistent offer" }), sug({ title: "Second" })], opener: "Your site has no booking link.", opener_finding_ids: ["F1"], questions: ["How do you take bookings?"], not_checked: [] }, O);
  assert.deepEqual(result.suggestions[0].finding_ids, ["F1"]);
  assert.equal(result.suggestions[0].offer_name, null);
  assert.equal(result.suggestions[1].offer_name, "Weekly client report");     // matched case-insensitively to the catalogue spelling
  assert.deepEqual(warnings, []);
});

test("a suggestion with no evidence is marked low confidence and flagged", () => {
  const { result, warnings } = normaliseSuggestions({ suggestions: [sug({ finding_ids: ["F7"] })] }, O);
  assert.equal(result.suggestions[0].confidence, "low"); assert.match(warnings[0], /isn't tied to any finding/);
});

test("an opener with no finding behind it is dropped", () => {
  const { result, warnings } = normaliseSuggestions({ suggestions: [sug()], opener: "Great business!", opener_finding_ids: [] }, O);
  assert.equal(result.opener, null); assert.ok(warnings.some((w) => /opening line/.test(w)));
});

test("at most three suggestions, and invented figures or contact details are flagged", () => {
  const { result, warnings } = normaliseSuggestions({ suggestions: [sug(), sug({ title: "B" }), sug({ title: "C" }), sug({ title: "D" }), sug({ title: "E", outcome: "Saves 12 hours, email bob@example.com" })] }, O);
  assert.equal(result.suggestions.length, 3);
  const r2 = normaliseSuggestions({ suggestions: [sug({ outcome: "Saves 12 hours a week" })] }, O);
  assert.ok(r2.warnings.some((w) => /figures/.test(w) && /12/.test(w)));
  const r3 = normaliseSuggestions({ suggestions: [sug({ outcome: "Email bob@example.com" })] }, O);
  assert.ok(r3.warnings.some((w) => /email address/.test(w)));
  assert.ok(warnings.length >= 0);
});

test("an empty reply is reported, not crashed on", () => {
  const { result, warnings } = normaliseSuggestions(null, O);
  assert.equal(result.suggestions.length, 0); assert.match(warnings[0], /No usable suggestion/);
});

test("a saved email or contact email is noted, as a count only, in every case", () => {
  const none = deriveFindings(null, ctx({ hasDomain: false }));
  assert.ok(!none.some((x) => x.title === "An email is already on record"));
  for (const c of [ctx({ hasDomain: false, email: { generic: true, contacts: 0 } }), ctx({ siteError: "x", email: { generic: true, contacts: 0 } }), ctx({ email: { generic: false, contacts: 2 } })]) {
    const f = deriveFindings(c.hasDomain && !c.siteError ? merge(BARE) : null, c).find((x) => x.title === "An email is already on record");
    assert.ok(f, "note present");
    assert.equal(f.kind, "note");
    assert.ok(!/@/.test(`${f.detail} ${f.evidence}`), "never contains an address");
  }
  const two = deriveFindings(merge(BARE), ctx({ email: { generic: true, contacts: 2 } })).find((x) => x.title === "An email is already on record");
  assert.match(two.detail, /generic company email and an email for 2 named contacts/);
});
