import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parse } from "yaml";
import { freshProblems, genericHits, parsePhraseConfig, repeatedPhrases, sameStart, sharedBetween, staleHook, usedDigest } from "../lib/freshnessMath.ts";

const EARLIER = [
  { id: 1, title: "Dental missed calls", hooks: ["A patient with toothache rings your practice at lunch."], text: "A patient with toothache rings your practice at lunch.\nPicture it. Your receptionist is checking someone in, the second line is ringing, and a person in pain listens to it ring out.\nWhen did you last ring your own practice at lunchtime?" },
  { id: 2, title: "Three dental sites", hooks: ["I checked three dental websites. All three made the same mistake."], text: "I checked three dental websites.\nNobody said no. The enquiry just quietly went cold." },
];
const rules = (over = {}) => ({ generic: ["game changer", "streamlin*", "24/7", "isn't the problem"], allowed: [], earlier: EARLIER, ...over });

test("stock phrases are found whatever the capitals, hyphens or curly quotes, and * catches other endings", () => {
  assert.deepEqual(genericHits("A real Game-Changer for clinics.", ["game changer"]), ["game changer"]);
  assert.deepEqual(genericHits("We streamlined the diary, open 24/7.", ["streamlin*", "24/7"]), ["streamlin", "24/7"]);
  assert.deepEqual(genericHits("The phone isn’t the problem.", ["isn't the problem"]), ["isn't the problem"]);
  assert.deepEqual(genericHits("They unlocked the door", ["unlock"]), []);          // whole words only without a *
  assert.deepEqual(genericHits("A plain sentence about a diary.", ["game changer", ""]), []);
});

test("a run of four words with three meaningful ones shared with an earlier post is a repeat, and says where it came from", () => {
  const r = repeatedPhrases("Meanwhile a person in pain listens to the hold music.", EARLIER);
  assert.equal(r.length, 1);
  assert.equal(r[0].phrase, "a person in pain listens to");
  assert.equal(r[0].title, "Dental missed calls");
});
test("filler words in common are not a repeat, and neither is a fresh sentence on the same subject", () => {
  assert.deepEqual(repeatedPhrases("It is one of the things that you would have to do.", [{ id: 9, title: "x", hooks: [], text: "This is one of the things that you would have to check." }]), []);
  assert.deepEqual(repeatedPhrases("The lunchtime caller with a cracked tooth hears four rings, then nothing.", EARLIER), []);
});
test("a whole short sentence used before is a repeat even when it is only two words", () => {
  assert.deepEqual(repeatedPhrases("Picture it! The desk is empty.", EARLIER).map((r) => r.phrase), ["picture it"]);
  assert.deepEqual(repeatedPhrases("Nobody said no.", EARLIER).map((r) => r.phrase), ["nobody said no"]);
});
test("a phrase the owner allows may recur", () => {
  assert.deepEqual(repeatedPhrases("Picture it. Nothing else matches.", EARLIER, ["Picture it"]), []);
  assert.deepEqual(repeatedPhrases("Then a person in pain listens again.", EARLIER, ["a person in pain listens"]), []);
});

test("an opening line may not start with the same three words as an earlier one", () => {
  assert.deepEqual(sameStart("I checked three aesthetics clinics last week.", EARLIER), { phrase: "i checked three", title: "Three dental sites" });
  assert.equal(sameStart("Three clinics, one empty inbox.", EARLIER), null);
  assert.equal(sameStart("I checked", EARLIER), null);
});

