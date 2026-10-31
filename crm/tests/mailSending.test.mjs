import test from "node:test";
import assert from "node:assert/strict";
import { decryptToken, encryptToken } from "../lib/mailCrypto.ts";
import { buildRaw, encodeHeader, isEmail } from "../lib/mime.ts";
import { bodyText, isAutoReply, looksLikeOptOut, parseAddress, parseMessage, stripQuoted } from "../lib/replyMath.ts";
import { contentProblems, remainingToday, sequenceProblem } from "../lib/sendRules.ts";

const SECRET = "x".repeat(40);
const b64u = (s) => Buffer.from(s, "utf8").toString("base64url");
const decodeRaw = (raw) => Buffer.from(raw, "base64url").toString("utf8");

test("a saved token round-trips, is not readable as saved, and fails with a different secret or if tampered with", () => {
  const blob = encryptToken("1//refresh-token", SECRET);
  assert.ok(!blob.includes("refresh-token"));
  assert.equal(decryptToken(blob, SECRET), "1//refresh-token");
  assert.notEqual(encryptToken("1//refresh-token", SECRET), blob);   // fresh random IV each time
  assert.throws(() => decryptToken(blob, "y".repeat(40)), /Connect the mailbox again/);
  const parts = blob.split(".");
  parts[3] = (parts[3][0] === "A" ? "B" : "A") + parts[3].slice(1);
  assert.throws(() => decryptToken(parts.join("."), SECRET), /Connect the mailbox again/);
  assert.throws(() => encryptToken("t", "short"), /32 characters/);
});

test("an email is plain text, base64 body, with the right headers", () => {
  const raw = decodeRaw(buildRaw({ from: { name: "Bradley", email: "brad@getclrsweb.uk" }, to: "info@example.com", subject: "Quick idea", body: "Hi,\n\nReply \"no\" and I won't email again.", date: new Date("2026-11-03T09:00:00Z") }));
  const [head, body] = raw.split("\r\n\r\n");
  assert.match(head, /^From: "Bradley" <brad@getclrsweb.uk>/);
  assert.match(head, /\r\nTo: info@example.com\r\n/);
  assert.match(head, /\r\nSubject: Quick idea\r\n/);
  assert.match(head, /Content-Type: text\/plain; charset=UTF-8/);
  assert.equal(Buffer.from(body.replace(/\r\n/g, ""), "base64").toString("utf8"), "Hi,\r\n\r\nReply \"no\" and I won't email again.");
  assert.ok(!/text\/html/i.test(raw));
});

test("a line break in the subject, name or address cannot inject a header", () => {
  const base = { from: { name: "B", email: "a@b.co" }, to: "x@y.co", subject: "s", body: "b" };
  assert.throws(() => buildRaw({ ...base, subject: "Hi\r\nBcc: spy@evil.com" }), /line break/);
  assert.throws(() => buildRaw({ ...base, from: { name: "B\nBcc: x@y.co", email: "a@b.co" } }), /line break/);
  assert.throws(() => buildRaw({ ...base, to: "x@y.co\r\nBcc: z@y.co" }), /valid email/);
  assert.equal(isEmail("a b@c.co"), false);
  assert.equal(isEmail("a@c.co"), true);
});

test("non-ASCII subjects and names are encoded; long subjects are split", () => {
  assert.equal(encodeHeader("Plain subject"), "Plain subject");
  assert.match(encodeHeader("Café ☕ ideas"), /^=\?UTF-8\?B\?[A-Za-z0-9+/=]+\?=$/);
  assert.ok(encodeHeader("é".repeat(60)).split("\r\n ").length > 1);
  const raw = decodeRaw(buildRaw({ from: { name: "Zoë", email: "a@b.co" }, to: "x@y.co", subject: "Café", body: "ok" }));
  assert.match(raw, /^From: =\?UTF-8\?B\?/);
  assert.match(raw, /\r\nSubject: =\?UTF-8\?B\?/);
});

test("quoted text under a reply is dropped, whatever shape it takes", () => {
  assert.equal(stripQuoted("Yes please, call me.\n\nOn Mon, 3 Nov 2026 at 09:00, Bradley <brad@x.uk> wrote:\n> Hi\n> Reply no"), "Yes please, call me.");
  assert.equal(stripQuoted("Sounds good\nThanks\n\n> quoted"), "Sounds good\nThanks");
  assert.equal(stripQuoted("Not now.\n\n-----Original Message-----\nFrom: Bradley"), "Not now.");
  assert.equal(stripQuoted("Interested!\nOn Mon, 3 Nov 2026 at 09:00 Bradley Dravie <brad@x.uk>\nwrote:\n> hi"), "Interested!");
  assert.equal(stripQuoted("Just this."), "Just this.");
});

test("opt-out wording is flagged, genuine interest is not", () => {
  for (const t of ["no", "No.", "No thanks", "Stop", "unsubscribe", "Please remove me from your list", "Not interested, thanks", "no, we're all set", "Do not contact me again", "Please take me off"]) assert.ok(looksLikeOptOut(t), t);
  for (const t of ["Yes, tell me more", "Can we talk on Thursday?", "Not right now, but interesting. Try me in January.", "Who else have you worked with?", ""]) assert.ok(!looksLikeOptOut(t), t);
});

