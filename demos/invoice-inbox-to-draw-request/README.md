# Invoice inbox to draw request (demo)

**Outcome:** supplier invoices that arrive by email are read, filed in the right project folder and logged in the tracker without anyone typing them in, with duplicates and doubtful ones held back for a person to check. Each month's draw request is built from the approved invoices only, and an invoice can never be drawn twice.

**This is a demo.** It runs on 12 made-up invoices from 6 made-up suppliers across 3 made-up building projects. It has not been run for a client, no real invoice, supplier or Google account is used, and nothing is sent to anyone.

**Who it's for:** a builder or developer running several projects at once, whose invoices arrive in Gmail as PDFs and whose admin keeps a Google Sheets tracker and prepares a monthly draw request from a Sheets template.

## How it works

1. **Inbox.** Make.com watches a Gmail label (`invoices-demo`) for emails with PDF attachments and takes each PDF in turn (an email with four PDFs gives four invoices).
2. **Read.** The PDF goes to Claude (Haiku 5.5), which returns vendor, invoice number, date, total and project as JSON, in a fixed shape the API enforces (`output_config` JSON schema). A field it cannot see comes back empty, with a note saying why; it is told never to guess an invoice number. The prompt is `prompts/invoice-extract.md`.
3. **File.** The PDF is saved in the project's Drive folder (`MILL - Millbrook Barn`, ...) with a tidy name (`2026-10-05 Brindlewire Electrical Ltd BW-1182.pdf`). An invoice with no known project goes to `_Needs review`. *Reading comes before filing because the folder depends on the project, which is only known once the PDF has been read.*
4. **Log and check.** Make adds a row to the Tracker tab with status `New`, then calls the sheet's own script, which checks every New row against the rows above it:
   - same vendor and invoice number, or same vendor and amount: **Duplicate**, with the row it matches;
   - missing field, unknown project, an amount that is zero, negative or above the project's review limit, a future date, or any note from the extraction: **Review**, with the reasons in the Notes column;
   - otherwise **Ready** for the admin to approve. Vendor names and numbers are compared without case, punctuation or "Ltd", so `HIGHPEG SCAFFOLD HIRE LTD` and `Highpeg Scaffold Hire Limited` are the same vendor.
5. **Draw.** In the sheet, **Invoices (demo) > Generate draw...** asks for a project and a month, copies the `Draw template` tab and fills it with the Approved invoices for that project dated up to the month end that are not already in a draw. The template is filled by markers (`{{project}}`, `{{lines}}`, `{{total}}` ...) so a client's existing template only needs those markers added.
6. **No double counting.** The total is worked out in code in whole pence. Each invoice in the draw gets the draw number (`MILL-D01`) in its Draw no column, and a row with a draw number is never looked at again, so running Generate draw a second time finds nothing. Everything for that project that was left out (duplicates, review rows, not yet approved, dated after the period) and any invoice with no known project is listed on the `Draw exceptions` tab with the reason.

### What is real and what is a stand-in

| Part | Run locally (today) | In the Loom / a real build |
|---|---|---|
| Reading the PDFs | Real: Claude Haiku 5.5 reads each PDF (replies cached) | Same request, sent by Make's Claude "Make an API Call" module (`make/claude-request-body.json`) |
| Duplicate, review and draw rules | Real: `apps-script/Logic.gs`, run through Node | The same file, pasted into the sheet's Apps Script |
| Gmail | `sample-data/emails.json` | A test Gmail account and label |
| Drive folders | `output/invoice-draw/drive/` | Test Drive folders |
| Tracker, draw and exceptions tabs | CSV files in `output/invoice-draw/` | The Google Sheet, via `apps-script/Code.gs` |
| Make.com scenario | `run_local.py inbox` does its steps in order | Built from `make/scenario.md` |

## Run it locally (no accounts needed apart from your Anthropic key)

```
uv run python demos/invoice-inbox-to-draw-request/scripts/run_local.py reset
uv run python demos/invoice-inbox-to-draw-request/scripts/run_local.py inbox      # read, file, log, check
uv run python demos/invoice-inbox-to-draw-request/scripts/run_local.py approve    # demo stand-in for the admin
uv run python demos/invoice-inbox-to-draw-request/scripts/run_local.py draw --project MILL --month 2026-10
uv run python demos/invoice-inbox-to-draw-request/scripts/run_local.py draw --project MILL --month 2026-10   # again: nothing to draw
uv run python demos/invoice-inbox-to-draw-request/scripts/run_local.py show
```

