import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parse } from "yaml";
import {
  activeNiches, buildNicheTable, canOutreach, canSource, cleanNiche, configProblems, nicheStatus, outreachBlock, platformsFor,
} from "../lib/nicheStatus.ts";

const t = buildNicheTable({
  dental: { status: "active", label: "Dental practices", tier: "mid", channels: ["email", "linkedin"], platforms: ["linkedin"] },
  aesthetics: { status: "active", channels: ["email", "linkedin", "instagram_dm"], platforms: ["linkedin", "instagram"] },
  beauty: { status: "audience", channels: [], platforms: ["instagram", "tiktok"] },
  property_developers: { status: "seeding", channels: ["linkedin", "email"], platforms: ["linkedin"] },
  hvac: { status: "parked", channels: ["email"], platforms: ["linkedin"] },
}, [{ key: "medspas", label: "Medspas", status: "parked" }, { key: "dental", label: "Shadowed", status: "parked" }]);

test("active: sourcing and every listed channel", () => {
  assert.equal(nicheStatus(t, "dental"), "active");
  assert.equal(canSource(t, "dental"), true);
  assert.equal(canOutreach(t, "dental", "email"), true);
  assert.equal(canOutreach(t, "dental", "linkedin"), true);
  assert.equal(canOutreach(t, "dental", "instagram_dm"), false, "not a dental channel");
  assert.equal(canOutreach(t, "aesthetics", "instagram_dm"), true);
  assert.deepEqual(platformsFor(t, "aesthetics"), ["linkedin", "instagram"]);
});

test("seeding: LinkedIn only, never email even if listed, never sourcing", () => {
  assert.equal(canSource(t, "property_developers"), false);
  assert.equal(canOutreach(t, "property_developers", "linkedin"), true);
  assert.equal(canOutreach(t, "property_developers", "email"), false);
  assert.deepEqual(platformsFor(t, "property_developers"), ["linkedin"]);
});

test("audience: content only", () => {
  assert.equal(canSource(t, "beauty"), false);
  for (const ch of ["email", "linkedin", "instagram_dm"]) assert.equal(canOutreach(t, "beauty", ch), false);
  assert.deepEqual(platformsFor(t, "beauty"), ["instagram", "tiktok"]);
});

test("parked: nothing, even if its row lists channels or platforms", () => {
  assert.equal(canSource(t, "hvac"), false);
  assert.equal(canOutreach(t, "hvac", "email"), false);
  assert.deepEqual(platformsFor(t, "hvac"), []);
  assert.deepEqual(t.hvac.channels, []);
});

test("an unknown key, no key or a bad status counts as parked", () => {
  for (const key of ["nope", null, undefined, ""]) {
    assert.equal(nicheStatus(t, key), "parked");
    assert.equal(canSource(t, key), false);
    assert.equal(canOutreach(t, key, "email"), false);
    assert.deepEqual(platformsFor(t, key), []);
  }
  assert.equal(cleanNiche("x", { status: "ACTIVE " }).status, "active");
  assert.equal(cleanNiche("x", { status: "live" }).status, "parked");
  assert.equal(cleanNiche("x", {}).status, "parked");
});

test("custom niches join the table, but the yaml wins on a shared key; unknown channels are dropped", () => {
  assert.equal(t.medspas.custom, true);
  assert.equal(t.medspas.status, "parked");
  assert.equal(t.dental.custom, false);
  assert.equal(t.dental.label, "Dental practices");
  assert.deepEqual(cleanNiche("x", { status: "active", channels: ["email", "sms", "Email", "carrier_pigeon"], platforms: ["youtube", "tiktok"] }).channels, ["email"]);
  assert.deepEqual(cleanNiche("x", { status: "active", platforms: ["youtube", "tiktok"] }).platforms, ["tiktok"]);
  assert.equal(cleanNiche("pest_control", {}).label, "Pest control");
});

test("the focus list is the active niches", () => {
  assert.deepEqual(activeNiches(t), ["dental", "aesthetics"]);
});

test("refusals say which status blocked them", () => {
  assert.equal(outreachBlock(t, "dental", "email"), null);
  assert.match(outreachBlock(t, "hvac", "email"), /parked/);
  assert.match(outreachBlock(t, "beauty", "linkedin"), /audience niche: content only/);
  assert.match(outreachBlock(t, "property_developers", "email"), /seeding: LinkedIn notes only/);
  assert.match(outreachBlock(t, "dental", "instagram_dm"), /active but does not use Instagram DMs/);
  assert.match(outreachBlock(t, null, "email"), /no niche/);
  assert.match(outreachBlock(t, "Office Workspace", "email"), /not a niche in your list/);
});

test("config problems: too many active, active with no channels, seeding with extra channels", () => {
  assert.deepEqual(configProblems(buildNicheTable({ a: { status: "active", channels: ["email"] } })), []);
  const p = configProblems(buildNicheTable({ a: { status: "active", channels: ["email"] }, b: { status: "active", channels: ["email"] }, c: { status: "active" } })).join(" | ");
  assert.match(p, /3 niches are active/);
  assert.match(p, /C is active but has no channels/);
  assert.match(configProblems(t).join("|"), /Property developers is seeding, so only LinkedIn is used/);
});

test("config/niches.yaml as committed follows the plan", () => {
  const y = parse(readFileSync(new URL("../../config/niches.yaml", import.meta.url), "utf8"));
  assert.equal(y.defaults.focus_niches, undefined, "focus_niches is gone");
  const real = buildNicheTable(y.niches);
  for (const [key, raw] of Object.entries(y.niches)) {
    for (const f of ["status", "label", "tier", "channels", "platforms", "promise", "pain_points"]) assert.ok(f in raw, `${key} lacks ${f}`);
    assert.doesNotMatch(raw.promise, /\d|[£$%]/, `${key}'s promise has a figure`);
  }
  assert.deepEqual(activeNiches(real), ["dental", "aesthetics"]);
  assert.equal(nicheStatus(real, "beauty"), "audience");
  assert.equal(nicheStatus(real, "property_developers"), "seeding");
  for (const k of ["peptide_clinics", "hvac", "roofing", "pest_control", "trades", "marketing_agencies", "ecommerce", "creators"]) assert.equal(nicheStatus(real, k), "parked", k);
  assert.deepEqual(real.beauty.platforms, ["instagram", "tiktok"]);
  assert.ok(y.content.platforms.includes("tiktok"));
  assert.deepEqual(configProblems(real).filter((p) => !/seeding, so only LinkedIn/.test(p)), []);
});
