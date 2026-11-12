import test from "node:test";
import assert from "node:assert/strict";
import { clampFont, clampSpeed, hookAB, nextIndex, parseScript, pickHooks, suggestSlots, variantProblems, variantTargets } from "../lib/filmMath.ts";

const SAVED = "HOOK OPTIONS\n1. Quotes going quiet?\n2. Stop losing quotes\n3) Third one\n\nSCRIPT\nLine one of the script.\n\nLine two.\n\nON-SCREEN TEXT / SCREEN RECORDING\n- Show the inbox\n- Zoom on the follow-up\n";

test("a saved script is split into hooks, the script to read and the on-screen list", () => {
  const p = parseScript(SAVED);
  assert.deepEqual(p.hooks, ["Quotes going quiet?", "Stop losing quotes", "Third one"]);
  assert.equal(p.script, "Line one of the script.\n\nLine two.");
  assert.deepEqual(p.onScreen, ["Show the inbox", "Zoom on the follow-up"]);
});
test("a script with no headings is read as it is, and empty is safe", () => {
  assert.deepEqual(parseScript("Just some words to say."), { hooks: [], script: "Just some words to say.", onScreen: [] });
  assert.deepEqual(parseScript(null), { hooks: [], script: "", onScreen: [] });
  assert.deepEqual(parseScript("  \r\n "), { hooks: [], script: "", onScreen: [] });
});
test("a hand-written script keeps all its words even if a line happens to say Script", () => {
  const own = "Here is my opening.\n\nScript\nThe rest of what I say.";
  assert.deepEqual(parseScript(own), { hooks: [], script: own, onScreen: [] });
});
test("teleprompter controls stay in range and moving between scripts stops at the ends", () => {
  assert.deepEqual([clampSpeed(-5), clampSpeed(42.4), clampSpeed(900)], [0, 42, 300]);
  assert.deepEqual([clampFont(5), clampFont(60), clampFont(500)], [24, 60, 120]);
  assert.deepEqual([nextIndex(0, -1, 3), nextIndex(0, 1, 3), nextIndex(2, 1, 3), nextIndex(0, 1, 0)], [0, 1, 2, 0]);
});
test("hook B is the first option that really differs from hook A", () => {
  assert.deepEqual(pickHooks(["Quotes going quiet?", "quotes going quiet", "Stop losing quotes"], "Quotes going quiet?"), { a: "Quotes going quiet?", b: "Stop losing quotes" });
  assert.deepEqual(pickHooks(["Only one"], "Only one"), { a: "Only one", b: null });
  assert.deepEqual(pickHooks([], " Fave "), { a: "Fave", b: null });
});
test("hook A against hook B only counts posts whose recorded hook matches, on ideas that have two hooks", () => {
  const post = (hookUsed, multiple, o = {}) => ({ postId: 1, contentId: 1, platform: "instagram", multiple, views72: 100, postedAt: "2026-11-02T10:00:00Z", url: "u", idea: "i", hookUsed, pillar: null, hookType: null, format: null, niche: null, lengthS: null, itemHook: "Hook one", itemHookAlt: "Hook two", ...o });
  const g = hookAB([post("Hook one", 2), post("Hook one", 3), post("Hook one", 1), post("Hook two", 4), post("Something typed", 9), post("Hook one", 8, { itemHookAlt: null }), post(null, 7)]);
  assert.deepEqual(g.map((x) => [x.key, x.n, x.median, x.thin]), [["Hook A", 3, 2, false], ["Hook B", 1, 4, true]]);
});
test("the variants wanted: your platforms plus an Upwork blurb, each exactly once", () => {
  assert.deepEqual(variantTargets(["instagram", "linkedin"]), ["instagram", "linkedin", "upwork"]);
  assert.deepEqual(variantTargets(["tiktok"]), ["tiktok", "upwork"]);
  const ok = [{ target: "instagram", text: "Quotes going quiet? Comment QUOTE." }, { target: "linkedin", text: "A short post." }, { target: "upwork", text: "A demo that chases quotes for a roofing firm." }];
  assert.deepEqual(variantProblems(ok, ["instagram", "linkedin", "upwork"]), []);
  assert.match(variantProblems(ok.slice(0, 2), ["instagram", "linkedin", "upwork"]).join(), /exactly one Upwork portfolio blurb/);
});
test("variants are refused for links, figures, client claims and over-long blurbs", () => {
  const bad = [
    { target: "instagram", text: "See https://example.com and @someone" },
    { target: "linkedin", text: "We grew bookings 300% #a #b #c #d" },
    { target: "upwork", text: "My client saw a big jump after this. " + "word ".repeat(130) },
  ];
  const p = variantProblems(bad, ["instagram", "linkedin", "upwork"]).join("|");
  assert.match(p, /Reels caption contains a link or an @ name/);
  assert.match(p, /LinkedIn post states a money amount, percentage or multiplier/);
  assert.match(p, /more than 3 hashtags/);
  assert.match(p, /longer than 120 words/);
  assert.match(p, /talks about clients or customers/);
});
test("slots: your best trusted days first, then common days, in week order, with the reason", () => {
  const days = [{ key: "Thursday", n: 5, median: 2.4, thin: false }, { key: "Monday", n: 4, median: 1.2, thin: false }, { key: "Saturday", n: 1, median: 9, thin: true }];
  const parts = [{ key: "Evening (6pm to 11pm)", n: 6, median: 1.9, thin: false }];
  const s = suggestSlots(4, days, parts);
  assert.deepEqual(s.map((x) => x.weekday), ["Monday", "Tuesday", "Wednesday", "Thursday"]);
  assert.match(s.find((x) => x.weekday === "Thursday").why, /One of your best days \(median 2\.4× over 5 posts\) · best time of day \(median 1\.9× over 6 posts\)/);
  assert.match(s.find((x) => x.weekday === "Tuesday").why, /not enough of your own posts yet/);
  assert.equal(s[0].time, "Evening (6pm to 11pm)");
  const none = suggestSlots(3, [], []);
  assert.deepEqual(none.map((x) => x.weekday), ["Tuesday", "Wednesday", "Thursday"]);
  assert.equal(none[0].time, "Morning (5am to 11am)");
  assert.match(none[0].why, /starting guess for the time/);
  assert.equal(suggestSlots(0, days, parts).length, 0);
});

test("weak hooks are dropped: stock openers and over-long lines, but A and B always survive", async () => {
  const { cleanHooks } = await import("../lib/filmMath.ts");
  const r = cleanHooks(["Did you know quotes go quiet?", "This quote chases itself", "“In today’s video I show a thing", "Stop ringing round for an answer"], "Did you know quotes go quiet?");
  assert.deepEqual(r, { hooks: ["This quote chases itself", "Stop ringing round for an answer"], favourite: "This quote chases itself", dropped: 2 });
  assert.equal(cleanHooks(["One good hook", "one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen"], "One good hook").hooks.length, 2);   // never fewer than two
  assert.deepEqual(cleanHooks(["Kept as it is", "Also fine"], "Also fine"), { hooks: ["Kept as it is", "Also fine"], favourite: "Also fine", dropped: 0 });
  assert.deepEqual(cleanHooks([], ""), { hooks: [], favourite: "", dropped: 0 });
});
