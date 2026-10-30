import test from "node:test";
import assert from "node:assert/strict";
import { assembleOfferDrafts, checkOfferParts } from "../lib/outreachOfferMath.ts";

const good = { subject: "Monday bookings email", body: "I'd set up a one-page email each Monday showing the week's bookings and reviews. I'd start with one week of your totals. Could we have 15 minutes?", follow_up: "A quick nudge on the Monday bookings email idea.", social: "I'd set up a Monday email of your bookings and reviews, starting with one week of totals. Could we have 15 minutes?" };

test("clean parts pass, and links, addresses and tags are stripped rather than kept", () => {
  assert.deepEqual(checkOfferParts(good).problems, []);
  const r = checkOfferParts({ ...good, body: good.body + " See https://x.co.uk or mail a@b.co.uk <b>now</b>" });
  assert.ok(!/https|@|<b>/.test(r.parts.body));
});
test("numbers, boasts, long text and placeholders are caught", () => {
  const p = (patch) => checkOfferParts({ ...good, ...patch }).problems.join(" | ");
  assert.match(p({ body: "We save you 30 hours a week. Could we have 15 minutes?" }), /contains a number/);
  assert.match(p({ body: "A proven approach. Could we have 15 minutes?" }), /boast/);
  assert.match(p({ body: "Great idea! Could we have 15 minutes?" }), /boast/);
  assert.match(p({ subject: "x".repeat(31) }), /subject is 31/);
  assert.match(p({ body: "word ".repeat(80) }), /body is 80/);
  assert.match(p({ social: "Hi {{name}}" }), /placeholder/);
  assert.match(p({ subject: "" }), /subject is empty/);
  assert.ok(checkOfferParts(null).problems.length > 0);
});
test("greeting, sign-off and opt-out lines come from the code", () => {
  const d = assembleOfferDrafts(good, { firstName: "Alex", company: "Oakwood Dental", opener: "I saw you now offer online booking.", name: "Bradley", business: "CLRS Web" });
  assert.match(d.first.body, /^Hi Alex,\n\nI saw you now offer online booking\. I'd set up/);
  assert.match(d.first.body, /Bradley, CLRS Web\nReply "no" and I won't email again\.$/);
  assert.match(d.followup.body, /reply "no" and I won't email again\./);
  assert.match(d.social.body, /I'm Bradley at CLRS Web\./);
  assert.match(d.social.body, /Reply "no" and I won't message again\.$/);
  assert.equal(d.followup.subject, "Re: Monday bookings email");
});
test("without a decision-maker or an opener it greets the company and leaves placeholders; missing names stay as placeholders", () => {
  const d = assembleOfferDrafts(good, { firstName: null, company: "Oakwood Dental", opener: null, name: null, business: null });
  assert.match(d.first.body, /^Hi Oakwood Dental team,/);
  assert.match(d.first.body, /\{\{specific thing on their site\}\}/);
  assert.match(d.first.body, /\{\{your name\}\}, \{\{your business\}\}/);
});

test("a greeting the AI added is dropped, and the text after the code's greeting starts in lower case", () => {
  const r = checkOfferParts({ ...good, follow_up: "Hi there, A gentle nudge on the idea.", social: "Hello, I set up a Monday email. Could we have 15 minutes?" });
  assert.equal(r.parts.follow_up, "a gentle nudge on the idea.");
  assert.equal(r.parts.social, "I set up a Monday email. Could we have 15 minutes?");
  const d = assembleOfferDrafts(r.parts, { firstName: "Alex", company: "X", opener: null, name: "B", business: "C" });
  assert.match(d.followup.body, /^Hi Alex, a gentle nudge on the idea\./);
  assert.equal(checkOfferParts({ ...good, social: "I'd set up a Monday email. Could we have 15 minutes?" }).parts.social.startsWith("I'd"), true);
});
