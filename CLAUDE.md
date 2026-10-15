# Agency OS

This repo runs a one-person AI automation agency based in the UK. At its centre is the owner's **own CRM**: one Postgres database (hosted on Neon's free tier, London region, because the laptop has no disk space for Docker) and one Next.js app running locally. It is for the owner's use only (not sold), and it is the single place for all business data: leads, deals, clients, quotes, content, proposals and tracking.

Around the CRM sit:

1. **Selling tools**: automation catalogue and quotes, Upwork proposal drafter, content engine, inbound lead handling.
2. **Lead Engine and Social Engine**: modules that write into the same database.
3. **Demo builds** in `demos/` that the agency sells to clients. Each must be easy to show in a 2-minute Loom and easy to copy for a new client.

The step-by-step build order is in `BUILD_PLAN.md`. Work through it one milestone at a time and tick off the done-checklist as you go.

## Business rules (important)

- Client automations in phase 1 handle **business data only**: content, ad metrics, sales and stock totals, internal admin. Do not add features that store a client's end customers' personal data unless the owner asks and confirms a data processing agreement is in place.
- **Scraped leads are company-level only**: company name, website, phone, address, ratings, generic emails (info@, hello@, contact@, enquiries@), social links. Drop named contact persons and personal emails from any scraper output (exhibitor lists especially) before saving.
- **Contacts** (named people) are only added when that person has engaged: filled in a form, booked a call, replied, messaged, or became a client. Record how they arrived in `contacts.consent_basis`.
- Outreach tools only target **limited companies** (Companies House status `active`, type `ltd`/`llp`/`plc`). Never build anything that sends SMS or cold messages automatically. Drafting is fine; the owner sends.
- Every outbound email template includes the sender's real name, business name and a one-line opt-out ("Reply 'no' and I won't email again").
- The `suppression` table is checked by every list-building and outreach feature.
- Scrapers respect robots.txt, rate limits and each tool's free caps, and print what each run cost.

## Stack

- **Database**: hosted Postgres 16+ on **Neon** (free tier, AWS eu-west-2 London), reached via `DATABASE_URL` with `sslmode=require`. The schema lives in SQL migrations in `db/migrations/`, run with dbmate from npm (`npm run db:migrate`; no Docker). Never change the schema any other way; never edit an applied migration, add a new one. Docker Compose (local Postgres/n8n) is optional for later, once there is disk space.
- **Git**: no system git (no disk space for Xcode). Commit and push with `node tools/git/sync.mjs "message"` (isomorphic-git) after every change.
- **CRM app**: Next.js (App Router, TypeScript) in `crm/`, using the `pg` driver with parameterised queries. Single user: password from `APP_PASSWORD`, signed session cookie. Every page and API route requires login except `/api/webhooks/*`, and every webhook verifies its signature or secret. Listens on 127.0.0.1:3000.
- **Python tools**: Python 3.12 with `uv`, code in `src/agency/`, tests in `tests/` (pytest), `psycopg` for the database. All tracking goes through one `log_activity()` function writing to the `activities` table.
- **AI**: the official `anthropic` SDK. Model choice lives in one place, `src/agency/llm.py` (and a matching `crm/lib/llm.ts` if the app needs AI):
  - `claude-opus-5-5` for hard reasoning or long documents (use sparingly)
  - `claude-sonnet-5-5` as the default for writing and agent logic
  - `claude-haiku-5-5` for high-volume, short tasks (classification, first lines, scoring)
- **Automation runner**: n8n, deferred. Until there is disk space for Docker (or an n8n Cloud plan), schedule jobs with Python CLIs run by macOS `launchd`, and keep n8n workflow JSON exports in `n8n/workflows/` or the demo's own folder so they can be imported later.
- **Webhooks from the internet**: Cloudflare Tunnel using the standalone `cloudflared` binary (or `docker compose --profile tunnel up -d` if Docker is available), exposing only `/api/webhooks/*`.
- **Payments and booking**: Stripe (test mode until live), Cal.com (hosted) with webhooks.
- **Lead sources**: Google Places API (New) for local searches (stay inside free monthly caps), Apify (Google Maps Scraper, Exhibitor List Scraper), Companies House API.
- **Social**: Upload-Post API for posting and analytics, ManyChat for comment-to-DM.
- **Config**: niches in `config/niches.yaml`, starting offers and prices in `config/offers.yaml`. Never hard-code a niche or a price.
- **Secrets** come from `.env` (see `.env.example`). Never print, log or commit secret values.
- **Backups**: `scripts/backup.sh` (milestone 8) to a cloud-synced folder, plus Neon's built-in point-in-time restore. Treat the database as the business's most valuable asset: never run destructive commands against it.

## Conventions

- Small, readable modules; type hints; a `main()` with `argparse` for every Python CLI so it runs as `uv run python -m agency.<module> ...`.
- Prompts live as Markdown files in `prompts/`, not inline strings, so the owner can edit them.
- The CRM is clean, fast and keyboard-friendly; it will be filmed for marketing. Every page must work in `DEMO_MODE` with fake data (example.com emails, 07700 900xxx phone numbers).
- Every demo folder in `demos/<name>/` contains `README.md` (what it does, setup, cost per run), `loom-script.md`, the n8n workflow JSON or code, and `sample-data/` with fake data only.
- British English in anything client-facing. Prices in GBP.
- Before saying a milestone is done, run the tests, run the feature once on demo data, and check the done-checklist.

## Working method (self-annealing)

In this repo, **directives** are the living instruction documents: this file, `BUILD_PLAN.md`, `prompts/*.md`, `docs/*.md` and each demo's `README.md`. **Tools** are the scripts and commands that do the work: `uv run python -m agency.*`, `npm run db:migrate`, `node tools/git/sync.mjs`, `scripts/*`.

**1. Self-anneal when things break** - Read error messages. Check logs. Update the script that failed. Add test cases. Fix the root cause. Don't just try the same thing again.
- Update the directive with what you learned (API limits, timing, edge cases).

**2. Update directives as you learn** - Directives are living documents. When you discover API constraints, better approaches, common errors, or timing expectations, update the directive. But don't create or overwrite directives without asking unless explicitly told to. Directives are your instruction set and must be preserved (and improved upon over time, not extemporaneously used and then discarded).

### Self-annealing loop

Errors are learning opportunities. When something breaks:
1. Fix it
2. Update the tool
3. Test the tool
4. Update the directive
5. System is now stronger

## Safety & grounding

**Always use the tools** - Never bypass execution tools. They exist for reliability and auditability. (For example: change the schema only through a migration, commit only through `tools/git/sync.mjs`, back up only through `agency.backup`.)

## Owner preferences

- Explain what you are about to change in one or two sentences, then do it.
- Keep running costs low: cache API responses during development, use Haiku where quality allows.
