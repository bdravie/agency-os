import test from "node:test";
import assert from "node:assert/strict";
import { cleanDesign, coverTextProblem, powerWord, sniffImage, suggestedDesign, wrapTitle, MAX_STICKERS } from "../lib/thumbnailDesign.ts";

test("a design is always safe to draw: unknowns fall back, numbers are clamped, extras are cut", () => {
  assert.deepEqual(cleanDesign(null), { layout: "side", style: "solid", tilt: false, power: "", stickers: [], logos: [] });
  const d = cleanDesign({ layout: "nope", style: "outline", tilt: true, power: "quotes", stickers: [
    { kind: "arrow", x: 9, y: -2, scale: 50, rot: 999, colour: "pink", text: "ignored" },
    { kind: "laser" }, { kind: "pill", text: "  BRAND NEW THING EVER  " }, { kind: "burst", text: "£10k" }, { kind: "number" },
  ], logos: [{ asset: 4, x: 0.2, y: 0.3 }, { asset: "x" }, { asset: -1 }] }, "Why quotes die");
  assert.equal(d.layout, "side"); assert.equal(d.style, "outline"); assert.equal(d.tilt, true); assert.equal(d.power, "QUOTES");
  assert.deepEqual(d.stickers[0], { kind: "arrow", x: 1, y: 0, scale: 3, rot: 180, colour: "coral" });
  assert.equal(d.stickers.length, 4);
  assert.equal(d.stickers[1].text, "BRAND NEW TH");            // cut to 12 characters
  assert.equal(d.stickers[2].text, "FREE");                    // a money amount is replaced by the sample
  assert.equal(d.stickers[3].text, "5");
  assert.deepEqual(d.logos, [{ asset: 4, x: 0.2, y: 0.3, scale: 1, rot: 0 }]);
  assert.equal(cleanDesign({ stickers: Array.from({ length: 20 }, () => ({ kind: "tick" })) }).stickers.length, MAX_STICKERS);
});

test("cover text: counts are fine, figures that read as claims and contact details are not", () => {
  for (const ok of ["5", "3 FIXES", "NEW", "DAY 12", "👀"]) assert.equal(coverTextProblem(ok), null, ok);
  for (const bad of ["£10K", "10k", "3x", "50%", "7 figures", "GUARANTEED", "me@example.com", "07700 900123", "www.example.com"]) assert.ok(coverTextProblem(bad), bad);
});

test("the power word must be a word of the headline", () => {
  assert.equal(powerWord("WHY QUOTES DIE", "die"), "DIE");
  assert.equal(powerWord("WHY QUOTES DIE", "money"), "");
  assert.equal(powerWord("STOP DOING THIS!", "this"), "THIS");
});

test("an AI suggestion becomes a starting design with at most two stickers, placed inside the cover", () => {
  const d = suggestedDesign({ layout: "banner", style: "block", power_word: "steal", stickers: ["arrow", "nonsense", "circle", "tick"] }, "STEAL THIS SYSTEM");
  assert.equal(d.layout, "banner"); assert.equal(d.style, "block"); assert.equal(d.power, "STEAL");
  assert.deepEqual(d.stickers.map((s) => s.kind), ["arrow", "circle"]);
  assert.ok(d.stickers.every((s) => s.x > 0 && s.x < 1 && s.y > 0 && s.y < 1));
  assert.equal(suggestedDesign({}, "X").layout, "side");
  const tall = suggestedDesign({ layout: "split", stickers: ["cross", "tick"] }, "STOP", "9:16");
  assert.notDeepEqual(tall.stickers.map((s) => [s.x, s.y]), suggestedDesign({ layout: "split", stickers: ["cross", "tick"] }, "STOP").stickers.map((s) => [s.x, s.y]));   // placed for the shape of the cover
});

test("titles wrap on words", () => {
  assert.deepEqual(wrapTitle("WHY QUOTES DIE", 10), ["WHY QUOTES", "DIE"]);
  assert.deepEqual(wrapTitle("STOP", 10), ["STOP"]);
  assert.deepEqual(wrapTitle("AUTOMATICALLY CHASED", 8), ["AUTOMATICALLY", "CHASED"]);
  assert.deepEqual(wrapTitle("  ", 8), []);
});

test("an uploaded logo is identified by its bytes", () => {
  assert.equal(sniffImage(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0])), "image/png");
  assert.equal(sniffImage(new Uint8Array([0xff, 0xd8, 0xff, 0xe0])), "image/jpeg");
  assert.equal(sniffImage(new TextEncoder().encode("RIFF0000WEBPVP8 ")), "image/webp");
  assert.equal(sniffImage(new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'><script/></svg>")), null);
});
