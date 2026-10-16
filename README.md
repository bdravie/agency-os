# Agency OS: starter kit

Your own locally hosted CRM, plus the tools around it to win and deliver automation work. Everything runs on your computer in Docker; only webhook endpoints are ever exposed to the internet.

## How to start

**Current setup (low disk space):** the database is hosted on Neon's free tier, migrations run with `npm run db:migrate`, and changes are pushed with `npm run push -- "message"`. No Docker or Xcode needed. Full checklist of accounts, API keys and commands: [`docs/SETUP.md`](docs/SETUP.md).

Original Docker-based steps (for when there is disk space):

1. Install: Claude Code (comes with a Claude Pro plan), Docker Desktop, Node.js 20+, `uv` (https://docs.astral.sh/uv/), `jq` (needed by the hooks; on a Mac: `brew install jq`), and git.
2. Unzip this folder, open a terminal in it, and run `git init`.
3. Make the hooks executable: `chmod +x .claude/hooks/*.sh`
4. Copy `.env.example` to `.env` and fill in your values by hand. Set a long random `POSTGRES_PASSWORD` and use the same value inside `DATABASE_URL`.
5. Run `claude` in this folder and paste the Milestone 0 prompt from `BUILD_PLAN.md`.

## What's included

- `CLAUDE.md`: what Claude Code reads first: business rules, stack and conventions.
- `BUILD_PLAN.md`: milestones 0–13, each with a prompt to paste and a done-checklist.
  - Part 1 (0–8): database, CRM app, proposal drafter, content engine, flagship demo, automation catalogue with quotes and Stripe links, webhooks, Companies House leads, backups.
  - Part 2 (9–13): Lead Engine, Social Engine and tracking pages inside the same CRM.
- `docker-compose.yml`: Postgres (local only), dbmate for migrations, n8n, and an optional Cloudflare Tunnel for webhooks.
- `.claude/settings.json` + `.claude/hooks/`: safety hooks that block reading or committing `.env`, force pushes, commands that would wipe the database (`down -v`, `DROP`, `TRUNCATE`), automatic SMS sending and real phone numbers in sample data; plus auto-formatting of Python files with ruff.
- `.claude/commands/`: slash commands `/proposal`, `/video`, `/quote` and `/new-demo`.
- `config/niches.yaml`: search terms, SIC codes, towns, trade shows and offer for each niche.
- `config/offers.yaml`: your starting automation catalogue and prices (loaded into the CRM in milestone 5).
- `prompts/`: editable prompts for proposals, social videos and lead scoring.

## Day-to-day

- Start everything: `docker compose up -d`, then open http://localhost:3000 (the CRM) and http://localhost:5678 (n8n).
- Webhooks on: `docker compose --profile tunnel up -d`
- New database change: ask Claude Code for a new migration, then `docker compose run --rm dbmate up`.
- Backups: check the "last backup" card on the CRM Today page.
