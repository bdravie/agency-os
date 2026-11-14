import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parse } from "yaml";
import { buildNicheTable } from "../lib/nicheStatus.ts";
import { contentMix, itemPlatforms, nichePaceRows, parseNicheTargets, STOP_MESSAGE, STOP_TOUCHES, stopRuleHit } from "../lib/nicheTargetsMath.ts";

const t = buildNicheTable({
  dental: { status: "active", label: "Dental practices", channels: ["email", "linkedin"], platforms: ["linkedin"] },
  aesthetics: { status: "active", label: "Aesthetics clinics", channels: ["email", "linkedin", "instagram_dm"], platforms: ["linkedin", "instagram"] },
  beauty: { status: "audience", label: "Beauty studios", channels: [], platforms: ["instagram", "tiktok"] },
  property_developers: { status: "seeding", label: "Property developers", channels: ["linkedin"], platforms: ["linkedin"] },
  hvac: { status: "parked", label: "HVAC", channels: ["email"], platforms: ["linkedin"] },
});

test("the real config/targets.yaml has the plan's starting numbers", () => {
  const raw = parse(readFileSync(new URL("../../config/targets.yaml", import.meta.url), "utf8"));
  const n = parseNicheTargets(raw);
  assert.deepEqual(n.byNiche.dental, { emails: 30, linkedin_notes: 5, posts: { linkedin: 1 } });
  assert.deepEqual(n.byNiche.aesthetics, { emails: 20, instagram_dms: 15, linkedin_notes: 5, posts: { linkedin: 1 } });
  assert.deepEqual(n.byNiche.property_developers, { linkedin_notes: 10, posts: { linkedin: 1 } });
  assert.deepEqual(n.postsByPlatform, { linkedin: 3, instagram: 2, tiktok: 2 });
});

test("targets that are not positive whole numbers are left out", () => {
  const n = parseNicheTargets({ by_niche: { dental: { emails: "lots", linkedin_notes: -2, instagram_dms: 2.5, posts: { linkedin: 0, tiktok: 3 } }, junk: "x" }, posts_by_platform: { youtube: 4 } });
  assert.deepEqual(n.byNiche.dental, { posts: { tiktok: 3 } });
  assert.equal(n.byNiche.junk, undefined);
  assert.deepEqual(n.postsByPlatform, {});
});

test("one row per active or seeding niche; audience and parked get none", () => {
  const rows = nichePaceRows(t, parseNicheTargets({}), {}, 0.5);
  assert.deepEqual(rows.map((r) => r.key), ["dental", "aesthetics", "property_developers"]);
  assert.ok(rows.every((r) => r.goals.length === 0));
});

test("each target is measured against this week, with the pace tick", () => {
  const targets = parseNicheTargets({ by_niche: { dental: { emails: 30, linkedin_notes: 5, posts: { linkedin: 1 } } } });
  const [dental] = nichePaceRows(t, targets, { dental: { emails: 15, instagram_dms: 0, linkedin_notes: 1, posts: { linkedin: 1 } } }, 0.5);
  assert.deepEqual(dental.goals.map((g) => [g.label, g.value, g.target, g.status]), [["Emails", 15, 30, "on_track"], ["LinkedIn notes", 1, 5, "behind"], ["LinkedIn posts", 1, 1, "done"]]);
  assert.equal(dental.goals[0].pace, 50);
});

test("a target the niche may not use becomes a note, never a goal", () => {
  const targets = parseNicheTargets({ by_niche: { property_developers: { emails: 10, linkedin_notes: 10, posts: { instagram: 2, linkedin: 1 } }, dental: { instagram_dms: 5 } } });
  const rows = Object.fromEntries(nichePaceRows(t, targets, {}, 0.3).map((r) => [r.key, r]));
  assert.deepEqual(rows.property_developers.goals.map((g) => g.label), ["LinkedIn notes", "LinkedIn posts"]);
  assert.deepEqual(rows.property_developers.ignored, ["Emails (seeding: LinkedIn only)", "Instagram posts (not one of its platforms)"]);
  assert.deepEqual(rows.dental.ignored, ["Instagram DMs (not one of its channels)"]);
});

test("stop rule: fires at 150 touches with no calls, for active niches only", () => {
  assert.equal(STOP_TOUCHES, 150);
  assert.equal(STOP_MESSAGE, "150 touches, no calls: change the offer, not the niche");
  assert.equal(stopRuleHit("active", 149, 0), false);
  assert.equal(stopRuleHit("active", 150, 0), true);
  assert.equal(stopRuleHit("active", 400, 1), false, "a call booked clears it");
  assert.equal(stopRuleHit("seeding", 400, 0), false);
});

test("a LinkedIn post goes to LinkedIn; anything else to its ticked platforms", () => {
  assert.deepEqual(itemPlatforms({ format: "LinkedIn post", platforms: ["instagram"] }, "LinkedIn post"), ["linkedin"]);
  assert.deepEqual(itemPlatforms({ format: "Short video", platforms: ["tiktok", "youtube", "instagram"] }, "LinkedIn post"), ["instagram", "tiktok"]);
  assert.deepEqual(itemPlatforms({ format: null, platforms: null }, "LinkedIn post"), []);
});

test("content mix: planned against target, and a beauty post on LinkedIn or a property post on Instagram is flagged", () => {
  const targets = parseNicheTargets({ posts_by_platform: { linkedin: 3, instagram: 2, tiktok: 2 } });
  const items = [
    { id: 1, idea: "Lash studio content plan", niche: "beauty", format: "LinkedIn post", platforms: [] },
    { id: 2, idea: "Flyover of a new scheme", niche: "property_developers", format: "Short video", platforms: ["instagram", "tiktok"] },
    { id: 3, idea: "Missed calls at the front desk", niche: "dental", format: "LinkedIn post", platforms: [] },
    { id: 4, idea: "Consultation slots", niche: "aesthetics", format: "Short video", platforms: ["instagram"] },
    { id: 5, idea: "Untagged idea", niche: null, format: "Short video", platforms: ["tiktok"] },
    { id: 6, idea: "Old trade post", niche: "hvac", format: "LinkedIn post", platforms: [] },
  ];
  const { rows, warnings } = contentMix(t, targets, items, "LinkedIn post");
  assert.deepEqual(rows, [{ platform: "linkedin", planned: 3, target: 3 }, { platform: "instagram", planned: 2, target: 2 }, { platform: "tiktok", planned: 2, target: 2 }]);
  assert.deepEqual(warnings.map((w) => [w.id, w.text]), [
    [1, "LinkedIn planned, but Beauty studios posts on Instagram and TikTok only."],
    [2, "Instagram and TikTok planned, but Property developers posts on LinkedIn only."],
    [6, "LinkedIn planned, but HVAC is parked."],
  ]);
});