test("out-of-office and machine replies are recognised as automatic", () => {
  const o = { subject: "Re: hi", autoSubmitted: null, precedence: null, autoResponseSuppress: null, fromEmail: "a@b.co" };
  assert.equal(isAutoReply(o), false);
  assert.ok(isAutoReply({ ...o, autoSubmitted: "auto-replied" }));
  assert.equal(isAutoReply({ ...o, autoSubmitted: "no" }), false);
  assert.ok(isAutoReply({ ...o, precedence: "bulk" }));
  assert.ok(isAutoReply({ ...o, subject: "Automatic reply: hi" }));
  assert.ok(isAutoReply({ ...o, subject: "Out of office" }));
  assert.ok(isAutoReply({ ...o, fromEmail: "mailer-daemon@googlemail.com" }));
});

test("addresses parse with and without a display name", () => {
  assert.deepEqual(parseAddress('"Ada L" <Ada@Example.com>'), { name: "Ada L", email: "ada@example.com" });
  assert.deepEqual(parseAddress("Ada <ada@example.com>"), { name: "Ada", email: "ada@example.com" });
  assert.deepEqual(parseAddress("<ada@example.com>"), { name: null, email: "ada@example.com" });
  assert.deepEqual(parseAddress("ada@example.com"), { name: null, email: "ada@example.com" });
  assert.equal(parseAddress("not an address"), null);
  assert.equal(parseAddress(null), null);
});

test("a Gmail message becomes a reply: plain text preferred, html as a fallback, quote removed", () => {
  const msg = (parts, headers = []) => ({ id: "m1", threadId: "t1", internalDate: "1793696400000", payload: { mimeType: "multipart/alternative", headers: [{ name: "From", value: "Ada <ada@example.com>" }, { name: "Subject", value: "Re: Quick idea" }, ...headers], parts } });
  const plain = parseMessage(msg([{ mimeType: "text/html", body: { data: b64u("<p>html</p>") } }, { mimeType: "text/plain", body: { data: b64u("Yes please.\n\nOn Mon, 3 Nov 2026 at 09:00, B <b@x.uk> wrote:\n> hi") } }]));
  assert.equal(plain.text, "Yes please.");
  assert.equal(plain.fromEmail, "ada@example.com");
  assert.equal(plain.auto, false);
  assert.equal(plain.optOut, false);
  assert.equal(plain.receivedAt.toISOString(), "2026-11-03T09:00:00.000Z");
  const html = parseMessage(msg([{ mimeType: "text/html", body: { data: b64u("<div>Hello&nbsp;there<br>Thanks &amp; bye</div>") } }]));
  assert.equal(html.text, "Hello there\nThanks & bye");
  const no = parseMessage(msg([{ mimeType: "text/plain", body: { data: b64u("No thanks") } }]));
  assert.equal(no.optOut, true);
  const auto = parseMessage(msg([{ mimeType: "text/plain", body: { data: b64u("I am away. Not interested in emails while away") } }], [{ name: "Auto-Submitted", value: "auto-replied" }]));
  assert.equal(auto.auto, true);
  assert.equal(auto.optOut, false);   // an automatic reply never raises the opt-out flag
  assert.equal(parseMessage({ id: "x", threadId: "y", payload: { headers: [] } }), null);
  assert.equal(bodyText(undefined), "");
});

const good = { subject: "Quick idea", body: "Hi Sam,\n\nIdea.\n\nBradley, CLRS Web\nReply \"no\" and I won't email again.", senderName: "Bradley", businessName: "CLRS Web" };

test("an email is checked before sending: opt-out line, name, business, placeholders, subject", () => {
  assert.deepEqual(contentProblems(good), []);
  assert.deepEqual(contentProblems({ ...good, body: good.body.replace(/Reply "no"/, "Reply “no”") }), []);   // curly quotes from an editor are fine
  assert.match(contentProblems({ ...good, body: "Hi\nBradley CLRS Web" })[0], /opt-out/);
  assert.match(contentProblems({ ...good, body: good.body.replace("Bradley", "Someone") }).join(" "), /your name/);
  assert.match(contentProblems({ ...good, body: good.body.replace("CLRS Web", "X") }).join(" "), /business name/);
  assert.match(contentProblems({ ...good, body: good.body + " {{Loom link}}" }).join(" "), /placeholder/);
  assert.match(contentProblems({ ...good, subject: "  " })[0], /subject is empty/);
  assert.match(contentProblems({ ...good, subject: "x".repeat(121) })[0], /over 120/);
  assert.match(contentProblems({ ...good, subject: "a\nb" }).join(" "), /line break/);
});

test("one first email and one follow-up per address, in that order", () => {
  assert.equal(sequenceProblem("first", { first: 0, followup: 0 }), null);
  assert.match(sequenceProblem("first", { first: 1, followup: 0 }), /already/);
  assert.match(sequenceProblem("followup", { first: 0, followup: 0 }), /first email before/);
  assert.equal(sequenceProblem("followup", { first: 1, followup: 0 }), null);
  assert.match(sequenceProblem("followup", { first: 1, followup: 1 }), /already/);
});

test("the daily cap never goes below zero", () => {
  assert.equal(remainingToday(10, 3), 7);
  assert.equal(remainingToday(10, 10), 0);
  assert.equal(remainingToday(10, 14), 0);
});
