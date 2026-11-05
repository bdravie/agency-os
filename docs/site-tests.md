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
