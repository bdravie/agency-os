import test from "node:test";
import assert from "node:assert/strict";
import { ALLOWED_POST_KEYS, normaliseInstagramProfile, normaliseInstagramReels } from "../lib/creatorMath.ts";

// Sample output copied from Apify's own documentation for the Instagram actors (apify/instagram-scraper README, read 2 Nov 2026),
// trimmed to the fields that matter. They include the personal data we must never keep: commenters, mentioned and tagged people.
const reelSample = {
  id: "3913028191006298064", type: "Video", shortCode: "DZN3mhZBQ_Q",
  caption: "The universe is full of clues hidden in light, and Webb has tools to find them.",
  hashtags: [], mentions: ["someoneelse"], url: "https://www.instagram.com/p/DZN3mhZBQ_Q/", commentsCount: 92, likesCount: 11481,
  timestamp: "2026-06-05T19:58:30.000Z", ownerFullName: "NASA Webb Telescope", ownerUsername: "nasawebb", ownerId: "549313808", isPinned: true, productType: "clips", videoDuration: 228,
  firstComment: "hi :)", latestComments: [{ id: "1", text: "hi :)", ownerUsername: "lina.mov1", timestamp: "2026-06-18T06:36:30.000Z", likesCount: 1 }],
  videoViewCount: 41365, videoPlayCount: 241820, taggedUsers: ["tagged_person"],
  musicInfo: { artist_name: "nasawebb", song_name: "Original audio", uses_original_audio: true },
};
const imagePostSample = {
  id: "3923124318436838545", type: "Image", shortCode: "DZxvMgyH8yR", caption: "Head to the link in bio. Comment GUESTS for more.", hashtags: [], mentions: ["carstenpeter"],
  url: "https://www.instagram.com/p/DZxvMgyH8yR/", commentsCount: 110, firstComment: "runnin up that hill", likesCount: 55952, timestamp: "2026-06-20T10:00:04.000Z", ownerUsername: "natgeo",
  latestComments: [{ text: "is bro in creative mode", ownerUsername: "csukitch" }],
};
const profileSample = {
  id: "242598499", username: "humansofny", fullName: "Humans of New York", biography: "New York City, one story at a time.",
  externalUrls: [{ title: "Join HONY's Patreon", url: "https://bit.ly/4tX4uZt" }], externalUrl: "https://bit.ly/4tX4uZt", followersCount: 12613771, followsCount: 738,
  isBusinessAccount: false, private: false, verified: true,
  latestPosts: [{ shortCode: "DPq5ZpJDZw9", caption: "Dear New York closes on October 19th.", latestComments: [{ text: "x", ownerUsername: "someone_private" }], videoViewCount: 1024817, taggedUsers: ["a_person"] }],
};

test("a real reel sample maps to the right fields, with plays as views, and no commenters or tagged people", () => {
  const r = normaliseInstagramReels([reelSample]);
  assert.equal(r.posts.length, 1);
  const p = r.posts[0];
  assert.deepEqual(Object.keys(p).sort(), [...ALLOWED_POST_KEYS].sort());
  assert.deepEqual(
    [p.externalId, p.url, p.views, p.likes, p.comments, p.durationS, p.sound, p.postType, p.postedAt, p.hashtags],
    ["instagram:DZN3mhZBQ_Q", "https://www.instagram.com/p/DZN3mhZBQ_Q/", 241820, 11481, 92, 228, "Original audio", "reel", "2026-06-05T19:58:30.000Z", []],
  );
  const dump = JSON.stringify(r);
  for (const secret of ["lina.mov1", "hi :)", "tagged_person", "someoneelse", "nasawebb", "549313808"]) assert.ok(!dump.includes(secret), `${secret} must not be kept`);
});
test("a feed post with no video numbers still saves safely (no views, so it is never scored as an outlier) and its call to action is found", () => {
  const p = normaliseInstagramReels([imagePostSample]).posts[0];
  assert.deepEqual([p.views, p.durationS, p.likes, p.ctaKeyword], [null, null, 55952, "GUESTS"]);
  const dump = JSON.stringify(p);
  for (const secret of ["csukitch", "runnin up that hill", "carstenpeter", "natgeo"]) assert.ok(!dump.includes(secret), `${secret} must not be kept`);
});
test("a real profile sample gives bio, link in bio, followers and verified, and ignores the latest posts and their commenters", () => {
  const r = normaliseInstagramProfile([profileSample]);
  assert.deepEqual(r.profile, { displayName: "Humans of New York", bio: "New York City, one story at a time.", linkInBio: "https://bit.ly/4tX4uZt", followers: 12613771, verified: true });
  const dump = JSON.stringify(r);
  for (const secret of ["someone_private", "a_person", "humansofny"]) assert.ok(!dump.includes(secret), `${secret} must not be kept`);
});
