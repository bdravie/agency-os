import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parse } from "yaml";
import { NO_RULES, hasKeyword, offNicheReason, readRelevanceRules } from "../lib/nicheRelevance.ts";

// The same cases are run by tests/test_companies_house.py against the Python copy of the rule, so the two cannot drift.
const fixture = JSON.parse(readFileSync(new URL("../../tests/fixtures/niche_relevance_cases.json", import.meta.url), "utf8"));
const expected = (flag) => (flag === null ? null : flag.startsWith("name:") ? `Looks off-niche: the name says "${flag.slice(5)}"` : `Looks off-niche: Google lists it as "${flag.slice(9)}"`);

test("off-niche check: every shared case", () => {
  const rules = readRelevanceRules({ name_includes: fixture.rules.include, name_excludes: fixture.rules.exclude, name_excludes_always: fixture.rules.always });
  for (const c of fixture.cases) assert.equal(offNicheReason(c.name, c.categories, rules), expected(c.flag), c.name);
  assert.equal(offNicheReason(fixture.no_rules.name, [], NO_RULES), null);
});

test("keywords match the start of words, phrases word by word", () => {
  assert.equal(hasKeyword("Hairdressing World", "hair"), true);
  assert.equal(hasKeyword("Chair Studio", "hair"), false);
  assert.equal(hasKeyword("Care Homes Ltd", "care home"), true);
  assert.equal(hasKeyword("Home Sweet Care", "care home"), false);
  assert.equal(hasKeyword("anything", "  "), false);
});

test("rules read safely from a niche, and both clinic niches in niches.yaml have them", () => {
  assert.deepEqual(readRelevanceRules({ name_excludes: "hair" }), { include: [], exclude: [], always: [] });
  assert.deepEqual(readRelevanceRules(undefined), { include: [], exclude: [], always: [] });
  assert.deepEqual(readRelevanceRules({ name_includes: [" Skin ", "", 3] }).include, ["skin", "3"]);
  const y = parse(readFileSync(new URL("../../config/niches.yaml", import.meta.url), "utf8"));
  for (const key of ["dental", "aesthetics"]) {
    const r = readRelevanceRules(y.niches[key]);
    assert.ok(r.include.length > 0 && r.exclude.length > 0, key);
    assert.ok(!r.include.includes("clinic"), `${key}: "clinic" would let physio clinics through`);
  }
  const a = readRelevanceRules(y.niches.aesthetics);
  assert.equal(offNicheReason("Top Cuts Barbers Ltd", [], a), 'Looks off-niche: the name says "barber"');
  assert.equal(offNicheReason("Glow Skin Care Ltd", [], a), null);
  assert.equal(offNicheReason("Bright Care Ltd", [], a), 'Looks off-niche: the name says "care ltd"');
  assert.equal(offNicheReason("Physio Clinic Ltd", [], a), 'Looks off-niche: the name says "physio"');
});