test("problems name the phrase and where it was used, and a fresh post has none", () => {
  const p = freshProblems([{ name: "post", text: "Busy isn't the problem. Picture it." }, { name: "second opening line", text: "I checked three clinic phone lines on a Monday.", hook: true }], rules());
  assert.equal(p.length, 3);
  assert.match(p[0], /the post uses wording everyone in the niche uses \("isn't the problem"\)/);
  assert.match(p[1], /the post repeats wording from an earlier post \("picture it" from "Dental missed calls"\)/);
  assert.match(p[2], /second opening line starts the same way as an earlier post \("i checked three", in "Three dental sites"\)/);
  assert.deepEqual(freshProblems([{ name: "post", text: "The kettle clicked off twice before anyone reached the phone." }, { name: "caption", text: "" }], rules()), []);
});
test("an opening already inside the post is only compared by how it starts", () => {
  assert.deepEqual(freshProblems([{ name: "opening line", text: "Picture it.", startOnly: true }], rules()), []);
  assert.equal(freshProblems([{ name: "opening line", text: "I checked three phones.", startOnly: true }], rules()).length, 1);
});
test("a stale hook is one with a stock phrase, earlier wording or an earlier opening", () => {
  assert.equal(staleHook("This is a game changer for your diary", rules()), true);
  assert.equal(staleHook("I checked three clinic sites at midnight", rules()), true);
  assert.equal(staleHook("The second line rang for a full minute", rules()), false);
});

test("two posts written in the same go may not share a phrase", () => {
  const p = sharedBetween([
    { name: "Reels caption", text: "The front desk was three deep when the phone went. Comment DESK and I'll send you the build." },
    { name: "TikTok caption", text: "nobody tells you the phone rings most at lunch. Comment DESK and I'll send you the build." },
    { name: "LinkedIn post", text: "A queue at reception and a ringing handset want the same person." },
  ]);
  assert.equal(p.length, 1);
  assert.match(p[0], /the TikTok caption repeats wording from the Reels caption \("comment desk and i'll send you the build"\)/);
});

test("the digest shows openings and closing lines once each, and leaves out a line that must not be shown", () => {
  const d = usedDigest(EARLIER, (line) => line.includes("quietly"));
  assert.ok(d.includes("- A patient with toothache rings your practice at lunch."));
  assert.ok(d.includes("- When did you last ring your own practice at lunchtime?"));
  assert.ok(!d.includes("quietly"));
  assert.equal(d.split("\n").filter((l) => l.includes("toothache")).length, 1);
  assert.ok(usedDigest(EARLIER, undefined, 60).length <= 60);
  assert.equal(usedDigest([]), "");
});

test("config/content-phrases.yaml is readable, has no duplicates, and catches the phrases it was written for", () => {
  const cfg = parsePhraseConfig(parse(readFileSync(new URL("../../config/content-phrases.yaml", import.meta.url), "utf8")));
  assert.ok(cfg.generic.length >= 40);
  assert.deepEqual(cfg.allowed, []);
  assert.deepEqual(parsePhraseConfig(null), { generic: [], allowed: [] });
  assert.deepEqual(parsePhraseConfig({ generic: ["a b", " a b ", 7, "", "?"], allowed_repeats: "no" }), { generic: ["a b", "7"], allowed: [] });
  const text = "Busy practices aren't the problem. It isn't there to replace your receptionist. Open 24/7, so nothing slips through the cracks.";
  assert.deepEqual(genericHits(text, cfg.generic).sort(), ["24/7", "aren't the problem", "there to replace", "through the cracks"]);
  // Plain trade words stay usable.
  assert.deepEqual(genericHits("A missed call at a dental practice, and an enquiry nobody answered before the diary closed.", cfg.generic), []);
});

test("hashtags are labels, so the same ones under two posts are not a repeat", () => {
  const before = [{ id: 1, title: "x", hooks: [], text: "The desk was empty.\n\n#dentalpractice #practicemanagement #dentistry" }];
  assert.deepEqual(repeatedPhrases("A new thought entirely.\n\n#dentalpractice #practicemanagement #dentistry", before), []);
});
test("the closest earlier posts are the ones sharing the most meaningful words with what is being written", async () => {
  const { closestPosts } = await import("../lib/freshnessMath.ts");
  const other = { id: 3, title: "Dashboard", hooks: [], text: "Six things I added to my own dashboard without code." };
  assert.deepEqual(closestPosts([...EARLIER, other], "A dental practice receptionist and the lunch phone").map((e) => e.id), [1]);
  assert.deepEqual(closestPosts([...EARLIER, other], ""), []);
  assert.deepEqual(closestPosts([...EARLIER, other], "roofers and scaffolding"), []);
});
