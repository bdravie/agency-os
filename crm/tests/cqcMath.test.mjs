import test from "node:test";
import assert from "node:assert/strict";
import { cqcDomain, cqcPhone, fileDate, findDirectoryUrl, fitsNiche, inArea, isLimitedProvider, parseDirectory, readCqcConfig } from "../lib/cqcMath.ts";
import { mergeRows, applyFilters } from "../lib/sourcerMerge.ts";
import { readSearchFirst } from "../lib/sourcerFilters.ts";

// The real file's shape (4 Nov 2026): four lines of preamble, then the header. Rows are made up.
const CSV = `CQC Locations data,,,,,,,,,,,,,,
,,,,,,,,,,,,,,
This data was produced on 04 November 2026,,,,,,,,,,,,,,
,,,,,,,,,,,,,,
Name,Also known as,Address,Postcode,Phone number,Service's website (if available),Service types,Date of latest check,Specialisms/services,Provider name,Local authority,Region,Location URL,CQC Location ID (for office use only),CQC Provider ID (for office use only)
Langdale Dental,,"1 Langdale Avenue,Leeds",LS6 3HA,1132751249,,Dentist,18/Aug/2022 - 00:00,Services for everyone,Cooper Dental Limited,Leeds,Yorkshire & Humberside,https://www.cqc.org.uk/location/1-1,1-1,1-9
Smile Studio,,"2 High St,Leeds",LS1 1AA,1130000000,https://www.smilestudio.co.uk/home,Dentist|Diagnosis/screening,,,"Smile Studio Ltd",Leeds,Yorkshire & Humberside,,1-2,1-8
Oaksmere Dental Surgery,,"99 Doncaster Road,Barnsley",S70 1TS,1226207444,,Dentist,,,Oaksmere Dental Surgery Partnership,Barnsley,Yorkshire & Humberside,,1-3,1-7
Dr J Smith,,"3 Low St,Leeds",LS2 2BB,,,Dentist,,,Dr John Smith,Leeds,Yorkshire & Humberside,,1-4,1-6
Meadow Care Home,,"4 Park Rd,Leeds",LS3 3CC,,,Residential homes,,,Meadow Care Limited,Leeds,Yorkshire & Humberside,,1-5,1-5
Big Chain Leeds,,"5 Mill St,Leeds",LS4 4DD,,,Dentist,,,Big Chain Dental Limited,Leeds,Yorkshire & Humberside,,1-6,1-4
Big Chain York,,"6 Mill St,York",YO1 1AA,,,Dentist,,,Big Chain Dental Limited,York,Yorkshire & Humberside,,1-7,1-4
Big Chain Hull,,"7 Mill St,Hull",HU1 1AA,,,Dentist,,,Big Chain Dental Limited,Kingston upon Hull,Yorkshire & Humberside,,1-8,1-4
Glow Skin Clinic,,"8 Kirkgate,Leeds",LS2 7DJ,7700900123,glowskin.co.uk,Doctors/GPs,,,Glow Medical LLP,Leeds,Yorkshire & Humberside,,1-9,1-3
`;

test("the directory is read, and only limited-company providers of the wanted service types are kept", () => {
  const r = parseDirectory(CSV, ["Dentist"]);
  assert.equal(r.read, 9);
  assert.deepEqual(r.missing, []);
  assert.deepEqual(r.kept.map((x) => x.name), ["Langdale Dental", "Smile Studio", "Big Chain Leeds", "Big Chain York", "Big Chain Hull"]);
  const smile = r.kept[1];
  assert.equal(smile.provider_name, "Smile Studio Ltd");
  assert.equal(smile.phone, "01130000000");
  assert.equal(smile.domain, "smilestudio.co.uk");
  assert.deepEqual(smile.service_types, ["Dentist", "Diagnosis/screening"]);
  assert.equal(r.kept[0].provider_locations, 1);
  assert.equal(r.kept[2].provider_locations, 3);
  assert.equal(parseDirectory("a,b\n1,2", ["Dentist"]).missing.length > 0, true);
  assert.equal(fileDate(CSV), "2026-11-04");
});

test("providers, phones, websites and the file link", () => {
  assert.equal(isLimitedProvider("Cooper Dental Limited"), true);
  assert.equal(isLimitedProvider("Glow Medical LLP"), true);
  assert.equal(isLimitedProvider("Oaksmere Dental Surgery Partnership"), false);
  assert.equal(isLimitedProvider("Dr John Smith"), false);
  assert.equal(cqcPhone("1132751249"), "01132751249");
  assert.equal(cqcPhone("01132751249"), "01132751249");
  assert.equal(cqcPhone("+44 113 275 1249"), "01132751249");
  assert.equal(cqcPhone("123"), null);
  assert.equal(cqcDomain("https://www.Smile.co.uk/home"), "smile.co.uk");
  assert.equal(cqcDomain("https://www.facebook.com/smile"), null);
  assert.equal(cqcDomain("not a site"), null);
  const html = `<a href="/system/files/2026-11/04_November_2026_CQC_directory.csv">CQC care directory - csv</a><a href="/x.zip">zip</a>`;
  assert.equal(findDirectoryUrl(html), "https://www.cqc.org.uk/system/files/2026-11/04_November_2026_CQC_directory.csv");
  assert.equal(findDirectoryUrl(`<a href="https://evil.example/CQC_directory.csv">x</a>`), null);
  assert.equal(findDirectoryUrl("<p>nothing</p>"), null);
});

