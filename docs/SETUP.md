# Setup guide: tools, accounts and API keys

Work through this top to bottom. Everything you sign up for goes into `.env` (copy `.env.example` to `.env`). **Never commit `.env`.**

## 1. Install on your Mac (needed now)

> [!NOTE]
> Low-disk setup (~1.5 GB free): no Docker, no Xcode. The database is hosted on Neon's free tier; everything else runs from small local tools.

| Tool | Status | Why |
|---|---|---|
| Node.js 20+ | ✅ Installed (v24) | CRM app, dbmate, git tool |
| Git (lightweight) | ✅ Installed: `npm run push -- "message"` (isomorphic-git, ~9 MB) | Commit and push to GitHub |
| dbmate | ✅ Installed via npm: `npm run db:migrate` | Database migrations |
| uv + Python 3.12 | ✅ Installed in `~/.local/bin` (run `source ~/.local/bin/env` in new terminals) | Python tools |
| Docker Desktop | ⏸ Skipped (needs ~8–10 GB) | Optional later for local Postgres/n8n |
| jq | Optional: download `jq-macos-arm64` from https://jqlang.org/download/ | Only for Claude Code safety hooks |
| Neon CLI | ✅ Via `npx neon` (v8.4.3); sign in with `npx neon login` | Create/link the database |
| Neon agent skills | ✅ 8 skills in `.agents/skills/` | Neon guidance for the coding agent |
| Neon MCP server | ✅ Global Antigravity config (`~/.gemini/config/mcp_config.json`), OAuth, no key on disk | Lets the agent manage Neon; sign in on first use |

### GitHub token (for pushing)

1. https://github.com/settings/personal-access-tokens/new
2. Repository access: **Only select repositories** → `bdravie/agency-os`
3. Permissions → Repository → **Contents: Read and write**
4. Copy the token into `.env` as `GITHUB_TOKEN=...`

> [!TIP]
> Your repo is **public**. Nothing secret is committed, but your business config and prices will be visible. Consider Settings → Danger Zone → Change visibility → Private.

## 2. Log-in details you create yourself (no sign-up)

Put these in `.env`:

| Key | What to put |
|---|---|
| `DATABASE_URL` | From Neon (see section 3): `postgres://…neon.tech/neondb?sslmode=require` |
| `APP_PASSWORD` | The password you'll type to open the CRM at http://localhost:3000 |
| `SESSION_SECRET` | ✅ Already generated for you |
| `DEMO_MODE` | `true` while building/filming, `false` for real data |
| `SENDER_NAME`, `BUSINESS_NAME` | Your real name and business name (used in email footers) |

## 3. Accounts and API keys, in the order you need them

| When | Service | Sign up | `.env` key | Cost |
|---|---|---|---|---|
| **Now (M0)** | Neon (hosted Postgres) | https://neon.tech → sign up with GitHub → New project, Postgres 17, region **AWS Europe West 2 (London)** → **Connect** → copy the connection string | `DATABASE_URL` | Free (0.5 GB) |
| ✅ Done | Anthropic API | https://console.anthropic.com → API Keys | `ANTHROPIC_API_KEY` | Pay-as-you-go; add ~£10 credit |
| ✅ Done | GitHub token | see "GitHub token" above | `GITHUB_TOKEN` | Free |
| M2 | Upwork (freelancer profile) | https://www.upwork.com | — | Free + Connects |
| M2/M4 | Loom | https://www.loom.com | — | Free tier |
| M5 | Stripe (test mode first) | https://dashboard.stripe.com → Developers → API keys | `STRIPE_SECRET_KEY` (`sk_test_…`) | Free; fees per payment |
| M6 | Stripe webhook | Developers → Webhooks → add endpoint | `STRIPE_WEBHOOK_SECRET` (`whsec_…`) | — |
| M6 | Cal.com | https://cal.com → Settings → Developer → Webhooks | `BOOKING_LINK`, `CAL_WEBHOOK_SECRET` | Free |
| M6 | Cloudflare + a domain | https://dash.cloudflare.com → Zero Trust → Networks → Tunnels | `CLOUDFLARE_TUNNEL_TOKEN` | Free (domain ~£10/yr) |
| M7 | Companies House API | https://developer.company-information.service.gov.uk → create application → REST key | `COMPANIES_HOUSE_API_KEY` | Free |
| M8 | Google Drive or iCloud desktop sync | Already on your Mac / https://www.google.com/drive/download/ | `BACKUP_DIR` (path to a synced folder) | Free tier |
| M10 | Google Cloud – Places API (New) | https://console.cloud.google.com → enable "Places API (New)" → Credentials | `GOOGLE_PLACES_API_KEY` | Free monthly cap; set a budget alert |
| M10 | Apify | https://console.apify.com → Settings → Integrations | `APIFY_TOKEN` | $5/month free credit |
| M12 | Upload-Post | https://www.upload-post.com | `UPLOAD_POST_API_KEY` | Paid plans |
| M12 | ManyChat | https://manychat.com (connect Instagram/Facebook) | — (webhook into CRM) | Free/Pro |
| M12 | Business social accounts | Instagram, Facebook Page, TikTok, YouTube, LinkedIn | — | Free |

> Restrict every Google key to the Places API only, and add a billing budget alert at £5.