- `inbox --no-llm` takes the fields from the answer key instead of Claude: free and offline, tests the rules only.
- `inbox --fresh` ignores cached Claude replies. Replies are cached in `.cache/invoice-extract/`, keyed on the PDF, prompt and model, so re-running is free.
- After `inbox`, the runner compares what Claude read with the answer key in `sample-data/invoices.json` and lists any difference.
- Sample data: `uv run python demos/invoice-inbox-to-draw-request/scripts/make_invoices.py` redraws the PDFs and `emails.json` from `sample-data/invoices.json`.
- Tests (free, offline): `node --test demos/invoice-inbox-to-draw-request/scripts/logic.test.mjs` (11 tests on the rules).

**Checked on 16 Nov 2026:** all 12 invoices read correctly by Haiku 5.5 (vendor, number, date, total, project), 0 differences from the answer key. Tracker: 8 Ready, 2 Duplicate (a resent BW-1182; CS/2026/318 re-issued for the same amount as CS/2026/311), 2 Review (no invoice number; project "Fernlea Court" unknown). After approving, `draw --project MILL --month 2026-10` made `Draw MILL-D01` with 2 invoices, £9,240.00, and 3 exceptions; the second run said "Nothing to draw". The first prompt sent 4 good invoices to Review because Haiku noted harmless things ("number labelled Our ref"); the prompt now says what counts as unclear, and the answer key check caught it.

## Setup in Google and Make.com (for the full Loom)

Not done yet: this needs the free Make.com account (API token already working) and the owner's Google Workspace account, using only a demo alias, a demo label, demo folders and a demo sheet. Only the made-up PDFs go through it.

1. **Google account.** The owner's Google Workspace business account (decided 17 Nov 2026), kept apart from real mail: add a free alternate address such as `demos@<your domain>` (Admin console > Users > the user > Alternate email addresses), make the Gmail label `invoices-demo` and a filter `to:demos@<your domain> has:attachment filename:pdf` that applies it and skips the inbox, so the watch only ever sees demo invoices. In Drive make `Invoices (demo)` with folders `OAK - Oakwood Rise`, `MILL - Millbrook Barn`, `HTH - Heath House` and `_Needs review`. Make's Gmail connection can technically read the whole mailbox (the scenario only asks for the label), so remove Make's access after recording if it is not needed (Google Account > Security > Third-party connections) and reconnect before the next take. A separate free @gmail.com works too but needs the Google Cloud OAuth client in `make/scenario.md`.
2. **Tracker sheet.** New Google Sheet > Extensions > Apps Script. Paste `apps-script/Logic.gs` and `apps-script/Code.gs` as two files, and (Project Settings > Show "appsscript.json") paste `apps-script/appsscript.json`. Reload the sheet, then **Invoices (demo) > Set up demo tabs** (Google asks you to authorise the script the first time; it asks only for this spreadsheet and its menus).
3. **The check address.** In Apps Script: Project Settings > Script properties > add `CHECK_KEY` with a long random value. Deploy > New deployment > Web app, execute as Me, access Anyone. Copy the web app address. Anyone with the address *and* the key can only trigger a re-check of New rows.
4. **Make.com.** Build the scenario from `make/scenario.md` (read its Gmail connection section first: a personal Gmail needs a free Google Cloud OAuth client).
5. **Before each take:** clear the Tracker rows below the header, delete any `Draw ...` tabs, empty the project folders, and have the 12 PDFs from `sample-data/pdfs/` ready to attach.

## Running cost

Measured on the run above: about 3,200 tokens in and 300 out per invoice with Haiku 5.5.

- **AI:** about $0.0005 per invoice at Haiku 5.5's list price ($0.10 / $0.50 per million tokens), so roughly $0.10 for 200 invoices a month. Check the Anthropic usage page after the first real runs.
- **Make.com:** about 8 credits per invoice plus 2 per email (see `make/scenario.md`). The demo's 12 fit the Free plan (1,000 credits a month); 150 to 200 invoices a month would need a paid plan. Prices are on Make's pricing page.
- **Google Sheets, Drive, Gmail, Apps Script:** no charge for this use on a normal Google account.

## What data it touches

