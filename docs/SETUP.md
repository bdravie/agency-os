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
| **Now (M0)** | Anthropic API | https://console.anthropic.com → API Keys | `ANTHROPIC_API_KEY` | Pay-as-you-go; add ~£10 credit |
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
