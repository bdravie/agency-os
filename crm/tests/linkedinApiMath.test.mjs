import test from "node:test";
import assert from "node:assert/strict";
import { apiVersion, authorizeUrl, dailyCap, documentTitle, escapeLittle, explainError, mediaKind, postUrlFromUrn, redirectUri, toCommentary, tokenUsable } from "../lib/linkedinApiMath.ts";
import { cleanPostUrl } from "../lib/contentMath.ts";

test("settings fall back to safe defaults", () => {
  assert.equal(apiVersion({}), "202610");
  assert.equal(apiVersion({ LINKEDIN_API_VERSION: "202611" }), "202611");
  assert.equal(apiVersion({ LINKEDIN_API_VERSION: "2026-11" }), "202610");
  assert.equal(dailyCap({}), 3);
  assert.equal(dailyCap({ LINKEDIN_DAILY_CAP: "5" }), 5);
  assert.equal(dailyCap({ LINKEDIN_DAILY_CAP: "500" }), 3);
  assert.equal(redirectUri({}), "http://127.0.0.1:3000/api/linkedin/callback");
});

test("the sign-in link asks only to know who you are and to post as you", () => {
  const u = new URL(authorizeUrl("abc", { LINKEDIN_CLIENT_ID: "id123" }));
  assert.equal(u.origin + u.pathname, "https://www.linkedin.com/oauth/v2/authorization");
  assert.equal(u.searchParams.get("scope"), "openid profile w_member_social");
  assert.equal(u.searchParams.get("state"), "abc");
  assert.equal(u.searchParams.get("client_id"), "id123");
});

test("post text is escaped for LinkedIn and hashtags become hashtags", () => {
  assert.equal(escapeLittle("a (b) [c] {d} <e> @f #g *h* _i_ ~j~ \\k |l"), "a \\(b\\) \\[c\\] \\{d\\} \\<e\\> \\@f \\#g \\*h\\* \\_i\\_ \\~j\\~ \\\\k \\|l");
  assert.equal(toCommentary("Quotes go cold (often).\n\n#trades #small_business"), "Quotes go cold \\(often\\).\n\n{hashtag|\\#|trades} {hashtag|\\#|small\\_business}");
  assert.equal(toCommentary("I code in C# and use #1 tips"), "I code in C\\# and use {hashtag|\\#|1} tips");
  assert.equal(toCommentary("#start of line"), "{hashtag|\\#|start} of line");
  assert.equal(toCommentary("plain"), "plain");
});

test("a post's address comes only from a LinkedIn post id, and the existing link rules accept it", () => {
  const url = postUrlFromUrn("urn:li:share:6844785523593134080");
  assert.equal(url, "https://www.linkedin.com/feed/update/urn:li:share:6844785523593134080");
  assert.equal(postUrlFromUrn("urn:li:ugcPost:68447855235931240"), "https://www.linkedin.com/feed/update/urn:li:ugcPost:68447855235931240");
  assert.equal(postUrlFromUrn("urn:li:person:abc"), null);
  assert.equal(postUrlFromUrn(null), null);
  assert.deepEqual(cleanPostUrl("linkedin", url), { url });
});

test("only a PNG or a PDF within size can be attached, told by its bytes", () => {
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
  const pdf = new TextEncoder().encode("%PDF-1.7 rest");
  assert.deepEqual(mediaKind(png), { kind: "image" });
  assert.deepEqual(mediaKind(pdf), { kind: "document" });
  assert.match(mediaKind(new TextEncoder().encode("<svg></svg>")).error, /Only the post's own image/);
  const big = new Uint8Array(9 * 1024 * 1024); big.set(png);
  assert.match(mediaKind(big).error, /too large/);
});

test("document titles, token expiry and error wording", () => {
  assert.equal(documentTitle("Stop quotes going cold: 3 habits!"), "Stop quotes going cold 3 habits!.pdf");
  assert.equal(documentTitle("***"), "Carousel.pdf");
  const now = new Date("2026-11-12T12:00:00Z");
  assert.equal(tokenUsable("2026-11-12T12:10:00Z", now), true);
  assert.equal(tokenUsable("2026-11-12T12:03:00Z", now), false);
  assert.equal(tokenUsable(null, now), false);
  assert.match(explainError(401, {}), /Connect LinkedIn again/);
  assert.match(explainError(403, { message: "Not enough permissions" }), /Share on LinkedIn.*Not enough permissions/);
  assert.match(explainError(400, { message: "Version 202501 is not active" }), /LINKEDIN_API_VERSION/);
  assert.match(explainError(500, {}), /\(500\)/);
});
