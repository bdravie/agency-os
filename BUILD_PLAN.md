# Build plan

Build in this order. Each milestone has a prompt you can paste into Claude Code and a done-checklist. Do not start the next milestone until the current one passes.

The centre of everything is **your own CRM**, running locally: one Postgres database and one web app at http://localhost:3000. Every other tool (proposal drafter, content engine, Lead Engine, Social Engine, webhooks) reads from and writes to it.

Rough timing for evenings: Part 1 (milestones 0–8) in 4–6 weeks; Part 2 (9–13) in another 3–4 weeks. If you need clients fast, do 0–2 first, then 4 and 5, and fill in the rest around paid work.

Layout:

```
db/migrations/        # SQL migrations (dbmate), the single source of truth for the schema
crm/                  # Next.js CRM app (localhost:3000)
src/agency/core/      # Python: db access, activity logger, niche config, demo mode
src/agency/           # Python tools: proposal, content, companies_house
src/agency/leads/     # Lead Engine: sources, enrichment, scoring, areas
src/agency/social/    # Social Engine: posting, comments, analytics, weekly report
demos/                # sellable demo builds
config/niches.yaml    # one block per niche
scripts/              # setup check, backup, restore
```

---

# Part 1: CRM and selling tools

## Before launch: deferred paid and credit-based items

Decided 2026-10-15: leave these off until closer to launch. **Anything that spends credits or calls a Google API only ever runs when you click a button**, shows its cost on the button, and stops at a daily cap. Nothing paid runs on a schedule or in bulk by itself. The free route (search links, boxes, paste helper, free site checks) works today without any of these.

- [ ] **Google Places lookup** (built: "Find with Google Places" on the Lead Sourcer Enrich tab and company pages, bulk "Find websites with Google" on the Enrich tab; default cap 30 a day)
  - Create a Google Cloud project, enable **Places API (New)**, add a billing account.
  - Set a budget alert (about £5) and a **daily quota** on Text Search (about 30), restrict the key to Places API (New).
  - Check the current free monthly allowance for Text Search with the website field, and set the daily cap so 30 days stays inside it.
  - Add `GOOGLE_PLACES_API_KEY` to `.env` and as a Codespaces secret, then restart the Codespace. Test on 5 companies before relying on it.
- [ ] **Web search for social pages** (built: "Search the web for social pages", switched off until a key exists; default cap 15 a day)
  - Sign up for the Brave Search API, check its current free tier and pricing, add `SEARCH_API_KEY` (and `SEARCH_DAILY_CAP`) to `.env` and the Codespaces secrets.
  - Test it on 5 companies and confirm the suggestions are good enough to be worth the credits.
- [ ] **Stripe payment links in test mode** (milestone 5 stage C, not built yet)
  - Create a Stripe account, stay in Test mode, add the `sk_test_...` key as `STRIPE_SECRET_KEY`. Go live only after a full test-mode payment works.
- [ ] **Paid turnover data** (optional, only if the free size estimate proves too rough): Endole or Creditsafe for A-tier companies only.
- [ ] **Later milestones that need paid accounts:** Cal.com and Cloudflare Tunnel (milestone 6), Apify (milestone 10), Upload-Post and ManyChat (milestone 12). See `docs/SETUP.md`.
- [ ] **Before sending real outreach:** record the Loom, add its URL to `config/offers.yaml` (so email drafts fill it in), add it to `portfolio/portfolio.md`, and check the opt-out line and your sender details.

---

## Milestone 0: Setup and database

**Paste into Claude Code:**