## 4. First run (after Neon and the Anthropic key are in `.env`)

```bash
source ~/.local/bin/env         # puts uv on your PATH (new terminals)
npm run db:migrate              # creates all tables on Neon
uv run pytest
uv run python scripts/check_setup.py
```

You should see `OK API` and `OK Database`.

## 5. Everyday commands

| Task | Command |
|---|---|
| Push changes to GitHub | `npm run push -- "what changed"` |
| See pending changes | `node tools/git/sync.mjs --status` |
| New migration | `npm run db:new -- add_something` then `npm run db:migrate` |
| Migration status | `npm run db:status` |
| Run the CRM's logic tests | `cd crm && npm test` (funnel maths; add tests here when something breaks) |
| Companies House search (healthy companies only) | `uv run python -m agency.companies_house --niche marketing_agencies --location London --limit 50 --dry-run` (drop `--dry-run` to save; `--min-fit 35` keeps only B and above; `--include-unhealthy` keeps filing problems) |
| Find contact routes (free searches, boxes ready) | CRM > **Find contacts**. Each company has search links, boxes, a paste helper and free checks; paid buttons are separate and labelled. |
| Check filing health and size of saved companies | `uv run python -m agency.ch_health` (new or stale ones; `--all` re-checks everything). Run monthly: companies fall behind on filings over time. |

## 6. Troubleshooting (lessons learned)

Add a line here whenever something breaks and you find the cause.

| Symptom | Cause and fix |
|---|---|
| CRM page is blank or shows "Module not found" after an update | A new package was added. In the Codespace: `git pull`, then `cd crm && npm install`, `rm -rf .next`, restart `npm run dev`. Run `npm install` in `crm/`, not the project root. |
| Clicking sidebar links downloads files instead of opening pages | Safari. Use Chrome. |
| `git pull` says untracked files "would be overwritten" | Generated build files (`crm/package-lock.json`, `next-env.d.ts`, `tsconfig.tsbuildinfo`). Delete the named files, then pull again. They are now git-ignored except the lockfile. |
| "Invalid Server Actions request" in a Codespace | The Codespaces proxy changes the origin. Already handled by `allowedOrigins` in `crm/next.config.mjs`; keep that setting. |
| Companies House returns 401 "Invalid Authorization" with a well-formed key | The key belongs to a **Test** application. Create a **Live** application and a REST key (Test keys only work on the sandbox API). |
| AI reply is cut off or fails to parse | Reasoning tokens count towards `max_tokens`. Use 3000 or more for structured replies, parse defensively, and only cache replies that parsed. |
| Anthropic error: `tool_choice type "tool" is not supported` | Sonnet 5.5 can't force a tool. Offer a single tool and tell the model in the prompt to call it (see `crm/lib/llm.ts`). |
| New secret not visible in the Codespace | Secrets load at start: stop and restart (or rebuild) the Codespace after adding one. |
| No `pg_dump` on this Mac | Backups use Python `COPY` (`uv run python -m agency.backup`), so no Postgres tools are needed. |
| Codespace hours running out | Stop it when you finish (blue bottom-left bar > Stop Current Codespace). Don't delete it. |
| Lots of leads show "Filing problems" | Expected: about 40% of a raw Companies House list are under a strike-off proposal, overdue or dormant. The search now drops them before saving; `ch_health` flags old rows. Quality gates (minimum estimated revenue, age) live in `config/niches.yaml`. |
| Estimated revenue looks rough | Micro-entities do not file turnover. The estimate is employees x GBP 50-100k unless turnover is filed, and the CRM says which. Treat it as a ranking aid. |
| "Guess the website" finds nothing | Normal for many agencies: their domain often differs from the registered name. A guess only counts if the page shows the company number or full name (lookalikes are rejected). Use the free search links on Find contacts, paste the result into the boxes, or click the optional paid buttons. |
| Paid buttons are greyed out | Google lookups stop at `PLACES_DAILY_CAP` (default 30) and web searches at `SEARCH_DAILY_CAP` (default 15) per day; web search also needs `SEARCH_API_KEY` (Brave Search) in `.env`. Paid or Google-API actions only ever run when you click them; nothing runs them on a schedule. |
| Contact details refused | By design: only company LinkedIn pages (`/company/`), business Instagram and Facebook pages, contact forms and generic inboxes (info@, hello@, contact@, enquiries@, office@, admin@, team@, sales@, support@) are stored. The database enforces it too. |
| Marking a deal Lost fails with "A lost deal needs a reason" | The database now requires one of the standard reasons (price, timing, no_need, went_diy, competitor, no_response). Old CRM code doesn't send one: `git pull`, `cd crm && npm install`, restart. The Lost dialog in the new code asks for it. |
| Funnel numbers look thin | Stage history is only recorded from 2026-10-16. Older deals count as having reached just their current stage and their moves can't be timed. Numbers fill in as you move deals. |
| Changing a Postgres enum or adding triggers | Follow the safe order used for the stage-history migration: back up (`uv run python -m agency.backup --dir data/backups`), restore into a fresh scratch database, run the migration there and check checksums and behaviour, only then run it on the live database and re-check. Adding an enum value needs `-- migrate:up transaction:false`. |