Business data only: supplier business names, invoice numbers, dates, amounts, project names and the PDFs themselves, plus the supplier's accounts email address and the subject line. It reads only emails under one label and never stores email bodies. Invoices can carry personal data (a sole trader's name and home address, for example), so in a real build the PDFs and tracker stay in the client's own Google account, and sending them to Claude should be in the client's data processing terms. This demo uses only made-up suppliers, projects and amounts: every PDF says so in its footer, emails are `example.com` and phone numbers `07700 900xxx`. Nothing is sent to anyone; the draw request is a tab in the sheet.

Left out on purpose: invoices that are links to online pages, any approval workflow, sending the draw, accounting software and lender formats.

## What I learned

Read on 16 Nov 2026 from each tool's own documentation and Make's help and community pages. Make.com and Apps Script have not yet been run in an account for this demo; the rules were run locally on the same code.

**Make.com (new to me)**
- A scenario is a chain of modules; each module run uses a credit (most actions 1 credit; routers and error handlers are free). The Free plan has 1,000 credits a month; paid plans add credits, and Make's own AI modules can use more than 1 credit.
- Gmail > Watch emails returns each email with its attachments as an array, and the documentation suggests the attachment carries its file data. **In practice (17 Nov 2026) the data was empty**, so Claude refused the PDF. What works: Gmail > List email attachments (one bundle per attachment, so no Iterator is needed), then Gmail > Make an API Call to fetch each one, then convert Gmail's base64url to standard base64 before Claude and Drive. Map one real run before trusting a module's output.
- A Google Sheets `403 PERMISSION_DENIED` on Add a row means the connected account cannot edit that spreadsheet, not a missing scope: check which Google account owns the sheet.
- **Gmail catch:** for a personal @gmail.com account, Make's documentation says you must create your own OAuth client in Google Cloud because Gmail's scopes are restricted; Google Workspace accounts are simpler. Community threads report this as the most common setup problem.
- Make's **Anthropic Claude** app has Create a Prompt, file modules and **Make an API Call**. Its documentation does not describe sending a PDF through Create a Prompt, so the demo uses Make an API Call with the same Messages API body as the local runner, which keeps one prompt and one schema.
- Scheduling: intervals, daily, on demand, or "immediately" for some triggers; the shortest interval depends on the plan.

**Google Apps Script (new to me)**
- A script **bound** to a sheet (Extensions > Apps Script) can add a menu in `onOpen` with `SpreadsheetApp.getUi().createMenu(...)`; only bound scripts can. `ui.prompt` asks the user for text.
- `Sheet.copyTo(spreadsheet)` copies a tab, including into the same spreadsheet, as "Copy of ..."; the script then renames it.
- A script can be published as a **web app** (`doGet` / `doPost`) so another tool can call it; "execute as me" runs it with the owner's access. That is how Make asks the sheet to check new rows, guarded by a key kept in Script properties.
- Edits made through the Sheets API (which is how Make writes rows) do not fire the sheet's on-edit triggers, which is why Make calls the script directly instead of the script watching for new rows.
- Limits on a free account: 6 minutes per run, 90 minutes a day of triggered runs, 20,000 outside calls a day. A draw for one project is a few seconds. Apps Script itself has no charge.
- `LockService` stops two runs (Make's check and a menu click) writing at the same time.

**Claude reading PDFs (work I had not done)**
- A PDF goes in as a `document` block (base64); Claude reads both the text and the page image, about 3,000 tokens per page here. Limits: 32 MB per request and 100 pages for 200k-context models (600 for larger ones).
- Asking for a JSON schema in `output_config.format` means the reply always has the same fields, which is what lets Make parse it with a fixed data structure.
- Being cautious is the main tuning job: the first prompt flagged correct readings as unclear. Checking every run against an answer key showed it at once.

## Copying for a new client

1. Use their tracker: keep their column names and add the ones in `TRACKER_HEADERS` (`Logic.gs`) that are missing, or rename those to match theirs; columns are found by name.
2. Put their projects on the Projects tab (code, name, site, review limit) and paste the list into `prompts/invoice-extract.md` via `run_local.py make-body`.
3. Add the markers to their draw template (`{{project}}`, `{{period}}`, `{{draw_no}}`, `{{lines}}` under a header row, `{{total}}`); columns are matched by header name.
4. Run their sample invoices through `run_local.py inbox` with an answer key first, before connecting Make.
5. Agree the data processing terms before real invoices go to Claude.