> Read CLAUDE.md and BUILD_PLAN.md. Set up milestone 0. (1) A uv Python project with anthropic, psycopg[binary], httpx, python-dotenv, pyyaml and pytest. (2) `src/agency/llm.py`: a small wrapper around the Anthropic client with one function `ask(prompt, model="sonnet", system=None, max_tokens=1500)` and the three model IDs from CLAUDE.md. (3) `src/agency/config.py` that loads `.env`. (4) Start Postgres and n8n with `docker compose up -d`. (5) Write the first dbmate migration in `db/migrations/` with these tables: companies (name, domain, phone, address, postcode, niche, company_number, is_ltd, sic_codes, status, source, owner_notes, created_at, updated_at), contacts (company_id, name, role, email, phone, linkedin_url, consent_basis, created_at), deals (company_id, contact_id, title, stage, setup_value_gbp, monthly_value_gbp, offer_id nullable, source, expected_close, lost_reason, created_at, updated_at), tasks (title, due_at, done_at, company_id, deal_id), activities (company_id, contact_id, deal_id, type, channel, body, meta jsonb, occurred_at), offers (name, niche, outcome, description, setup_price_gbp, monthly_price_gbp, loom_url, demo_path, active), quotes (deal_id, offer_id, line_items jsonb, total_setup_gbp, total_monthly_gbp, status, sent_at, accepted_at, payment_link), client_services (company_id, offer_id, setup_fee_gbp, monthly_fee_gbp, start_date, status, next_review_date), proposals (job_title, job_url, job_text, draft, fit_score, status, connects_used, sent_at), content_items (idea, hook, format, platforms, script, caption, keyword, status, posted_at), and suppression (domain, email, reason, added_at). Deal stages (database values): New, Contacted, Replied, Call booked, Audit sold, Proposal sent, Won, Lost. The CRM shows them as Lead > Contacted > Replied > Call booked > Audit sold > Proposal > Won / Lost. Add sensible indexes and updated_at triggers. Run the migration with `docker compose run --rm dbmate up`. (6) `scripts/check_setup.py` confirms the API key works with a one-line Haiku call and that the database is reachable and migrated.

**Done when:**
- [x] `uv run python scripts/check_setup.py` prints OK for the API and the database
- [x] ~~`docker compose ps` shows postgres and n8n healthy~~ (skipped: Neon hosted DB, Docker deferred)
- [x] `.env` is git-ignored and `git status` shows no secrets

---

## Milestone 1: CRM app v1

**Paste into Claude Code:**

> Build milestone 1: a Next.js (App Router, TypeScript) CRM in `crm/` using the `pg` driver against DATABASE_URL (no ORM migrations: the schema lives in `db/migrations/`). Single-user login with a password from APP_PASSWORD and a signed session cookie; every page and API route requires it except `/api/webhooks/*`. Pages: Today (tasks due, deals needing follow-up, recent activity), Companies (searchable table, filters by niche and status, CSV import and export), Company detail (contacts, deals, activity timeline, notes, tasks, quick "log email/DM/call" buttons), Deals (kanban board by stage with drag-and-drop, setup and monthly values, totals per stage), Tasks. Clean, fast, keyboard-friendly design; it will be filmed for marketing. Add a `DEMO_MODE` banner and `scripts/seed_demo.py` that fills fake data (example.com emails, 07700 900xxx phones only). The app should listen on 127.0.0.1:3000 only.

**Done when:**
- [x] You can add a company, a contact and a deal, drag the deal across stages and see it in the activity timeline
- [x] CSV import of 50 companies works and duplicates (same domain) are merged
- [x] The app cannot be opened without the password

---

## Milestone 2: Upwork proposal drafter

**Paste into Claude Code:**

> Build milestone 2: `src/agency/proposal.py`. Input: an Upwork job post (pasted text or a .txt file). It reads `portfolio/portfolio.md` (my demos with Loom links), the active rows in the offers table, and `prompts/proposal.md`, then uses Sonnet to draft a proposal under 150 words: the client's problem in their words, how I'd solve it naming their tools, the most relevant Loom link, a timeline, and one smart question. Haiku gives a fit score 1–10 with a reason so I can skip bad jobs. Save each run to the proposals table with status Draft, and add a Proposals page to the CRM to review, edit, copy and mark them Sent/Interview/Won/Lost. Update `.claude/commands/proposal.md` so `/proposal` runs this script.

**Done when:**
- [ ] 3 real job posts give proposals you'd send with light edits
- [ ] Proposals show in the CRM with their status
- [ ] It never invents a portfolio item

---

## Milestone 3: Content engine

**Paste into Claude Code:**

> Build milestone 3: `src/agency/content.py` with three commands. `ideas` generates 20 video ideas for my niche using `prompts/video-ideas.md` and saves them to content_items as Idea. `script <id>` writes 5 hook options, a 30–45 second script, on-screen text and a caption with a comment keyword, and moves the item to Scripted. `repurpose <transcript file>` turns one long transcript into 3 short-video scripts, 3 LinkedIn posts and 1 newsletter. Use Sonnet for scripts and Haiku for ideas. Add a Content page to the CRM: a board by status (Idea, Scripted, Filmed, Posted) and a weekly calendar view.

