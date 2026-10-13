# Setup guide: tools, accounts and API keys

Work through this top to bottom. Everything you sign up for goes into `.env` (copy `.env.example` to `.env`). **Never commit `.env`.**

## 1. Install on your Mac (needed now)

> [!WARNING]
> Your Mac has ~1.5 GB free. Docker Desktop plus Postgres and n8n images need about **8–10 GB**. Free up space (or use the hosted-database option) before milestone 0 can run.

| Tool | How | Why |
|---|---|---|
| Git (lightweight) | Already set up: `node tools/git/sync.mjs "message"` (pure JavaScript, ~9 MB; no Xcode needed) | Commit and push to GitHub |
| Homebrew (optional) | Paste the one-liner from https://brew.sh (needs Xcode tools, ~1–2 GB) | Easiest way to install uv and jq |
| uv | No Homebrew: `curl -LsSf https://astral.sh/uv/install.sh \| sh` (~40 MB, brings its own Python) | Python project/env manager |
| Docker Desktop | https://www.docker.com/products/docker-desktop/ (Apple Silicon) | Runs Postgres and n8n |
| jq | No Homebrew: download `jq-macos-arm64` from https://jqlang.org/download/ | Used by the Claude Code safety hooks only |
| Node.js 20+ | Already installed (v24) | CRM app and git tool |

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
| `POSTGRES_PASSWORD` | Long random string. Generate: `openssl rand -hex 24` |
| `DATABASE_URL` | Same password inside: `postgres://agency:<PASSWORD>@127.0.0.1:5432/agency?sslmode=disable` |
| `APP_PASSWORD` | The password you'll type to open the CRM at http://localhost:3000 |
| `SESSION_SECRET` | Another random string: `openssl rand -hex 32` |
| `DEMO_MODE` | `true` while building/filming, `false` for real data |
| `SENDER_NAME`, `BUSINESS_NAME` | Your real name and business name (used in email footers) |
| n8n login | You create an owner account the first time you open http://localhost:5678 |

## 3. Accounts and API keys, in the order you need them

| When | Service | Sign up | `.env` key | Cost |
|---|---|---|---|---|
| **Now (M0)** | Anthropic API | https://console.anthropic.com → API Keys | `ANTHROPIC_API_KEY` | Pay-as-you-go; add ~£10 credit |
| **Now** | GitHub token | see "GitHub token" above | `GITHUB_TOKEN` | Free |
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

## 4. First run (after steps 1–2 and the Anthropic key)

```bash
cp .env.example .env            # then fill it in by hand
chmod +x .claude/hooks/*.sh
docker compose up -d            # Postgres + n8n
docker compose run --rm dbmate up
uv sync
uv run pytest
uv run python scripts/check_setup.py
```

You should see `OK API` and `OK Database`.
