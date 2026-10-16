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
| Seed or refresh the core offers from `config/offers.yaml` | `uv run python -m agency.seed_offers` (insert-only: never overwrites what you edited in the CRM; `--dry-run` to validate) |
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
| How are MRR and one-off revenue worked out? | **MRR** is the monthly fees of Active client records (Clients page). **One-off revenue** is the one-off and setup fees of Won deals, net of audit credits, counted from the date the deal became Won. Marking a deal Won makes the company a Client and creates its client record for any monthly fee (once, remembered by `client_services.deal_id`), so MRR stays in step with Won deals. Recurring and one-off money are never added together. |
| An audit credited against a build | On the deal, add both offers, then on the Build line pick "Credit from" the audit (blank amount = the full audit fee). The deal's one-off value counts the audit once and the build net of the credit. Removing the audit line clears the credit. The quote builder opens with the deal's offers ticked and the credit as a discount. |
| A deal's one-off or monthly value won't edit | Once a deal has offer lines, its values are calculated from them: change the line prices instead. |
| Where do audit PDFs go? | Each saved PDF is stored in the database (`company_documents`) against the client and the deal, so it is in your backups and available from any machine. Open it from the audit page or the company page. |
| AI audit report: which model, what does it cost? | The model is `AUDIT_MODEL` in `.env` (an alias like `sonnet` or `opus`, or a full model id; blank = Sonnet). One click is one Claude call; it stops at `AUDIT_DAILY_CAP` (default 10) a day. The AI writes wording only: every hour and pound figure is calculated by the app, and any figure the AI adds that wasn't supplied is flagged. |
| Calls: which model, what does it cost? | The model is `CALLS_MODEL` in `.env` (alias like `sonnet`, or a full id; blank = Sonnet). Saving a call is free. "Analyse with AI" is one Claude call, only when you click, and stops at `CALLS_DAILY_CAP` (default 20) a day. |
| Calls: what happens to the transcript? | Before saving, email addresses and phone numbers are masked, speaker labels become "Me" and "Prospect", and names spoken aloud that match a speaker label become `[name]`. The original upload is never kept. Names only said in speech and never used as a label can't be found, so skim the transcript. Only add calls where everyone knew they were being recorded. "Remove transcript" keeps the analysis but deletes the text. |
| Calls: a follow-up task was created with the wrong date | The AI's date is used only if it falls between the call date and a year after; otherwise the task is due 3 days after the call and marked as assumed. Edit the date on the call page and the task follows. |
| Objection Library has duplicates | Open Objections and use "Merge duplicates" on the weaker one. Calls move to the objection you keep. |
| Outcomes: how do I start and what do I log? | Outcomes, Start tracking a client. Pick the client, set the kickoff date and enter today's numbers (missed calls/week, response time, bookings or leads/month, admin hours/week, or your own). Each month, open the client's page and type that month's numbers, or import a CSV. Use the same basis as the baseline (a "per week" metric is an average week). |
| Outcomes: CSV format | Either `month,metric,value` rows, or `month` plus one column per metric, headed with the metric's exact name. Months can be `2026-10`, `Oct 2026` or `10/2026`. Unknown metrics, future months and months before kickoff are skipped and listed; numbers already saved for a month are replaced. |
| Outcomes: what counts as flat? | A metric is "better" or "worse" when it has moved 10% or more from the kickoff baseline in the good direction or the bad one (`FLAT_PCT` in `crm/lib/outcomeMath.ts`). A client is flagged when nothing has moved that much after 30 days, when results are slipping, or when no results are logged (none after 45 days, or two finished months missing). Flagged clients show on Today and Outcomes, with a one-click check-in task. |
| Outcomes: when do the case study and testimonial email unlock? | After 60 days of data (kickoff to the end of the latest logged month) and at least one clearly improved metric. A flat client never gets a case study, because there is no honest result to write up. The email is a draft you send yourself and always carries your name, business and the opt-out line (set `SENDER_NAME` and `BUSINESS_NAME`). The client approves the case study before it is used. |
| Outcomes: AI model and cost | `OUTCOMES_MODEL` in `.env` (alias or full model id; blank = Sonnet), `OUTCOMES_DAILY_CAP` (default 20). Drafting is one Claude call, only when you click. The AI writes wording only; every number is calculated by the app, and any figure it adds that wasn't supplied is flagged. The monthly PDF can also be written by hand with no AI. |
| Enablement: what is "retained" and what is flagged? | A client is retained when it has an Active service with a monthly fee above £0. It is flagged when its last logged session was 30 or more days ago (`OVERDUE_DAYS` in `crm/lib/enablementMath.ts`). With no session yet, the 30 days run from the service start date. Flagged clients show on Today and Enablement, with a one-click "book a session" task. |
| Enablement: skill levels and staff | Staff are a name and role only (no email or phone). Level 1 = Learning, 2 = Confident, 3 = Independent. Set the level for each attendee when you log a session; it updates the person's current level and keeps the history. Levels are a training record, not a performance rating. Use Remove to delete a person and their attendance on request. |
| Enablement: recurring sessions | Each schedule keeps one open task for its next date. Logging a session against the schedule completes that task and creates the next. A session held up to half a cadence early (or late) counts for the nearest slot. |
| Enablement: which files can I store? | pdf, docx, xlsx, pptx, txt, md, csv, json, png, jpg: up to 5 files of 3 MB per upload. They are stored in the database (so they are backed up, and count towards Neon's free 0.5 GB), and only ever offered as downloads. Web pages and scripts (html, svg, js) are refused. Don't upload API keys, passwords or customer personal data. |
| How do I find new companies? | Companies → "Find and add companies from Companies House" (free). Pick a niche, optionally a town, and click Search. It runs in the background and lists what it found (best fit first). Nothing is added yet: tick the companies you want and click "Add N to the CRM". Ones already in the CRM or on the suppression list are greyed out. Needs `COMPANIES_HOUSE_API_KEY`. From the terminal: `uv run python -m agency.companies_house --niche marketing_agencies --location Leeds --limit 50 --dry-run` (or without `--dry-run` to save everything). |
| How do I add a niche? | In the same panel: "Add or manage niches". Give it a name and the 5-digit SIC codes (list at resources.companieshouse.gov.uk/sic). "Check codes" asks Companies House how many active limited companies use them (free), so a wrong code is caught. Your niches are stored in the database (they appear as "(yours)") and can be removed there; the niches in `config/niches.yaml` stay in that file and win if a key matches. |
| Why is outreach blocked for a lead? | One rule, in one place (the `lead_gate` database view): a lead can be contacted only if it is a verified active ltd, LLP or PLC, has not opted out, and matches nothing on the suppression list. Open the lead's Compliance card to see which applies. "Not yet checked" means look it up: type the company number (or leave it blank to search by name) and click Look up. Companies → "Verify 25 unchecked" does it in bulk, or `uv run python -m agency.compliance --unverified`. |
| Companies House lookup finds no exact match | It never guesses. It lists the closest companies for you to pick, or you can type the 8-character company number. A number already used by another lead is refused (delete or merge the duplicate). |
| A lead opted out | On its page: Compliance → "They opted out" (with how). It is blocked everywhere, its website, email, phone and company number go on the suppression list, and its follow-up tasks are cancelled. Re-checking Companies House never lifts an opt-out. "Clear it" is for mistakes only. |
| The suppression list | Suppression (Setup). Paste emails, websites, phone numbers or company numbers, one per line. Every draft, list, "Ready to email" view, enrichment run and logged send checks it first, and the database itself refuses to log an email, DM or text as sent to a lead that fails the gate. Phone numbers are matched however they are written (+44, 0044, spaces). |
| What is "consent basis" and "contact source"? | Two notes per lead. Consent basis is why you may contact them (pre-filled with "PECR corporate subscriber + legitimate interest" when a lead is verified as a limited company; edit it if your position differs). Contact source is where their email or phone came from. They are your records for the opt-out and "where did you get my details" questions, not legal advice. |
| A lead was fine but is now blocked | Companies House says it is no longer active (struck off, in liquidation). The monthly `agency.ch_health` run re-checks status; `uv run python -m agency.compliance --stale 90` re-verifies anything not checked for 90 days. |
| Offer suggestion on a company | Open a company → "Offer suggestion". Step 1, "Research the website" (free): reads up to four pages of their own public site, one second apart and only where robots.txt allows, and lists the gaps it can see (no booking or enquiry form, no analytics, no social links, out-of-date footer, and so on) plus what is already in place. Step 2, "Suggest offers with AI" (Claude credits, only on click): drafts 1 to 3 ideas, each with the automation, the outcome to sell, why this company, what to measure, a first pilot step and the risk, plus a true opening line and questions for a call. "Add to notes" saves one to the company notes. |
| How far can I trust the suggestions? | Absence means "not found on the pages read", never "they don't have it". Social media pages are not read (the platforms block it), only whether the site links to them; Google reviews are not checked. Every suggestion must cite a finding; ones with no evidence are marked low confidence, and any figure the AI adds that wasn't in the research is flagged. Ideas that would touch the business's own customers' personal data are marked "Needs a DPA first". |
| Offer suggestion cost and model | `SUGGEST_MODEL` (alias or full model id; blank = Sonnet) and `SUGGEST_DAILY_CAP` (default 15) in `.env`. Research is free. The optional web search uses 2 of your Brave searches (`SEARCH_API_KEY`, `SEARCH_DAILY_CAP`) and is off unless you tick the box. Companies that have opted out or are suppressed aren't researched. |
| Find local businesses on Google Maps (Apify) | Companies → "Find local businesses on Google Maps (Apify)". Needs `APIFY_TOKEN` (console.apify.com → Settings → Integrations; also a Codespaces secret). Pick a niche, a search phrase, a town and how many places (max 50). Each result is matched to Companies House (free) and ranked A/B/C with the reasons on hover; tick the ones to add. Verified active limited companies are ticked by default; unmatched ones (often sole traders or trading names) can be added but stay blocked until you find their company number. Added leads keep the Maps rating, reviews, categories and location, and their filing health and fit score are fetched automatically. |
| How is the Apify free plan protected? | Apify refuses any run whose spend cap is under $0.50, so every run carries a $0.50 safety cap (`APIFY_MIN_RUN_CAP_USD`) and the number of places is what keeps the real cost down. Before each search the app cuts the places to fit today's budget (`APIFY_DAILY_BUDGET_USD`, default $0.15) and this month's (`APIFY_MONTHLY_BUDGET_USD`, default $4 of the $5), using your real recorded costs and your live Apify usage, and it uses the higher of its price estimate and the real cost per place from your last run, so a wrong estimate corrects itself. A search is refused if your Apify account has less than the $0.50 cap left for the month. Only one search runs at a time and only when you click. Start with 10 places and compare the recorded cost with the Apify console. |
| Apify answered 400 | The message now includes Apify's own reason, e.g. `max-total-charge-usd-below-minimum` (the cap must be at least $0.50). Paste it as it appears. Rejected requests (4xx) stop immediately instead of retrying. |
| What does Apify add that Companies House can't, and the reverse? | Companies House is free and tells you which companies are active, limited and healthy, and roughly how big, but has no phone, website, reviews or contact details. Google Maps (Apify) gives phone, website, rating, reviews, exact location and generic emails, but can't tell you who may legally be contacted. Run them together: Apify finds, Companies House verifies, and one priority score ranks the merged result. Use the free Companies House search for broad lists and Apify when you want contact details and local signals for a specific area. |
| How is the priority score worked out? | Out of 75, with reasons shown: +30 verified active limited company, +10 website, +10 generic email found, +5 phone, +10 for 15 to 400 reviews (+3 above that), +10 for a 3.0 to 4.4 rating (room to improve; +6 at 4.5 and above, +4 below 3), -20 if temporarily closed. A business not matched to Companies House is capped at 40, so never an A. Not-eligible and permanently closed businesses are skipped. A is 55 and over, B is 35 and over. |
| Audit refuses my text | By design the intake refuses email addresses and phone numbers. Use a role or team ("Office manager"), not a person. |
| Error messages missing in a production build | Next.js hides messages thrown by server actions in production. The audit actions return `{ error }` instead, and `ToastForm` shows it. Prefer that pattern for new actions. |
| Restore failed with a duplicate key on `stage_history` | Fixed: `agency.restore` now switches user triggers off while loading and on afterwards (a restored deal used to fire the stage-history trigger and collide with the backup's own rows). It is covered by `tests/test_restore.py`. If you ever restore by another route, disable triggers first. |
