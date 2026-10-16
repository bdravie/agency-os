# Weekly client report

**Outcome:** a client report that writes and builds itself every Monday: branded HTML email and PDF, with plain-English wins, concerns and next actions. About 3 hours of account-manager time becomes about 40 seconds.

**Who it's for:** marketing agencies (5-30 staff) that build ad and analytics reports by hand for each client.

## How it works

1. Export last 8 weeks of ad metrics per channel to CSV (Google Ads, Meta Ads, GA4 conversions). Columns: `week_start, channel, spend_gbp, impressions, clicks, conversions, revenue_gbp`. See `sample-data/harbour_metrics.csv`.
2. **Code does all the arithmetic**: week-on-week changes, CTR, conversion rate, cost per conversion, ROAS (`src/agency/client_report/metrics.py`). The model never calculates anything.
3. Claude Sonnet writes the commentary from the finished numbers: a short summary, 3 wins, 2 concerns, 3 next actions (`prompts/client-report.md`, editable).
4. A safety check flags any figure in the commentary that is not in the numbers. If it prints a WARNING, check before sending.
5. Output: `report.html` (email-safe) and `report.pdf` in `output/client-report/<client>/`. **Nothing is sent automatically**: you review and send.

## Run it

```
uv sync
uv run python -m agency.client_report demos/client-report/sample-data/harbour_metrics.csv --client "Harbour & Co Interiors"
```

- `--no-llm`: free, offline, rule-based commentary (good for testing the layout)
- `--fresh`: ignore the cached model reply
- `--colour "#0a7d5a"`: the client's brand colour
- Agency name on the report comes from `BUSINESS_NAME` in `.env`

Open `output/client-report/harbour-co-interiors/report.html` in a browser. The first model reply is cached in `.cache/`, so re-running costs nothing.

## Running cost per client per month

- **AI:** one Sonnet call per report, about 1,500 tokens in and under 1,000 out. At Sonnet-class pricing that is roughly 2-5p per report, so about 10-25p per client per month for weekly reports. Check your Anthropic usage page for the exact figure after the first runs.
- **Hosting/scheduling:** £0 if you run it on your own machine with launchd, or about £20/month for n8n Cloud shared across all clients.
- **Data access:** CSV export (free). Direct Google Ads / Meta / GA4 API connections are a paid extra build.

## What data it touches

Business data only: ad spend, impressions, clicks, conversions and revenue totals. No customer names, emails or other personal data. Ask clients for read-only access or a CSV export, never login details.

## Pilot offer (suggested)

"I'll build this on one of your clients' real data in 48 hours, read-only access, £500-750 setup (half upfront), then £200/month per agency." Price it in hours saved: 6 hours a week at £30 an hour is £720 a month.

## Copying for a new client

Copy `sample-data/` format, change `--client`, `--colour` and the data, and edit `prompts/client-report.md` for their tone. Update the n8n workflow's client name and schedule.
