import test from "node:test";
import assert from "node:assert/strict";
import { allowedSourceHost, excerptAround, looksPersonal, mentionsCompany, mentionsPerson, verifyPoints } from "../lib/rapportMath.ts";

test("social platforms and people-finder sites are never allowed as sources", () => {
  for (const u of ["https://www.linkedin.com/in/x", "https://facebook.com/x", "https://x.com/a", "https://www.instagram.com/p/1", "https://uk.linkedin.com/in/a", "https://www.youtube.com/watch?v=1", "https://www.companieshouse.gov.uk/x"]) assert.equal(allowedSourceHost(u), false, u);
  for (const u of ["https://www.dentistry.co.uk/news/a", "https://oakwood-dental.co.uk/team", "https://podcasts.example.com/ep1"]) assert.equal(allowedSourceHost(u), true, u);
  assert.equal(allowedSourceHost("not a url"), false);
});
test("a page must name the person in full, and the company too", () => {
  assert.equal(mentionsPerson("Meet Dr Alex Example, our principal dentist", "Alex", "Example"), true);
  assert.equal(mentionsPerson("Alex runs the clinic. Example Dental is in Leeds.", "Alex", "Example"), false);
  assert.equal(mentionsCompany("Alex Example of Swinnow Dental said", "Swinnow Dental", null), true);
  assert.equal(mentionsCompany("Alex Example, a golfer from Devon", "Swinnow Dental", "swinnowdental.co.uk"), false);
  assert.equal(mentionsCompany("see swinnowdental.co.uk", "Swinnow Dental", "www.swinnowdental.co.uk"), true);
});
test("the excerpt is the stretch of page around the name", () => {
  const page = "x ".repeat(2000) + "Dr Alex Example trained in Sheffield and opened the practice in 2019. " + "y ".repeat(2000);
  const e = excerptAround(page, "Alex", "Example", 200);
  assert.match(e, /trained in Sheffield/); assert.ok(e.length < 700);
});
test("anything personal is spotted", () => {
  assert.equal(looksPersonal("He lives with his wife and two children"), true);
  assert.equal(looksPersonal("She was treated for cancer last year"), true);
  assert.equal(looksPersonal("Trained at the University of Sheffield and opened the practice in 2019"), false);
});

const sources = [{ id: 1, url: "https://oakwood.example/team", title: "Our team", text: "Dr Alex Example trained at the University of Sheffield and opened Oakwood Dental in 2019. Alex also spoke at the BDA conference on digital booking." },
  { id: 2, url: "https://news.example/a", title: "News", text: "Alex Example enjoys a family holiday each year with his wife." }];
const good = { kind: "background", text: "Trained at Sheffield and opened the practice in 2019.", opener: "I saw on your site that you opened Oakwood in 2019 after training in Sheffield.", source: 1, quote: "trained at the University of Sheffield and opened Oakwood Dental in 2019" };
test("a point survives only if the quote is on the page and it is professional", () => {
  assert.equal(verifyPoints({ points: [good] }, sources).points.length, 1);
  assert.equal(verifyPoints({ points: [{ ...good, quote: "won the national dentist of the year award in 2021" }] }, sources).points.length, 0);
  assert.equal(verifyPoints({ points: [{ ...good, source: 9 }] }, sources).points.length, 0);
  assert.match(verifyPoints({ points: [{ ...good, source: 2, quote: "enjoys a family holiday each year with his wife" }] }, sources).dropped[0], /personal/);
  assert.equal(verifyPoints({ points: [{ ...good, opener: "Wow, great practice!" }] }, sources).points.length, 0);
  assert.equal(verifyPoints({ points: [{ ...good, kind: "gossip" }] }, sources).points.length, 0);
  assert.deepEqual(verifyPoints("rubbish", sources), { points: [], dropped: [] });
});
test("the same source and kind is not listed twice, and the list is capped at four", () => {
  const two = verifyPoints({ points: [good, { ...good, text: "again" }] }, sources);
  assert.equal(two.points.length, 1);
});