**Done when:**
- [ ] 20 ideas and 5 finished scripts visible in the CRM
- [ ] `repurpose` works on a real transcript

---

## Milestone 4: Flagship demo (pick ONE matching your niche)

**Niche A, agencies: weekly client report**

> Build milestone 4A in `demos/client-report/`: take a CSV of ad and analytics metrics for one fake client (8 weeks of realistic sample data), compute week-on-week changes in code (never let the model do arithmetic), ask Sonnet for a plain-English summary with 3 wins, 2 concerns and 3 next actions, and render a branded HTML email plus a PDF. Build the same flow as an n8n workflow triggered weekly, export its JSON into the folder, and write README.md and loom-script.md.

**Niche B, creators: content repurposing pipeline**

> Build milestone 4B in `demos/repurpose/`: package the repurpose command as an n8n workflow: a new file dropped into a watched folder triggers transcription, then Sonnet produces the outputs into a Google Doc and an approval list. Include fake sample transcripts, README.md and loom-script.md.

**Niche C, e-commerce: daily sales and stock digest**

> Build milestone 4C in `demos/shop-digest/`: using a Shopify development store (free via a Shopify Partner account) and the Admin API, pull yesterday's order totals and stock levels only (no customer fields), compute totals and low-stock items in code, have Sonnet write a short morning digest with suggested reorders, and email it. Build it as an n8n workflow too, export the JSON, and write README.md and loom-script.md.

**Done when:**
- [ ] The demo runs end to end on sample data in under 2 minutes
- [ ] README.md states the running cost per client per month
- [ ] The Loom is recorded and added to `portfolio/portfolio.md`

---

## Milestone 5: Automation catalogue, quotes and clients (selling)

> **Audit module built (2026-10-16):** `audits`, `audit_tasks` and `company_documents`. An audit hangs off a client and usually a deal. The intake lists recurring tasks (name, done by a role or team, hours a week, frequency, error rate, revenue impact, data sensitivity, optional ease). Tasks are scored in code (hours saved x value x ease x a data-sensitivity penalty) and ranked; special-category tasks are held out of the top three. Claude (model from `AUDIT_MODEL`, default Sonnet, only on a click, capped by `AUDIT_DAILY_CAP`) drafts the wording of a two-page report using figures supplied by the code, anything it adds is flagged, you can edit it, and the PDF is saved against the client record (`/documents/[id]`). Not built: sending the report to the client, and a client-facing intake form.

> **Offers/Products module built (2026-10-16):** four core offers (AI Opportunity Audit one-off, Build setup fee, Team Enablement one-off, Optimise Retainer monthly), each with a price range, default price, default duration and a deliverables checklist, seeded from `config/offers.yaml` by `uv run python -m agency.seed_offers` (insert-only). Deals carry one or more offers (`deal_offers`) with their own agreed price, a copied checklist and an optional credit (an audit fee credited against a build); a deal's one-off and monthly values are calculated from its lines. Today shows recurring revenue (active client records) and one-off revenue (Won deals, net of credits) separately. **The starting prices are placeholders I chose: edit them on the Offers page.** Stripe links (stage C) are still deferred.

**Paste into Claude Code:**

> Build milestone 5 in the CRM. (1) Offers page: my catalogue of automations (name, niche, outcome, setup and monthly price, Loom link, demo folder), editable, with an "active" toggle. Seed it from the pricing in `config/offers.yaml`. (2) Quote builder on a deal: pick one or more offers, adjust prices or add a discount, add a short scope paragraph (Sonnet drafts it from the deal notes and the offer), and generate a branded quote page and PDF with setup fee, monthly fee, what's included, timeline and terms (50% upfront, 50% on go-live; monthly by card; 3-month minimum). Store it in quotes. (3) A Stripe payment link for the setup fee and a Stripe subscription link for the monthly fee, created via the Stripe API and added to the quote. (4) When a quote is accepted or paid, the deal moves to Won and a client_services row is created; a Clients page shows each client's services, monthly recurring revenue, start date and next review date, with a task created 7 days before each review. Add a `/quote` slash command that drafts a quote for a named company.

