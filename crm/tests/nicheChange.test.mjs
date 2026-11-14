import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parse } from "yaml";
import { buildNicheTable } from "../lib/nicheStatus.ts";
import { checkOffer, checkOverrideReason, checkPromise, pickChannels, statusChangeCheck, statusLogText, wordingChanges } from "../lib/nicheChange.ts";
import { applyNicheEdit } from "../lib/nicheYaml.ts";

const table = (statuses) => buildNicheTable(Object.fromEntries(Object.entries(statuses).map(([k, s]) => [k, { status: s, label: k, channels: ["email", "linkedin"] }])));

test("a third active niche is refused outright, even with clients won", () => {
  const t = table({ dental: "active", aesthetics: "active", property: "seeding" });
  const r = statusChangeCheck(t, "property", "active", { dental: 5, aesthetics: 5 });
  assert.ok("refuse" in r && /2 niches are already active/.test(r.refuse));
});

test("a second active niche needs an override until an active one has 2 paying clients", () => {
  const t = table({ dental: "active", property: "seeding" });
  const r = statusChangeCheck(t, "property", "active", { dental: 1 });
  assert.ok("needsOverride" in r && /dental 1/.test(r.needsOverride));
  assert.deepEqual(statusChangeCheck(t, "property", "active", { dental: 2 }), { ok: true });
  assert.ok("needsOverride" in statusChangeCheck(t, "property", "active", { property: 9 }), "its own clients do not count");
});

test("with no active niche, making one active still needs an override", () => {
  const r = statusChangeCheck(table({ dental: "parked" }), "dental", "active", {});
  assert.ok("needsOverride" in r && /No niche is active/.test(r.needsOverride));
});

test("moving to seeding, audience or parked only tightens: no password", () => {
  const t = table({ dental: "active", aesthetics: "active", beauty: "audience" });
  for (const to of ["seeding", "audience", "parked"]) assert.deepEqual(statusChangeCheck(t, to === "audience" ? "dental" : "aesthetics", to, {}), { ok: true });
  assert.deepEqual(statusChangeCheck(t, "beauty", "seeding", {}), { ok: true });
});

test("unknown niche, unknown status and no change are refused", () => {
  const t = table({ dental: "active" });
  assert.ok("refuse" in statusChangeCheck(t, "nope", "parked", {}));
  assert.ok("refuse" in statusChangeCheck(t, "dental", "live", {}));
  assert.ok("refuse" in statusChangeCheck(t, "dental", "active", {}));
});

test("override reason: 15 to 300 characters, no contact details", () => {
  assert.ok(checkOverrideReason("too short").error);
  assert.ok(checkOverrideReason("x".repeat(301)).error);
  assert.ok(checkOverrideReason("Spoke to owner, call 07700 900123 about it").error);
  assert.equal(checkOverrideReason("  Property enquiries are coming in from LinkedIn already  ").reason, "Property enquiries are coming in from LinkedIn already");
});

test("promise has no figures; offer may, but no contact details", () => {
  assert.ok(checkPromise("Twice the bookings in 30 days").error);
  assert.ok(checkPromise("Save £500 a month on admin").error);
  assert.ok(checkPromise("Answer 100% of calls").error);
  assert.equal(checkPromise("Every missed call answered and booked.").value, "Every missed call answered and booked.");
  assert.equal(checkOffer("Setup plus 2 months of tuning").value, "Setup plus 2 months of tuning");
  assert.ok(checkOffer("Email hello@example.com for details").error);
});

test("only known channels are kept, in their usual order", () => {
  assert.deepEqual(pickChannels(["instagram_dm", "sms", "email", "email"]), ["email", "instagram_dm"]);
});

test("wording changes split the offer and promise from the channel lists", () => {
  const before = { promise: "A", offer: "B", channels: ["email"], platforms: [] };
  assert.deepEqual(wordingChanges(before, { ...before }), { offer: false, lists: false, text: [] });
  const d = wordingChanges(before, { ...before, offer: "C", channels: ["email", "linkedin"] });
  assert.equal(d.offer, true); assert.equal(d.lists, true); assert.equal(d.text.length, 2);
});

test("the log text never carries the password, and quotes the reason", () => {
  assert.equal(statusLogText("Dental", "seeding", "active", "Two pilots agreed"), 'Dental: Seeding → Active, unlocked early with your password. Reason given: "Two pilots agreed"');
});

const YAML = `# top comment
defaults:
  radius_km: 15     # kept

niches:
  dental:
    status: active
    label: "Dental practices"
    channels: [email, linkedin]
    promise: "Every call answered."
    sic_codes: ["86230"]          # dental practice activities
  hvac:                # parked for now
    status: parked
    channels: []
    pain_points:
      - "block list"
`;

test("yaml write-back touches only the changed lines and keeps comments", () => {
  const r = applyNicheEdit(YAML, "hvac", { status: "seeding", channels: ["linkedin"], promise: 'Jobs and "takings" in one email.' });
  assert.ok(r.text, r.error);
  const before = YAML.split("\n"), after = r.text.split("\n");
  const changed = after.filter((l) => !before.includes(l));
  assert.deepEqual(changed, ["    promise: \"Jobs and \\\"takings\\\" in one email.\"", "    status: seeding", "    channels: [linkedin]"]);
  assert.ok(r.text.includes("  hvac:                # parked for now"));
  assert.ok(r.text.includes('sic_codes: ["86230"]          # dental practice activities'));
  const y = parse(r.text);
  assert.equal(y.niches.hvac.promise, 'Jobs and "takings" in one email.');
  assert.equal(y.niches.dental.status, "active");
});

test("a trailing comment after a changed value is kept", () => {
  const r = applyNicheEdit(YAML.replace("    status: active", "    status: active   # clinics first"), "dental", { status: "parked" });
  assert.ok(r.text.includes("    status: parked   # clinics first"));
});

test("yaml write-back refuses a field written over several lines, and an unknown niche", () => {
  assert.match(applyNicheEdit(YAML, "hvac", { pain_points: ["x"] }).error ?? "", /not written on one line/);
  assert.match(applyNicheEdit(YAML, "roofing", { status: "active" }).error ?? "", /not a niche/);
  assert.match(applyNicheEdit("niches: [", "dental", { status: "active" }).error ?? "", /does not parse/);
});

test("the real config/niches.yaml can take a status change on every niche", () => {
  const text = readFileSync(new URL("../../config/niches.yaml", import.meta.url), "utf8");
  for (const key of Object.keys(parse(text).niches)) {
    const r = applyNicheEdit(text, key, { status: "parked", channels: [], platforms: [], promise: "A plain promise.", offer: "An offer." });
    assert.ok(r.text, `${key}: ${r.error}`);
  }
});