test("area and niche rules", () => {
  const [langdale, smile, chainLeeds] = parseDirectory(CSV, ["Dentist"]).kept;
  assert.equal(inArea(langdale, "Leeds"), true);
  assert.equal(inArea(langdale, "ls6"), true);
  assert.equal(inArea(langdale, "LS 6"), true);
  assert.equal(inArea(langdale, "Yorkshire & Humberside"), true);
  assert.equal(inArea(langdale, "York"), false);
  assert.equal(inArea(langdale, "Avenue"), false);
  const dental = readCqcConfig({ cqc: { service_types: ["Dentist"], max_provider_locations: 2 } });
  assert.deepEqual(dental, { serviceTypes: ["Dentist"], nameMustMatch: false, maxProviderLocations: 2 });
  const none = { include: [], exclude: [], always: [] };
  assert.equal(fitsNiche(smile, dental, none), "ok");
  assert.equal(fitsNiche(chainLeeds, dental, none), "chain");
  const aest = readCqcConfig({ cqc: { service_types: ["Doctors/GPs"], name_must_match: true } });
  const [glow] = parseDirectory(CSV, ["Doctors/GPs"]).kept;
  assert.equal(fitsNiche(glow, aest, { include: ["skin"], exclude: [], always: [] }), "ok");
  assert.equal(fitsNiche({ ...glow, name: "Park Surgery" }, aest, { include: ["skin"], exclude: [], always: [] }), "name");
  assert.equal(fitsNiche(glow, dental, none), "type");
  assert.equal(readCqcConfig({}), null);
  assert.equal(readCqcConfig({ cqc: { service_types: [] } }), null);
  assert.deepEqual(readSearchFirst(["cqc", "maps", "nope"]), ["cqc", "maps"]);
  assert.deepEqual(readSearchFirst("maps"), ["maps"]);
  assert.deepEqual(readSearchFirst(undefined), ["ch"]);
});

test("CQC results join the company found another way, and two practices of one company make one row", () => {
  const q = (id, loc, name, number, extra = {}) => ({ id, locationId: loc, name, provider: "Taheri Limited", address: "1 St, Leeds", postcode: "LS1 1AA", phone: "01130000000", website: null, domain: null,
    serviceTypes: ["Dentist"], localAuthority: "Leeds", chNumber: number, chName: "TAHERI LIMITED", chType: "ltd", chStatus: "active", eligible: number ? "eligible" : "unmatched", skip: null, added: false, ...extra });
  const rows = mergeRows([], [], "2026-11-17", [q(1, "1-1", "Dental Rituals Leeds", "11327134"), q(2, "1-2", "Fleur Dental Leeds", "11327134"), q(3, "1-3", "No Match Dental", null)]);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].name, "Dental Rituals Leeds");
  assert.equal(rows[0].registered, "Taheri Limited");
  assert.deepEqual(rows[0].sources, ["cqc"]);
  assert.equal(rows[0].cqcId, 1);
  assert.equal(rows[1].eligible, "unmatched");
  const ch = [{ number: "11327134", name: "TAHERI LIMITED", postcode: "LS1 1AA", address: null, type: "ltd", status: "active", fit: 50, notes: null, est: null, employees: null, incorporatedOn: null, skip: null, added: false }];
  const both = mergeRows(ch, [], "2026-11-17", [q(1, "1-1", "Dental Rituals Leeds", "11327134", { domain: "rituals.co.uk" })]);
  assert.equal(both.length, 1);
  assert.deepEqual(both[0].sources, ["ch", "cqc"]);
  assert.equal(both[0].domain, "rituals.co.uk");
  assert.equal(both[0].phone, "01130000000");
  // a CQC row with no website is "unknown", not "none", unless Maps says so
  const base = { niche: "dental", location: "Leeds", term: "", sources: ["cqc"], types: "all", revMin: null, revMax: null, empMin: null, empMax: null, ageMin: null, rating: "any", reviewsMin: null, limit: 50, contacts: false };
  assert.equal(applyFilters(rows, { ...base, website: "has", includeUnknown: true }).kept.length, 2);
  assert.deepEqual(applyFilters(rows, { ...base, website: "has", includeUnknown: false }).dropped, { "website unknown": 2 });
});