**Done when:**
- [ ] A test quote generates a PDF and working Stripe test-mode links
- [ ] Paying in Stripe test mode moves the deal to Won (after milestone 6's webhook) or can be marked Won by hand
- [ ] The Clients page shows total monthly recurring revenue

---

## Milestone 6: Webhooks and inbound leads

**Paste into Claude Code:**

> Build milestone 6. (1) API routes in the CRM under `/api/webhooks/`: `form` (my website application form), `cal` (Cal.com booking created/cancelled, verified with CAL_WEBHOOK_SECRET), `stripe` (checkout completed and subscription events, verified with STRIPE_WEBHOOK_SECRET), and `manychat` (keyword comment -> DM sent). Each creates or matches the company/contact by email domain, logs an activity and moves the deal stage (form -> New, booking -> Call booked, payment -> Won). (2) On a new form lead, Haiku scores fit 1–10 and Sonnet drafts (not sends) a reply with my demo Loom and booking link, saved on the deal for me to copy. (3) On a booking, write a one-page pre-call brief from the form answers and the company website and attach it to the deal. (4) Set up the Cloudflare Tunnel service in docker-compose so ONLY `/api/webhooks/*` is reachable from the internet, and document the setup in `docs/tunnel.md`.

**Done when:**
- [ ] A test form submission, Cal.com test booking and Stripe test payment each update the right deal
- [ ] Opening the tunnel URL on any other path is refused
- [ ] Nothing is sent automatically

---

## Milestone 7: Companies House lead list (Ltd only)

**Paste into Claude Code:**

> Build milestone 7: `src/agency/companies_house.py`. Use the Companies House API advanced company search to list active companies (types ltd, llp, plc) by SIC code and location from `config/niches.yaml`. Skip anything already in companies or in the suppression table. Save new rows to companies with source = Companies House and status New. Add `--enrich` that, for rows with a website, fetches the contact page and extracts only generic addresses (info@, hello@, contact@, enquiries@). Respect the API rate limit. Add a "Run lead search" button on the Companies page that triggers it for a niche.

**Done when:**
- [ ] 100 Ltd companies for your niche in the CRM, none duplicated or suppressed
- [ ] Only generic email addresses stored

---

## Extra: Calls and Objection Library (built)

Upload a .vtt/.txt transcript or paste notes against a deal (`/calls/new`). Privacy masking happens before saving; "Analyse with AI" (paid, click-only, `CALLS_DAILY_CAP`) extracts summary, pains, budget signals, objections, next step and follow-up date, and creates the follow-up task. `/objections` aggregates objections across calls with frequency counts and your best response, shown again on any call where it recurs. Migration: `20261019100000_calls_and_objections.sql`.

---

## Extra: Outcomes (built)

Per-client before-and-after tracking (`/outcomes`). Kickoff baselines, monthly manual or CSV readings, a flat/slipping/no-data flag (Today and Outcomes, with a check-in task), a one-page monthly PDF report (wins and next improvement drafted by AI on click or typed by hand), and, once 60 days of data show a real improvement, a draft case study and testimonial request email. Migration: `20261020100000_outcomes.sql`.

---

## Extra: Enablement (built)

Client training (`/enablement`): sessions held with attendees and a 1-3 skill level per person, skills/prompts/templates delivered (pasted text and stored files), recurring session schedules that keep a task open, and a flag for retained clients with no session in 30+ days (Today and Enablement, with a one-click task). Migration: `20261021100000_enablement.sql`.

---

## Extra: Lead compliance and the Companies House search button (built)

Leads carry company type, status, compliance status, consent basis, contact source and opt-out (with date). A free Companies House lookup (by number or exact name) verifies them, and the `lead_gate` view plus a send-guard trigger block drafting, listing and logging sends for anything that is not a verified active ltd/llp/plc, has opted out, or is suppressed. The suppression list now holds phone numbers and company numbers and has its own page. Companies → "Find and add companies from Companies House" runs the existing search in the background and lists the results so you tick which to add; niches can be added in the app (stored in `custom_niches`, SIC codes checked against Companies House). Migrations: `20261022100000_lead_compliance.sql`, `20261023100000_search_results_and_niches.sql`.

---

## Extra: Offer suggestion on the company page (built)

Free website research (up to four pages of the company's own site, robots.txt respected, hardened against internal addresses) finds likely gaps and strengths by fixed rules; a separate click-only Claude step turns them into 1 to 3 offer ideas (automation, outcome to sell, why, what to measure, pilot, risk) plus a true opening line, each tied to findings. Migration: `20261024100000_offer_research.sql`.

---

## Extra: Apify Google Maps lead search (built)

Companies → "Find local businesses on Google Maps (Apify)": click-only search with Apify's required $0.50 safety cap on every run, the place count sized to daily and monthly budgets for the free plan (learning the real price per place from each run), results matched to the CRM, the suppression list and Companies House (free), ranked A/B/C, and added only when chosen. Needs `APIFY_TOKEN`; tested against a stand-in Apify server, so run your first real search small (10 places) and check the cost. Migration: `20261025100000_apify_leads.sql`.

---

## Extra: Companies list sorting, filters and suitability score (built)

The Companies list can be sorted (recently added, most suitable, revenue, rating, name) and filtered (added, tier, source, contact details, revenue, rating, area). Suitability is one 0-100 score defined in the `lead_suitability` view, with the reasons in a tooltip. Migration: `20261026100000_lead_suitability.sql`.

---

## Extra: Lead Sourcer (built, phase 1)

One search screen (`/sourcer`) replaces the separate Companies House panel, Google Maps panel and Find contacts page. Filters (company types, estimated revenue, employees, age, website, rating, reviews), a source picker with budgets, one merged and ranked results table, add-what-you-choose, and an Enrich tab. The suitability weights now live in one SQL function. Migration: `20261027100000_lead_sourcer.sql`. Added: **Find one company** (name search for the closest website and social pages, checked against Companies House, then add and enrich). Next: Apollo as a company-level source once registered (confirm free-plan API access first), then saved searches.

---

## Extra: Apollo decision-makers (built)

Company page > Decision-makers (Apollo): free senior-people search, then a click-only, credit-capped reveal of work emails, saved as contacts with the lawful basis recorded; person-level opt-out and a combined company-plus-person gate (`contact_gate`) that the outreach recipient list and the send-guard trigger both use. Roles in `config/apollo.yaml`. Tested against a stand-in Apollo server, not the real service: run the first real search on one company and compare the credits shown with your Apollo balance. Migration: `20261029100000_apollo_decision_makers.sql`.

---

## Milestone 8: Backups and reliability

**Paste into Claude Code:**

> Build milestone 8. (1) `scripts/backup.sh`: `pg_dump` the database (via the postgres container) to a dated, compressed file in BACKUP_DIR, keep the last 14 daily and 8 weekly copies. BACKUP_DIR should be a folder synced to cloud storage (e.g. Google Drive or iCloud) so backups leave the laptop. (2) `scripts/restore.sh` that restores a chosen backup into a fresh scratch database and prints row counts, so I can test restores without touching live data. (3) Schedule the backup daily via an n8n workflow or the OS scheduler, and show "last backup" on the CRM Today page (warning if older than 36 hours). (4) Add the CRM app to docker-compose as a production build so `docker compose up -d` starts everything after a reboot.

**Done when:**
- [ ] A backup file appears in the synced folder
- [ ] A test restore into the scratch database shows the same row counts
- [ ] After a reboot, `docker compose up -d` brings back the CRM, database and n8n

---

## Phase 2 (later)

Once you have 3 paying clients and a data processing agreement template: lead follow-up offers for clinics and local businesses, Twilio for SMS and calls, and compliant cold SMS to limited companies. See the main playbook.

---

# Part 2: Lead Engine, Social Engine and tracking

Both engines are modules of the same CRM: same database, same app. Full background: the "Lead and social engine" tab in the playbook.

## Milestone 9: Lead and tracking schema, demo mode

**Paste into Claude Code:**

> Build milestone 9 as a new dbmate migration: add to companies (lat, lng, rating, review_count, website_signals jsonb, fit_score, first_line, route), and new tables sources (company_id, source_type, source_ref, cost_gbp, found_at), generic_emails (company_id, email), areas (niche, area_name, density, avg_reviews, gap_rate, competition, score, computed_at), posts (content_item_id, platform, external_id, posted_at, url), post_metrics (post_id, date, views, likes, comments, shares, saves, follows), and spend (tool, amount_gbp, period, note). Use the existing activities table for all tracking events (types: found, contacted, engaged, form, call_booked, won, lost) with optional post_id in meta. Write `src/agency/core/db.py`, `activities.py` (one `log_activity()` used everywhere) and `niches.py` that loads `config/niches.yaml`. Extend `scripts/seed_demo.py` to fill all new tables with fake data.

**Done when:**
- [ ] Migration runs cleanly on top of milestone 0's schema
- [ ] Demo seed fills every table

## Milestone 10: Lead sources

**Paste into Claude Code:**

> Build milestone 10 in `src/agency/leads/sources/`: `places.py` (Google Places API New, Text Search by keyword + location bias circle from a postcode and radius, only the fields needed via the field mask, with a monthly call counter that stops at the free cap), `maps_apify.py` (Apify Google Maps Scraper run per town and keyword, using apify-client), `exhibitors.py` (Apify Exhibitor List Scraper for a show URL; DROP named contact persons and personal emails before saving; keep company, website, phone, booth, socials), and reuse `companies_house.py`. Each source writes to companies + sources, merging duplicates by domain, then phone, then name + postcode, logs a found activity and records its cost in sources. One CLI: `uv run python -m agency.leads.run --niche marketing_agencies --postcode "SW1A 1AA" --radius-km 15 --sources places,maps,shows`, plus a matching form on the CRM Companies page.

**Done when:**
- [ ] One run returns 100+ businesses with no duplicates
- [ ] No personal names or personal emails stored from exhibitor lists
- [ ] Spend per run is printed and saved

## Milestone 11: Enrichment, scoring and best areas

**Paste into Claude Code:**

> Build milestone 11 in `src/agency/leads/`: `enrich.py` checks Companies House (is_ltd, sic_codes), scans the homepage and contact page for generic emails only, social links, booking tools (Fresha, Phorest, Calendly, Cal.com, Treatwell, Acuity), chat widgets and online booking, storing signals in website_signals. `score.py` uses Haiku 5.5 with `prompts/lead-score.md` for a 1–100 fit score against the niche's offer, the gaps, one personalised first line, and the route (email if is_ltd and score >= 70; social if Instagram found; content-only for sole traders). `areas.py` scores each town in the niche's list and writes ranked rows to areas. Respect robots.txt, 1-second delay per domain, cache pages. In the CRM, show score, gaps and first line on each company, and add an Areas page with the ranked towns on a map.

**Done when:**
- [ ] 100 businesses enriched and scored for under £2 in API costs
- [ ] At least 10 towns ranked for your niche
- [ ] Sole traders are never routed to email

## Milestone 12: Social Engine

**Paste into Claude Code:**

> Build milestone 12 in `src/agency/social/`: `publish.py` posts a video to the platforms listed on its content item via the Upload-Post API, with a platform-specific caption from Sonnet, and saves posts rows. `analytics.py` pulls daily metrics into post_metrics. `weekly_report.py` has Sonnet write a one-page report: top hooks, best times, posts that led to DMs, forms and calls, and 5 ideas for next week, saved as content items. ManyChat events already arrive via milestone 6's webhook; link them to the post by keyword. Schedule analytics daily and the report weekly in n8n. Add a "Post" button on scripted/filmed content items in the CRM.

**Done when:**
- [ ] One test video posts to at least 2 platforms from the CRM
- [ ] A test keyword comment links to the right post
- [ ] The weekly report runs on demo data

## Milestone 13: Tracking and attribution pages

> **Started early (2026-10-16):** the Funnel page, `stage_history` (written by a database trigger on every stage change), the standard lost reasons (price, timing, no need, went DIY, competitor, no response, enforced by the database) with a note, and `deals.channel` (email, social DM, Upwork, SMS, referral). Funnel shows conversion between stages, close rate, average days per stage, top lost reasons and a channel breakdown, by week, month or all time. Still to do here: Content ROI, Spend, and the Revenue card on Today.

**Paste into Claude Code:**

> Build milestone 13 in the CRM: Funnel (conversion per step: found, contacted, engaged, form, call booked, won; filter by source, channel, niche and date range), Content ROI (each post with views, DMs, forms, calls, won deals and revenue attributed by first touch), Spend (tool costs and scraping spend, cost per lead, per call and per client), and a Revenue card on Today (monthly recurring revenue, setup fees this month, pipeline value). Keep every page working in demo mode.

**Done when:**
- [ ] Every page works in demo mode
- [ ] A test Cal.com booking appears in the Funnel
- [ ] Looms recorded of the CRM, the Lead Engine and the Social Engine

---

## Ongoing: package and repeat

For every client build: copy the closest demo folder, swap sample data for the client's, update its README with setup and costs, add it (anonymised) to `portfolio/portfolio.md` and the Offers page, and film a Loom for socials.
