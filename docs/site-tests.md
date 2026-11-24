# Public site and split tests (clrsweb.uk)

The static site lives in `site/` (Astro). A split test is a list in `config/experiments.yaml`; each version is a file `site/src/content/<letter>.json`. Cloudflare Pages Functions (`site/functions/`, logic and tests in `site/shared/worker.ts` and `site/tests/`) pick a version per visitor, count anonymous events in Cloudflare D1, and give the CRM totals on request. Results appear in the CRM at `/site-tests`.

## One-off setup (the owner does these, in order)
1. **Fill `site/src/content/site.json`**: the owner's full name and a physical address (`CHANGE ME`). `npm run build:release` in `site/` refuses to build while any placeholder remains. The company is not registered yet, so `companyNumber` stays empty and the site says "the trading name of" (a sole trader using a business name must show their own name and a geographic address). Once registered, add the number, change the address to the registered office and redeploy.
2. **Move DNS for clrsweb.uk to Cloudflare** exactly as `docs/hosting-plan.md` step 1 says (email records DNS-only; send a test email after).
3. **Create the database**: `cd site && npx wrangler login`, then `npx wrangler d1 create clrsweb-site-events`, paste the id into `site/wrangler.toml`, then `npx wrangler d1 execute clrsweb-site-events --remote --file=schema.sql`.
4. **Create the Pages project** (`npx wrangler pages project create clrsweb-site`), bind the D1 database as `DB` in the project's settings, and set the secret `npx wrangler pages secret put SITE_STATS_TOKEN` (32+ random characters; use the same value as `SITE_STATS_TOKEN` in the CRM `.env`, plus `SITE_URL=https://clrsweb.uk`).
5. **Deploy**: `cd site && npm run build:release && npx wrangler pages deploy dist`. Then attach `clrsweb.uk` to the project and redirect `www`.
6. **Apply the CRM table**: `npm run db:migrate` from the repo root (adds `site_experiment_stats`).
7. **Visit `https://clrsweb.uk/?me` once on every browser you use**, so your own visits are never counted.
8. **Connect Cal.com to Google Calendar** (conflict checking on, destination calendar set).

## Rules for building
- **Install on the machine that builds.** `site/` pins its own Node through the `node` package (Astro needs a newer one than the container has), and that copy and Astro's other native parts are made for one system. The Mac and the Linux container share this folder, so a `node_modules` installed on one gives `cannot execute binary file` on the other. Fix: `cd site && rm -rf node_modules && npm install`, then build. Deploy from the Mac. **After the 24 Nov 2026 redesign, run `npm install` in `site/` once**: it adds GSAP and the two new fonts.

## The page, the three questions and the blog (redesign, 14 Nov 2026)
- **Who it is for**: clinics, meaning dental practices and aesthetics clinics together (the two active niches, one offer). The three versions (`a`, `b`, `c`) are three angles on that offer: missed calls answered, a fuller diary, pressure off the front desk.
- **Look (minimal redesign, 24 Nov 2026)**: one plain clinical off-white background (plain Navy for visitors in dark mode), Archivo headings and Public Sans text, no cards, bands or shadows. The tokens are at the top of `site/src/styles/site.css`; Navy, Coral and Lagoon are the brand's, the rest belongs to this site. The menu is a plain line that scrolls away, and the Book a call button stays alone in the corner (bottom corner on a phone) until the calendar is on screen.
- **The clinic scene**: drawn in `site/src/components/ClinicScene.astro` (an SVG, 1600 by 580 units) and moved by `site/src/scripts/clinic.ts` with GSAP, which is bundled into the site (nothing loads from another address). The loop is about half a minute: every room in use with a red light on, the phone vibrates and rings out, the next call is answered by the assistant and booked into the diary, the doors never open, then the same after closing with the lights off. It plays only while on screen. On a screen narrower than the drawing it pans between the desk and the doors. The picture as written in the component is the finished still, which is what "reduce motion" and a browser without scripts get (swipe sideways on a phone). To change the story, edit the times and captions in `clinic.ts`; to change what the assistant says, edit the `data-say` lines in the component. It must stay labelled an illustration, the assistant must say it is automated, and it shows no figures.
- **Checking a change from the container**: `site/node_modules` belongs to the Mac. Copy `site/` (without `node_modules`) and `config/experiments.yaml` to a scratch folder, `npm install` and `npm run build` there, and screenshot `dist/` with Playwright in Chromium and WebKit (1440 and 440 wide, light and dark, with and without reduced motion). The thanks-page download test fails in such a copy if `public/files` was left out; that is the copy, not the site.
- **Three quick questions** (`site/public/t.js`, markup in `Landing.astro`): clinic type, what happens to enquiries when the desk is busy, and timing. One tap each, nothing typed. The answers stay in the browser, pick one of four endings (worth a call, something else, already covered, just looking) and are put in the Cal.com notes box if the visitor books. The site does not store or count them; counting how many finish would mean a new event type in `shared/worker.ts`, the stats route and the CRM screen.
- **Booking** is the corner button on every page. On the blog and privacy pages it links to `/#book`, which opens the calendar on the home page.
- **Adding a blog post**: copy `site/src/blog/_template.md`, rename it (the file name is the address), fill in the title, description, date and niche, and remove the `draft` line. `npm run build:release` refuses a post with no title, description or date, a description over 160 characters, or a figure or technology-led wording in the title or description. Posts appear on `/blog`, the newest two on the home page, and in `/sitemap.xml`. The sitemap is written from a fixed list in `site/src/pages/sitemap.xml.ts`, so the private thanks page and the `/v/` test pages are never in it.
- **Not yet checked against Cal.com**: the notes prefill (`config.notes` on the inline embed). Make a test booking after deploy and check the notes box holds the three answers.

## Running a test
- `headline-angle` is paused for the first launch: everyone sees version A with no cookie and no counting. Before setting it to `running`, answer the cookie question below and add the free opt-out the exemption asks for.
- Only one experiment may be `running`. Change its `started` date to the day you go live; events before it are ignored.
- Press **Refresh from site** on `/site-tests`. A version is only called when every version has the minimum visitors, the test has run the minimum days, and one version reaches the decision threshold (`config/experiments.yaml` defaults). Until then it says "Too early" or "Keep running".
- When there is a leader: record the decision below, make the winner the first (control) variant of the next test, and set the finished test to `finished`.

## Rules learned / things to know
- Visitors are counted when a cookie is first set, so someone who clears cookies counts again. Counts are approximate, good enough for big differences only.
- Email security scanners fetch links in cold email; they are filtered by their browser name, so a few may still be counted. This inflates visitors a little for every version equally.
- The `?v=b` link shows a version without counting (for checking copy). Direct links to `/v/a`, `/v/b` are never counted.
- Browser events are anonymous beacons to `/e`; the server decides the version from the cookie, never from the browser.
- **Open question before launch**: whether the `v` cookie needs a consent banner under PECR. The ICO has signalled that low-risk analytics and A/B-testing cookies may be exempt, but check its current guidance and record the answer here. The privacy page already explains the cookie.
- The Cal.com embed code (`site/public/t.js`) was written from Cal.com's standard snippet and has not been tested against Cal.com from this machine. Make a test booking after deploy and check that the `booked` count rises on `/site-tests` after a refresh.

## Decisions log
(none yet)
