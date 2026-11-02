import test from "node:test";
import assert from "node:assert/strict";
import { ALLOWED_POST_KEYS, buildInputs, checkBudget, cleanHandle, estimateCostUsd, extractCta, normaliseInstagramProfile, normaliseInstagramReels, normaliseTikTok, normaliseYouTube, outlierScores, parseCreatorSettings, toCsv } from "../lib/creatorMath.ts";

const SECRET = "SECRET_PERSONAL_DATA";
const actors = { tiktok: { actor: "a", per_item_usd: 0.003 }, instagram_reels: { actor: "b", per_item_usd: 0.0026, start_usd: 0.001 }, instagram_profile: { actor: "c", per_item_usd: 0.0026 }, youtube: { actor: "d", per_item_usd: 0.004 } };

test("TikTok: named public fields are kept, everything else is dropped", () => {
  const item = { id: "7301", text: "Comment GUESTS and I'll send it #ai #Automation", createTimeISO: "2026-10-20T10:00:00.000Z", webVideoUrl: "https://www.tiktok.com/@x/video/7301",
    playCount: 12000, diggCount: 900, commentCount: 40, shareCount: 12, collectCount: 70, videoMeta: { duration: 31 }, musicMeta: { musicName: "Song", musicOriginal: false }, hashtags: [{ name: "ai" }, { name: "Automation" }],
    authorMeta: { nickName: "Ex Creator", signature: "I help X", bioLink: "https://example.com/book", fans: 5000, verified: false, privateAccount: false },
    mentions: [`@${SECRET}`], latestComments: [{ text: SECRET, user: SECRET }], commenters: [SECRET], taggedUsers: [SECRET] };
  const r = normaliseTikTok([item]);
  assert.equal(r.posts.length, 1);
  const p = r.posts[0];
  assert.deepEqual(Object.keys(p).sort(), [...ALLOWED_POST_KEYS].sort());
  assert.deepEqual([p.externalId, p.views, p.saves, p.durationS, p.hashtags, p.ctaKeyword, p.postedAt], ["tiktok:7301", 12000, 70, 31, ["ai", "automation"], "GUESTS", "2026-10-20T10:00:00.000Z"]);
  assert.deepEqual(r.profile, { displayName: "Ex Creator", bio: "I help X", linkInBio: "https://example.com/book", followers: 5000, verified: false });
  assert.ok(!JSON.stringify(r).includes(SECRET));
});
test("Instagram reels: comments, mentions and tagged people never come through; hidden likes become null", () => {
  const item = { shortCode: "ABC", url: "https://www.instagram.com/reel/ABC/", caption: "DM the word QUOTE", timestamp: "2026-10-21T09:00:00.000Z", videoDuration: 22.4, videoPlayCount: 5000, likesCount: -1, commentsCount: 30,
    hashtags: ["ai"], musicInfo: { song_name: "Original audio" }, firstComment: SECRET, latestComments: [{ ownerUsername: SECRET, text: SECRET }], mentions: [SECRET], taggedUsers: [{ username: SECRET }], ownerUsername: SECRET };
  const r = normaliseInstagramReels([item, { caption: "no url or id" }]);
  assert.equal(r.posts.length, 1);
  assert.deepEqual(Object.keys(r.posts[0]).sort(), [...ALLOWED_POST_KEYS].sort());
  assert.deepEqual([r.posts[0].likes, r.posts[0].views, r.posts[0].durationS, r.posts[0].ctaKeyword, r.posts[0].postType], [null, 5000, 22, "QUOTE", "reel"]);
  assert.ok(!JSON.stringify(r).includes(SECRET));
});
test("Instagram profile: bio, link and followers only; a private account is refused", () => {
  const ok = normaliseInstagramProfile([{ fullName: "Ex", biography: "Helping X", externalUrl: "https://example.com", followersCount: 900, verified: true, private: false, relatedProfiles: [SECRET], followers: [SECRET] }]);
  assert.deepEqual(ok.profile, { displayName: "Ex", bio: "Helping X", linkInBio: "https://example.com", followers: 900, verified: true });
  assert.ok(!JSON.stringify(ok).includes(SECRET));
  assert.deepEqual(normaliseInstagramProfile([{ private: true, biography: "x" }]), { profile: null, private: true });
  assert.deepEqual(normaliseTikTok([{ authorMeta: { privateAccount: true }, text: "x" }]), { posts: [], profile: null, private: true });
});
test("YouTube: shorts normalised, clock durations understood", () => {
  const r = normaliseYouTube([{ id: "vid123456", url: "https://www.youtube.com/shorts/vid123456", title: "Stop doing this", date: "2026-10-22", duration: "00:00:45", viewCount: 800, likes: 30, commentsCount: 3, type: "shorts", channelName: "Chan", numberOfSubscribers: 1200, comments: [SECRET] }]);
  assert.deepEqual([r.posts[0].durationS, r.posts[0].postType, r.profile.followers], [45, "shorts", 1200]);
  assert.ok(!JSON.stringify(r).includes(SECRET));
});
test("bad urls are refused (javascript:, data:)", () => {
  assert.equal(normaliseTikTok([{ id: "1", webVideoUrl: "javascript:alert(1)", text: "x" }]).posts.length, 0);
});
test("calls to action are found, ordinary words are not", () => {
  assert.equal(extractCta("Comment GUESTS and I'll send you the build"), "GUESTS");
  assert.equal(extractCta("dm me \"QUOTE\" to get it"), "QUOTE");
  assert.equal(extractCta("Type AUTOMATE below"), "AUTOMATE");
  assert.equal(extractCta("Send me a message for the details"), null);
  assert.equal(extractCta("comment below what you think"), null);
  assert.equal(extractCta(null), null);
});
test("handles: from a name, an @name or a link, on the right site", () => {
  assert.deepEqual(cleanHandle("instagram", "@Some.Creator"), { handle: "some.creator", profileUrl: "https://www.instagram.com/some.creator" });
  assert.deepEqual(cleanHandle("tiktok", "https://www.tiktok.com/@creator_1?lang=en"), { handle: "creator_1", profileUrl: "https://www.tiktok.com/@creator_1" });
  assert.equal(cleanHandle("youtube", "https://www.youtube.com/@Chan-Name").handle, "chan-name");
  assert.deepEqual(cleanHandle("linkedin", "https://www.linkedin.com/in/some-person").handle, "some-person");
  assert.ok("error" in cleanHandle("instagram", "https://www.tiktok.com/@x"));
  assert.ok("error" in cleanHandle("instagram", "not a handle!"));
  assert.ok("error" in cleanHandle("instagram", ""));
  assert.ok("error" in cleanHandle("myspace", "x"));
});
test("Apify inputs: comments, followers, downloads, transcripts and AI add-ons are always off", () => {
  const [t] = buildInputs("tiktok", "x", 20);
  assert.deepEqual([t.input.commentsPerPost, t.input.maxFollowersPerProfile, t.input.shouldDownloadVideos, t.input.downloadSubtitlesOptions, t.input.resultsPerPage], [0, 0, false, "NEVER_DOWNLOAD_SUBTITLES", 20]);
  const [reels, prof] = buildInputs("instagram", "x", 20);
  assert.deepEqual([reels.input.includeTranscript, reels.input.includeDownloadedVideo, reels.input.includeSharesCount, prof.input.includeAboutSection], [false, false, false, false]);
  const [y] = buildInputs("youtube", "x", 20);
  assert.deepEqual([y.input.transcriptionAndSubtitle, y.input.aiVideoSummary, y.input.maxResultsShorts], ["NONE", false, 20]);
  assert.deepEqual(buildInputs("linkedin", "x", 20), []); // LinkedIn is never scraped
});
test("cost estimate and budget", () => {
  assert.equal(estimateCostUsd("tiktok", 20, actors), 0.06);
  assert.equal(estimateCostUsd("instagram", 20, actors), 0.0556); // 20 reels + start fee + 1 profile
  assert.equal(estimateCostUsd("youtube", 20, actors), 0.08);
  assert.equal(estimateCostUsd("linkedin", 20, actors), 0);
  assert.equal(checkBudget(0.1, 0.5, 0.06, 0.3, 2).ok, true);
  assert.match(checkBudget(0.28, 0.5, 0.06, 0.3, 2).reason, /daily limit of \$0\.30/);
  assert.match(checkBudget(0.0, 1.97, 0.06, 0.3, 2).reason, /monthly limit of \$2\.00/);
});
test("outliers: views over the creator's median, only for old-enough posts, and only with enough history", () => {
  const now = new Date("2026-11-02T12:00:00Z");
  const old = (id, views, days) => ({ id, views, postedAt: new Date(now - days * 86_400_000).toISOString() });
  const posts = [old("a", 100, 10), old("b", 100, 9), old("c", 100, 8), old("d", 100, 7), old("e", 100, 6), old("f", 100, 5), old("g", 100, 4), old("h", 400, 3), old("new", 900, 0.5), { id: "nov", views: null, postedAt: old("x", 1, 5).postedAt }];
  const s = outlierScores(posts, now, { minAgeHours: 48, minBaseline: 8 });
  assert.equal(s.get("h"), 4);
  assert.equal(s.get("a"), 1);
  assert.equal(s.get("new"), null);   // too new to judge
  assert.equal(s.get("nov"), null);   // no view count
  assert.equal([...outlierScores(posts, now, { minAgeHours: 48, minBaseline: 9 }).values()].every((v) => v === null), true); // not enough history
});
test("settings fall back to safe defaults", () => {
  const s = parseCreatorSettings({ posts_per_creator: "lots", outlier_threshold: 0.5 });
  assert.deepEqual([s.postsPerCreator, s.threshold, s.minAgeHours, s.minBaseline, s.maxActive], [20, 3, 48, 8, 25]);
  assert.equal(parseCreatorSettings({ posts_per_creator: 500 }).postsPerCreator, 100);
});
test("CSV: quoted properly and spreadsheet formulas are neutralised", () => {
  const csv = toCsv(["a", "b"], [["=HYPERLINK(\"x\")", "plain, with comma"], ["@cmd", 'say "hi"\nnew line']]);
  assert.equal(csv, 'a,b\r\n"\'=HYPERLINK(""x"")","plain, with comma"\r\n\'@cmd,"say ""hi""\nnew line"\r\n');
});
