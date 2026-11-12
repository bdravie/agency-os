// The post-purchase page must stay private: noindex, unguessable address, no link to it from other pages, no sitemap, and its files present.
// Reads the built site, so run `npm run build` first; skips when dist/ is missing.
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";

const dist = new URL("../dist/", import.meta.url);
const built = existsSync(dist);
const pages = built ? readdirSync(dist).filter((f) => /^thanks-[a-z0-9]{8,}\.html$/.test(f)) : [];

test("exactly one thanks page with an unguessable address", { skip: !built }, () => {
  assert.equal(pages.length, 1);
  assert.ok(!existsSync(new URL("thank-you.html", dist)), "/thank-you must not exist");
});

test("the thanks page is noindex and has no canonical link to the home page", { skip: !built || !pages.length }, () => {
  const html = readFileSync(new URL(pages[0], dist), "utf8");
  assert.match(html, /<meta name="robots" content="[^"]*noindex/);
  assert.doesNotMatch(html, /rel="canonical"/);
});

test("no other page links to it, and there is no sitemap or robots.txt naming it", { skip: !built || !pages.length }, () => {
  const slug = pages[0].replace(/\.html$/, "");
  for (const f of readdirSync(dist).filter((f) => f.endsWith(".html") && f !== pages[0])) {
    assert.ok(!readFileSync(new URL(f, dist), "utf8").includes(slug), `${f} links to the thanks page`);
  }
  assert.ok(!readdirSync(dist).some((f) => /sitemap/i.test(f)), "a sitemap exists; make sure the thanks page is excluded");
  if (existsSync(new URL("robots.txt", dist))) assert.ok(!readFileSync(new URL("robots.txt", dist), "utf8").includes(slug), "robots.txt reveals the address");
});

test("every download link points at a file that were built, with the page's suffix", { skip: !built || !pages.length }, () => {
  const html = readFileSync(new URL(pages[0], dist), "utf8");
  const hrefs = [...html.matchAll(/href="(\/files\/[^"]+)"/g)].map((m) => m[1]);
  assert.equal(hrefs.length, 3); // PDF zip, Notion import zip, Notion guide
  for (const h of hrefs) assert.ok(existsSync(new URL("." + h, dist)), `${h} is missing from the build`);
});

test("the headers file marks the page and its files noindex", { skip: !built }, () => {
  const h = readFileSync(new URL("_headers", dist), "utf8");
  assert.match(h, /\/thanks-\*\s+X-Robots-Tag: noindex/);
  assert.match(h, /\/files\/\*\s+X-Robots-Tag: noindex/);
});
