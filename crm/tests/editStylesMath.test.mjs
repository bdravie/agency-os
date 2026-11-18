import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parse } from "yaml";
import { DRAWN, GRAPHICS, LAYOUTS, byGroup, cleanTemplate, customId, customKey, editBrief, hasContact, isDrawn, maskContacts, parseCatalogue, previewOf, totalSeconds } from "../lib/editStylesMath.ts";

const raw = parse(readFileSync(new URL("../../config/edit-styles.yaml", import.meta.url), "utf8"));
const cat = parseCatalogue(raw);

test("config/edit-styles.yaml: nothing is dropped on reading, and every element has a drawing", () => {
  assert.equal(cat.groups.length, raw.groups.length);
  assert.equal(cat.elements.length, raw.elements.length);
  assert.equal(cat.templates.length, raw.templates.length);
  assert.equal(cat.rules.length, raw.rules.length);
  for (const e of cat.elements) assert.ok(isDrawn(e.key), `${e.key} has no drawing`);
  for (const k of DRAWN) assert.ok(cat.elements.some((e) => e.key === k), `${k} is drawn but not in the yaml`);
  for (const e of cat.elements) assert.ok(e.when && e.rule, `${e.key} needs a when and a rule`);
  for (const g of GRAPHICS) assert.ok(isDrawn(g));
});
test("the yaml's own templates keep every beat and element, and break none of the brand sheet's limits", () => {
  raw.templates.forEach((t, i) => {
    assert.equal(cat.templates[i].beats.length, t.beats.length, t.key);
    t.beats.forEach((b, j) => {
      assert.deepEqual(cat.templates[i].beats[j].elements, b.elements, `${t.key} beat ${j + 1}`);
      assert.ok(LAYOUTS.includes(b.layout), `${t.key} beat ${j + 1} layout`);
    });
    const r = cleanTemplate(cat.templates[i], cat);
    assert.ok(!("error" in r), t.key);
    assert.deepEqual(r.warnings, [], t.key);
  });
});
test("the yaml holds no contact details and no money amounts", () => {
  const all = JSON.stringify(raw);
  assert.equal(hasContact(all), false);
  assert.equal(/[£$€]\s?\d/.test(all), false);
});
test("the clinic template follows the clinic rule: a demo, booking logistics only, details blurred", () => {
  const t = cat.templates.find((x) => x.niche === "clinics");
  assert.ok(t);
  assert.ok(t.beats.some((b) => b.elements.includes("redaction")));
  assert.match(JSON.stringify(t), /demo/i);
  assert.match(JSON.stringify(t), /Never clinical/);
});

test("parseCatalogue drops what it cannot use and falls back safely", () => {
  const c = parseCatalogue({
    groups: [{ key: "a", name: "A" }, { key: "a", name: "Again" }, { name: "No key" }],
    elements: [{ key: "x", group: "a", name: "X", on: "sideways", with: ["x", "y", "nope"] }, { key: "y", group: "a", name: "Y" }, { key: "z", group: "missing", name: "Z" }, { key: "x", group: "a", name: "Twice" }],
    safe: { top: "lots", bottom: 400 },
    templates: [{ key: "t", name: "T", beats: [{ label: "One", layout: "face", elements: ["x", "nope", "x"], seconds: "3" }, { layout: "wrong", seconds: -2 }] }, { key: "short", name: "Short", beats: [{ label: "Only" }] }],
  });
  assert.deepEqual(c.groups.map((g) => g.name), ["A"]);
  assert.deepEqual(c.elements.map((e) => e.key), ["x", "y"]);
  assert.equal(c.elements[0].on, "face");
  assert.deepEqual(c.elements[0].with, ["y"]);
  assert.deepEqual([c.safe.top, c.safe.bottom], [220, 400]);
  assert.equal(c.templates.length, 1);
  assert.deepEqual(c.templates[0].beats, [{ label: "One", layout: "face", elements: ["x"], seconds: 3, note: "" }, { label: "Beat", layout: "face", elements: [], seconds: 0, note: "" }]);
  assert.deepEqual(parseCatalogue(undefined).elements, []);
});
test("byGroup keeps the catalogue's order; previewOf adds what an element is shown with", () => {
  assert.deepEqual(byGroup(cat).map((g) => g.group.key), ["layouts", "titles", "motion", "cuts", "sound", "generated"]);
  assert.deepEqual(previewOf(cat.elements.find((e) => e.key === "thud")), { layout: "punch", elements: ["thud", "payoff_slam"] });
});
test("custom keys", () => {
  assert.equal(customKey(7), "custom-7");
  assert.equal(customId("custom-7"), 7);
  assert.equal(customId("build_walkthrough"), null);
  assert.equal(customId("custom-7; drop"), null);
});

