import test from "node:test";
import assert from "node:assert/strict";
import { anonymiseSpeakers, looksLikeSubtitles, maskContacts, parseSubtitles, prepareTranscript, verifyQuote } from "../lib/transcript.ts";

const VTT = `WEBVTT

NOTE recorded with consent

1
00:00:01.000 --> 00:00:04.000
<v Bradley Dravie>Thanks for joining. Tell me about reporting.</v>

2
00:00:04.500 --> 00:00:09.000
<v Sarah Jones>It takes us about six hours every Monday,
and the numbers are often wrong.</v>

3
00:00:09.500 --> 00:00:12.000
<v Sarah Jones>Honestly the price worries me.</v>

4
00:00:12.500 --> 00:00:14.000
<v Bradley Dravie>Understood.</v>
`;

test("VTT becomes plain speaker lines, merging a speaker's consecutive cues", () => {
  const t = parseSubtitles(VTT);
  assert.equal(t.split("\n").length, 3);
  assert.ok(t.startsWith("Bradley Dravie: Thanks for joining."));
  assert.ok(t.includes("Sarah Jones: It takes us about six hours every Monday, and the numbers are often wrong. Honestly the price worries me."));
  assert.ok(!t.includes("-->") && !t.includes("WEBVTT") && !t.includes("recorded with consent"));
});

test("Zoom-style 'Name: text' cues and SRT also work", () => {
  const zoom = "WEBVTT\n\n1\n00:00:01.000 --> 00:00:03.000\nSarah Jones: Hello there\n\n2\n00:00:03.500 --> 00:00:05.000\nBradley Dravie: Hi Sarah\n";
  assert.equal(parseSubtitles(zoom), "Sarah Jones: Hello there\nBradley Dravie: Hi Sarah");
  const srt = "1\n00:00:01,000 --> 00:00:03,000\nJust plain text\n";
  assert.equal(parseSubtitles(srt), "Just plain text");
  assert.ok(looksLikeSubtitles(srt) && looksLikeSubtitles("x", "call.vtt") && !looksLikeSubtitles("Hello there"));
});

test("emails and phone numbers are masked", () => {
  const r = maskContacts("Email me at jane.smith@acme.co.uk or ring 07700 900123 or +44 20 7946 0958. Budget is 5000.");
  assert.equal(r.masked, 3);
  assert.ok(!/@|07700|7946/.test(r.text) && r.text.includes("[email]") && r.text.includes("[phone]") && r.text.includes("Budget is 5000"));
});

test("speaker names become Me and Prospect, using your own name from the environment", () => {
  const r = anonymiseSpeakers("Bradley Dravie: Hi\nSarah Jones: Hello\nBradley Dravie: Tell me more\nSarah Jones: Sure", "Bradley");
  assert.equal(r.text, "Me: Hi\nProspect: Hello\nMe: Tell me more\nProspect: Sure");
  const three = anonymiseSpeakers("Alex Person: x\nBea Person: y\nCal Person: z\nAlex Person: x2\nBea Person: y2\nCal Person: z2", "Alex");
  assert.ok(three.text.includes("Me: x") && three.text.includes("Prospect 1: y") && three.text.includes("Prospect 2: z"));
  assert.equal(anonymiseSpeakers("Note: call me back\nthen more text", null).text, "Note: call me back\nthen more text");   // a one-off "Note:" is not a speaker
});

test("names said out loud are masked too, using the names from the speaker labels", () => {
  const r = anonymiseSpeakers("Bradley Dravie: Thanks for joining, Sarah.\nSarah Jones: Happy to, Bradley. Jones is my surname, by the way.\nBradley Dravie: Great.\nSarah Jones: Go on.", "Bradley");
  assert.ok(!/Sarah|Bradley|Jones|Dravie/.test(r.text), r.text);
  assert.ok(r.text.includes("Me: Thanks for joining, [name].") && r.text.includes("Prospect: Happy to, [name]."));
  assert.ok(r.text.includes("Go on."));   // ordinary words are untouched
});

test("prepareTranscript runs the whole pipeline and never keeps names or contact details", () => {
  const p = prepareTranscript(VTT + "\n5\n00:00:15.000 --> 00:00:18.000\n<v Sarah Jones>Email sarah@acme.co.uk please.</v>\n", { filename: "call.vtt", ownName: "Bradley Dravie" });
  assert.equal(p.source, "vtt");
  assert.ok(!/Sarah|Bradley|sarah@/.test(p.text), p.text);
  assert.ok(p.text.includes("Me:") && p.text.includes("Prospect:") && p.masked === 1);
  const notes = prepareTranscript("Call with Sarah. She said 07700 900123.", { asNotes: true });
  assert.equal(notes.source, "notes");
  assert.ok(notes.text.includes("Sarah") && notes.text.includes("[phone]"));     // notes keep their words, contact details are still masked
  assert.equal(prepareTranscript("x".repeat(90_000), {}).tooLong, true);
});

test("a quote only counts if it really appears in the transcript", () => {
  const t = "Prospect: It takes us about six hours every Monday, and the numbers are often wrong.";
  assert.equal(verifyQuote("six hours every Monday", t), "six hours every Monday");
  assert.equal(verifyQuote("It takes us ABOUT six hours every monday!", t) !== null, true);   // case and punctuation ignored
  assert.equal(verifyQuote("we spend twenty hours a week", t), null);                        // invented
  assert.equal(verifyQuote("hours", t), null);                                                // too short to mean anything
  assert.equal(verifyQuote(null, t), null);
});
