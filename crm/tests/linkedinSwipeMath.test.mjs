import test from "node:test";
import assert from "node:assert/strict";
import { cleanLinkedInPostUrl, cleanSwipe, cleanSwipeText, linkedinTables, wordBand } from "../lib/linkedinSwipeMath.ts";
import { dayPart, weekdayOf } from "../lib/insightsMath.ts";

const TODAY = "2026-11-12";
const TEXT = "Most quotes go cold because nobody owns the follow-up, and here is what I changed.";

test("post links are https LinkedIn post addresses, tracking dropped, keyed by activity number", () => {
  const a = cleanLinkedInPostUrl("https://www.linkedin.com/posts/someone_quotes-activity-7212345678901234567-AbCd?utm_source=share&utm_medium=member_desktop");
  assert.deepEqual(a, { url: "https://www.linkedin.com/posts/someone_quotes-activity-7212345678901234567-AbCd", externalId: "linkedin:7212345678901234567" });
  const b = cleanLinkedInPostUrl("https://linkedin.com/feed/update/urn:li:activity:7212345678901234567/");
  assert.equal(b.externalId, "linkedin:7212345678901234567");
  assert.match(cleanLinkedInPostUrl("http://www.linkedin.com/posts/x-activity-7212345678901234567").error, /not a LinkedIn post/);
  assert.match(cleanLinkedInPostUrl("https://www.linkedin.com/in/someone").error, /one LinkedIn post/);
  assert.match(cleanLinkedInPostUrl("https://example.com/posts/x").error, /not a LinkedIn post/);
  assert.match(cleanLinkedInPostUrl("not a link").error, /Copy link/);
});

test("pasted text loses contact details and @mentions of other people", () => {
  const t = cleanSwipeText("Thanks @Jane Smith and @acme_ltd for this.\r\n\r\n\r\nEmail me at someone@example.com or call 07700 900123.");
  assert.doesNotMatch(t, /Jane|acme_ltd|someone@example\.com|07700/);
  assert.match(t, /^Thanks and for this\.\n\nEmail me at/);
});

test("a swipe entry is checked and cleaned", () => {
  const ok = cleanSwipe({ url: "https://www.linkedin.com/posts/x-activity-7212345678901234567", text: TEXT, type: "carousel", reactions: "1,204", comments: " 87 ", reposts: "", postedOn: "2026-11-01" }, TODAY);
  assert.equal(ok.type, "carousel");
  assert.deepEqual([ok.reactions, ok.comments, ok.reposts, ok.postedOn], [1204, 87, null, "2026-11-01"]);
  assert.equal(cleanSwipe({ ...ok, url: ok.url, text: TEXT, type: "hologram", reactions: "", comments: "", reposts: "", postedOn: "" }, TODAY).type, "text");
  const base = { url: ok.url, text: TEXT, type: "text", reactions: "", comments: "", reposts: "", postedOn: "" };
  assert.match(cleanSwipe({ ...base, text: "too short" }, TODAY).error, /post's text/);
  assert.match(cleanSwipe({ ...base, reactions: "1.2K" }, TODAY).error, /whole counts/);
  assert.match(cleanSwipe({ ...base, postedOn: "2026-12-01" }, TODAY).error, /future/);
});

test("length bands", () => {
  assert.deepEqual([wordBand(40), wordBand(150), wordBand(250), wordBand(400)], ["Under 100 words", "100 to 199 words", "200 to 299 words", "300 words or more"]);
});

test("LinkedIn tables group by image, length, day, time and opening A/B", () => {
  const post = (i, o) => ({ postId: i, contentId: i, title: `P${i}`, multiple: 1, views72: 100, postedAt: "2026-11-03T08:10:00Z", url: "", words: 150, imageKind: "quote", hookUsed: "A line", hook: "A line", hookAlt: "B line", niche: "trades", ...o });
  const posts = [post(1, { multiple: 2 }), post(2, { multiple: 1.5 }), post(3, { multiple: 1, hookUsed: "B line" }), post(4, { imageKind: null, hookAlt: null, words: 60 }), post(5, { imageKind: "video", words: null, hookAlt: null })];
  const t = linkedinTables(posts, weekdayOf, dayPart, (k) => (k ? `Image: ${k}` : "No image"));
  const g = (title) => t.find((x) => x.title === title).groups;
  assert.deepEqual(g("Image")[0], { key: "Image: quote", n: 3, median: 1.5, thin: false });
  assert.deepEqual(g("Image").slice(1).map((x) => [x.key, x.n, x.thin]).sort(), [["Image: video", 1, true], ["No image", 1, true]]);
  assert.equal(g("Image")[0].median, 1.5);
  assert.deepEqual(g("Opening A against B").map((x) => [x.key, x.n]), [["Opening A", 2], ["Opening B", 1]]);
  assert.deepEqual(g("Length").map((x) => x.key).sort(), ["100 to 199 words", "Under 100 words", "Video"]);
  assert.equal(g("Weekday posted")[0].key, "Tuesday");
  assert.deepEqual(linkedinTables([], weekdayOf, dayPart, () => "x"), []);
});
