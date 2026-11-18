import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_LIST_SIZE, MAX_LIST_SIZE, groupRuns, parseListSize, parseSort, pickCompanies, readCandidates, splitByNiche, suggestPerson, personLabel } from "../lib/weeklyListMath.ts";

test("list size comes from targets.yaml, with a default and a ceiling", () => {
  assert.equal(parseListSize({ weekly_list: { size: 30 } }), 30);
  assert.equal(parseListSize({}), DEFAULT_LIST_SIZE);
  assert.equal(parseListSize({ weekly_list: { size: -4 } }), DEFAULT_LIST_SIZE);
  assert.equal(parseListSize({ weekly_list: { size: "lots" } }), DEFAULT_LIST_SIZE);
  assert.equal(parseListSize({ weekly_list: { size: 5000 } }), MAX_LIST_SIZE);
});

test("the list is shared by weekly email targets and always adds up", () => {
  assert.deepEqual(splitByNiche(50, [{ key: "dental", emails: 30 }, { key: "aesthetics", emails: 20 }]), { dental: 30, aesthetics: 20 });
  const odd = splitByNiche(10, [{ key: "a", emails: 1 }, { key: "b", emails: 1 }, { key: "c", emails: 1 }]);
  assert.equal(odd.a + odd.b + odd.c, 10);
  assert.deepEqual(splitByNiche(10, [{ key: "a", emails: 0 }, { key: "b", emails: 0 }]), { a: 5, b: 5 });
  assert.deepEqual(splitByNiche(10, [{ key: "a", emails: 20 }, { key: "b", emails: 0 }]), { a: 10, b: 0 });
  assert.deepEqual(splitByNiche(10, []), {});
});

test("each niche gets its best companies, and spare places go to the best left over", () => {
  const rows = [
    { id: 1, niche: "dental", suitability: 90 }, { id: 2, niche: "dental", suitability: 70 }, { id: 3, niche: "dental", suitability: 50 },
    { id: 4, niche: "aesthetics", suitability: 80 },
  ];
  assert.deepEqual(pickCompanies({ dental: 2, aesthetics: 1 }, rows).map((r) => r.id), [1, 4, 2]);
  // aesthetics can only fill 1 of its 2 places, so the spare goes to the next best dental company
  assert.deepEqual(pickCompanies({ dental: 1, aesthetics: 2 }, rows).map((r) => r.id), [1, 4, 2]);
  // places already taken this week are not filled twice
  assert.deepEqual(pickCompanies({ dental: 2, aesthetics: 1 }, rows, { dental: 2, aesthetics: 1 }), []);
  assert.deepEqual(pickCompanies({ dental: 2 }, rows, { dental: 1 }).map((r) => r.id), [1]);
});

const person = (id, title, hasEmail, firstName = "Sam") => ({ id, firstName, lastInitial: "T", title, org: null, hasEmail });

test("the suggestion is the most senior person Apollo holds an email for", () => {
  const s = suggestPerson([person("m", "Practice Manager", true), person("o", "Owner", false), person("d", "Director", true)]);
  assert.equal(s.chosen, "d");
  assert.equal(s.note, null);
  assert.equal(s.candidates.length, 3);
  assert.equal(suggestPerson([]).chosen, null);
  assert.match(suggestPerson([]).note, /no senior people/);
  const none = suggestPerson([person("o", "Owner", false)]);
  assert.equal(none.chosen, null);
  assert.match(none.note, /no email/);
});

test("saved candidates are read back safely", () => {
  const ok = readCandidates([{ id: "abc_1", firstName: "Sam", lastInitial: "Taylor", title: "Owner", hasEmail: true }, { id: "bad id!", firstName: "X" }, null, { id: "z" }]);
  assert.deepEqual(ok, [{ id: "abc_1", firstName: "Sam", lastInitial: "T", title: "Owner", org: null, hasEmail: true }]);
  assert.deepEqual(readCandidates("nope"), []);
  assert.equal(personLabel(ok[0]), "Sam T., Owner");
});

test("This week: newest build first, best score inside each build; two builds in the same minute stay apart", () => {
  const row = (id, key, suitability) => ({ id, addedKey: key, addedLabel: `label ${key}`, suitability });
  const rows = [row(1, "2026-11-17T09:00:00.100000", 80), row(2, "2026-11-17T14:05:00.200000", 40), row(3, "2026-11-17T14:05:00.200000", 90), row(4, "2026-11-17T14:05:30.000000", 10)];
  const runs = groupRuns(rows, "new");
  assert.deepEqual(runs.map((g) => g.key), ["2026-11-17T14:05:30.000000", "2026-11-17T14:05:00.200000", "2026-11-17T09:00:00.100000"]);
  assert.deepEqual(runs[1].rows.map((r) => r.id), [3, 2]);
  assert.equal(runs[1].label, "label 2026-11-17T14:05:00.200000");
  const fit = groupRuns(rows, "fit");
  assert.equal(fit.length, 1);
  assert.deepEqual(fit[0].rows.map((r) => r.id), [3, 1, 2, 4]);
  assert.deepEqual(groupRuns([], "new"), []);
  assert.deepEqual(groupRuns([], "fit"), []);
});

test("This week sorts newest first unless Best fit is asked for", () => {
  assert.equal(parseSort(undefined), "new");
  assert.equal(parseSort("fit"), "fit");
  assert.equal(parseSort("anything"), "new");
});
