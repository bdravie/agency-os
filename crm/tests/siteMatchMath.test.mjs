import test from "node:test";
import assert from "node:assert/strict";
import { companyNumbersIn, mapsFoundBy, pageText, sameBusiness } from "../lib/siteMatchMath.ts";
import { gapUpdates, reachable } from "../lib/fillGapsMath.ts";

test("company numbers are read from the usual footer wordings", () => {
  assert.deepEqual(companyNumbersIn("<footer>Smile Studio is a trading name of ABC Holdings Ltd. Registered in England and Wales No. 1234567.</footer>"), ["01234567"]);
  assert.deepEqual(companyNumbersIn("<p>Company No: 09876543 | VAT No: 123456789</p>"), ["09876543"]);
  assert.deepEqual(companyNumbersIn("<p>Company registration number&nbsp;<b>SC123456</b></p>"), ["SC123456"]);
  assert.deepEqual(companyNumbersIn("<p>Registered in England &amp; Wales under company number 11223344</p>"), ["11223344"]);
  assert.deepEqual(companyNumbersIn("<p>Reg. No. 7654321</p>"), ["07654321"]);
  assert.deepEqual(companyNumbersIn("Registered office: 1 High St. Company number 12345678. Company No 12345678"), ["12345678"]);
});

test("phone numbers, VAT numbers, prices and scripts are not company numbers", () => {
  assert.deepEqual(companyNumbersIn("<p>Call 0113 496 0000 or 07700 900123. VAT reg 123 4567 89. From £1200000.</p>"), []);
  assert.deepEqual(companyNumbersIn(`<script>var company_no = "12345678";</script><p>Hello</p>`), []);
  assert.deepEqual(companyNumbersIn("<p>Company number 00000000</p>"), []);
  assert.equal(pageText("<style>.a{}</style><p>a&nbsp;b</p>").trim(), "a b");
});

test("a site's number is only used when it plausibly is the same business", () => {
  const place = { title: "Smile Studio Leeds", postcode: "LS1 4DJ", domain: "smilestudioleeds.co.uk" };
  assert.equal(sameBusiness({ name: "SMILE STUDIO (LEEDS) LIMITED", address: "5 Park Row, Bradford, BD1 1AA", sic: [] }, place, ["86230"]).ok, true);
  assert.match(sameBusiness({ name: "ABC Holdings Ltd", address: "2 Wellington St, Leeds, LS1 2AB", sic: [] }, place, []).why, /LS1/);
  assert.match(sameBusiness({ name: "ABC Holdings Ltd", address: "Accountants House, York, YO1 7HH", sic: ["86230"] }, place, ["86230"]).why, /86230/);
  const web = sameBusiness({ name: "Pixel Web Design Ltd", address: "Unit 3, Manchester, M1 1AA", sic: ["62012"] }, place, ["86230"]);
  assert.equal(web.ok, false);
  // generic words ("dental", "clinic", "holdings") never count as shared
  assert.equal(sameBusiness({ name: "Dental Holdings Ltd", address: null, sic: [] }, { title: "Bright Dental Clinic", postcode: null, domain: null }, []).ok, false);
});

test("which step found each Maps detail", () => {
  assert.deepEqual(mapsFoundBy({ domain: "a.co.uk", phone: "0113", emails: ["info@a.co.uk"], socials: { instagram: "x", facebook: "y" }, ch_number: "01234567", match: "website",
    site_read: { emails: 1, socials: ["instagram"], contact_url: "https://a.co.uk/contact" } }),
    { website: "google maps", phone: "google maps", email: "website", instagram: "website", facebook: "apify", contact_page: "website", company_number: "website" });
  assert.deepEqual(mapsFoundBy({ emails: ["info@a.co.uk"], ch_number: "1", match: "exact" }), { email: "apify", company_number: "name match" });
});

test("fill in the gaps only fills empty fields and records the step", () => {
  const r = gapUpdates({ domain: "a.co.uk", generic_email: "", instagram_url: "https://instagram.com/mine" },
    { domain: "b.co.uk", generic_email: "info@a.co.uk", instagram_url: "https://instagram.com/other", contact_url: "https://a.co.uk/contact" },
    { domain: "website guess", generic_email: "website", instagram_url: "website", contact_url: "website" });
  assert.deepEqual(r.set, { generic_email: "info@a.co.uk", contact_url: "https://a.co.uk/contact" });
  assert.deepEqual(r.labels, ["email", "contact page"]);
  assert.deepEqual(r.foundBy, { email: "website", contact_page: "website" });
  assert.equal(reachable({ domain: "a.co.uk" }), false);
  assert.equal(reachable({ contact_url: "https://a.co.uk/contact" }), true);
});

test("Maps names lose Google's advertising text before matching", async () => {
  const { cleanMapsTitle } = await import("../lib/apifyMath.ts");
  assert.equal(cleanMapsTitle("Skin Clinix | Chorlton Skin & Aesthetic Clinic"), "Skin Clinix");
  assert.equal(cleanMapsTitle("Day One Medical Aesthetics Clinic - Dr Emily Swift"), "Day One Medical Aesthetics Clinic");
  assert.equal(cleanMapsTitle("Antoinette Hamilton Aesthetics | Nurse-led clinic"), "Antoinette Hamilton Aesthetics");
  assert.equal(cleanMapsTitle("Rawdon Dental Practice (A)"), "Rawdon Dental Practice");
  assert.equal(cleanMapsTitle("Day-One Dental"), "Day-One Dental");
  assert.equal(cleanMapsTitle("Smile – Leeds"), "Smile");
  assert.equal(cleanMapsTitle("| Leeds Dental"), "| Leeds Dental");
});