const beat = (label, layout, elements, seconds = 3) => ({ label, layout, elements, seconds });
test("cleanTemplate refuses no name, too few or too many beats, and contact details", () => {
  const ok = [beat("Hook", "face", ["hook_title"]), beat("Out", "face", ["end_plate"])];
  assert.match(cleanTemplate({ name: " ", beats: ok }, cat).error, /name/);
  assert.match(cleanTemplate({ name: "T", beats: [ok[0]] }, cat).error, /at least 2/);
  assert.match(cleanTemplate({ name: "T", beats: Array(13).fill(ok[0]) }, cat).error, /12 beats/);
  assert.match(cleanTemplate({ name: "T", beats: [{ ...ok[0], note: "ask sam@example.com" }, ok[1]] }, cat).error, /email/);
  assert.match(cleanTemplate({ name: "Call 07700 900123", beats: ok }, cat).error, /phone/);
  const r = cleanTemplate({ name: "  My   edit ", niche: "Dental", beats: ok }, cat);
  assert.deepEqual([r.template.name, r.template.niche, r.template.custom, r.warnings], ["My edit", "dental", true, []]);
});
test("cleanTemplate warns, and never refuses, on the brand sheet's limits", () => {
  const r = cleanTemplate({ name: "Busy", beats: [
    beat("Open", "face", ["site_captions"]),
    beat("A", "plate", ["step_plate"]), beat("B", "plate", ["step_plate"]), beat("C", "plate", ["step_plate"]), beat("D", "plate", ["step_plate"]),
    beat("Both", "over_shoulder", ["site_captions", "callout_pill", "spotlight", "progress_bar"]),
    beat("Quiet", "over_shoulder", ["slow_push"]),
  ] }, cat);
  assert.ok(!("error" in r));
  assert.equal(r.warnings.length, 5);
  assert.match(r.warnings.join("\n"), /4 step plates/);
  assert.match(r.warnings.join("\n"), /Both: Callout pill and Spotlight together/);
  assert.match(r.warnings.join("\n"), /Quiet: no captions/);
  assert.match(r.warnings.join("\n"), /No end plate/);
  assert.match(r.warnings.join("\n"), /first beat has no hook/);
});

test("the edit brief is written by code: beats in order, each element's rule, the script, every rule, safe zones", () => {
  const t = cat.templates.find((x) => x.key === "build_walkthrough");
  const b = editBrief({ idea: "Quote page for roofers", hook: "Copy this quote page", script: "Line one.\r\nLine two.", keyword: "ROOF" }, t, cat);
  assert.match(b, /^Edit this video: Quote page for roofers/);
  assert.match(b, /TEMPLATE: Build walkthrough \(Format A\), 30 to 45s/);
  assert.ok(b.indexOf("1. Hook: Face layout, about 3s") < b.indexOf("7. Outro: Face layout"));
  assert.match(b, /- Hook title: Instrument Serif/);
  assert.match(b, /HOOK A: Copy this quote page/);
  assert.match(b, /KEYWORD \(end plate\): ROOF/);
  assert.match(b, /Line one\.\nLine two\./);
  for (const r of cat.rules) assert.ok(b.includes(r.text));
  assert.match(b, /top 220px, the bottom 380px and the right 150px/);
  assert.match(b, /config\/edit-styles\.yaml/);
  assert.equal(totalSeconds(t.beats), 34);
});
test("the edit brief masks contact details, flags credits, and says when there is no script", () => {
  const t = cat.templates.find((x) => x.key === "eye_candy");
  const b = editBrief({ idea: "Look", script: "Email me at sam@example.com or ring 07700 900123." }, t, cat);
  assert.equal(hasContact(b), false);
  assert.match(b, /\[email\].*\[phone\]/);
  assert.match(b, /B-roll clip: .*ask before spending/);
  assert.match(editBrief({ idea: "Look" }, t, cat), /No script saved yet/);
  assert.equal(maskContacts("no details here"), "no details here");
});
