# Make.com scenario: build sheet (demo)

The scenario is built by code (17 Nov 2026): `scripts/build_blueprint.py` reads `make/demo-ids.json` (Drive folder IDs, sheet ID, web app address) and the account's connections, writes `invoice-inbox.blueprint.json` with `<CHECK_KEY>` in place of the key, and with `--create` makes the scenario in Make, inactive and on demand. Make's API refuses a blueprint with an unknown module name (`IM007`), which is how the names below were checked; it does not check each module's field names, so open every module once in Make after creating it. Module names that do not match Make's menu labels: Gmail is `google-email:triggerWatchNewEmails` v4 (`watchEmails` also exists but is deprecated, shown as "(NOT USED)"; the API accepts it, so check the label in Make), Claude is `anthropic-claude:makeAnApiCall` v1, Sheets uses the connection called `google`. For a new client, change the IDs and run it again, or import the saved file and fill in the key.

The table below is what the script builds, and the way to build it by hand.

Everything below uses test accounts and the made-up PDFs in `sample-data/pdfs/`.

## Before you start

- The **Google Workspace business account** (README, Setup step 1) with the tracker sheet set up (README, Setup step 2) and, in its Drive, a folder `Invoices (demo)` holding one folder per project: `OAK - Oakwood Rise`, `MILL - Millbrook Barn`, `HTH - Heath House`, and `_Needs review`.
- In that Gmail, a label `invoices-demo` and a filter that puts mail with PDF attachments sent to the demo alias (`demos@<your domain>`) under it and skips the inbox. The watch query below only reads that label.
- The sheet's web app address and its `CHECK_KEY` (README, Setup step 3).
- An Anthropic API key (your existing one is fine; set a low monthly spend limit for the demo).

## The modules, in order

| # | Module | Settings |
|---|---|---|
| 1 | **Gmail > Watch emails** | Connection: the test Google account (see "Gmail connection" below). Filter type: Gmail filter. Query: `label:invoices-demo has:attachment filename:pdf`. Mark email as read: yes. Maximum number of results: 10. |
| 2 | **Flow control > Iterator** | Array: `{{1.attachments}}`. Add a **filter** on the link after it: `{{2.contentType}}` equal to `application/pdf` (so a logo or a .docx is skipped). |
| 3 | **Anthropic Claude > Make an API Call** | URL: `/v1/messages`. Method: POST. Body: paste `claude-request-body.json` from this folder. Its `data` field holds `{{toString(2.data; "base64")}}`, which turns the attachment into base64 text. (Check this on the first run: Make's mapping panel shows the attachment's binary field as **Data**; if the name differs, map that field into `toString(...; "base64")`.) Regenerate the file with `run_local.py make-body` whenever you edit `prompts/invoice-extract.md`. |
| 4 | **JSON > Parse JSON** | JSON string: the text block of the reply, `{{last(map(3.body.content; "text"; "type"; "text"))}}`. Data structure: generate it from one example reply (the cached replies in `.cache/invoice-extract/` are examples). |
| 5 | **Google Drive > Search for files/folders** | Search: folders, query `name contains '{{4.project}} - '` inside `Invoices (demo)`. Limit 1. |
| 6 | **Google Drive > Upload a file** | Folder: `{{ifempty(5.id; "<id of the _Needs review folder>")}}`. File name: `{{4.invoice_date}} {{4.vendor}} {{ifempty(4.invoice_number; "no number")}}.pdf`. Data: `{{2.data}}`. |
| 7 | **Google Sheets > Add a row** | Sheet: the tracker, tab `Tracker`, table contains headers: yes. Map: Received `{{1.date}}`, Email from `{{1.from.address}}`, Subject `{{1.subject}}`, File `{{6.name}}`, Drive link `{{6.webViewLink}}`, Vendor `{{4.vendor}}`, Invoice no `{{4.invoice_number}}`, Invoice date `{{4.invoice_date}}`, Amount `{{4.amount}}`, Project `{{4.project}}`, Extraction notes `{{join(4.unclear; "; ")}}`, Status `New`. |
| 8 | **HTTP > Make a request** | GET `<web app address>?key=<CHECK_KEY>`. Follow redirects: yes (Apps Script answers through a redirect). Parse response: yes. The reply is `{"ok":true,"checked":1}`. |

Scheduling: every 15 minutes is plenty for invoices; for the Loom, press **Run once** after sending the test emails.

Error handling: right-click module 3 > **Add error handler > Break** with 3 retries, so a busy API retries instead of dropping an invoice. If extraction still fails, the PDF has not been filed and the email stays read but unlogged: the real build adds a route that logs a `Review` row saying "could not read".

## Gmail connection (read this first)

**With the Workspace business account (the demo's choice):** sign in with Make's normal Google connection. If the Workspace admin console limits third-party apps (Security > Access and data control > API controls), Make must be allowed there first. The connection's access covers the whole mailbox even though the scenario reads only `label:invoices-demo`, so remove it after recording if it is not needed.

**With a personal @gmail.com instead:** Make's documentation says a personal `@gmail.com` account cannot use Make's own Google sign-in for Gmail; it needs a **custom OAuth client** made in Google Cloud (free): create a project, enable the Gmail API, set up the consent screen as "External / Testing", add the test account as a test user, create an OAuth client (web application) with the redirect URI Make gives (`https://www.integromat.com/oauth/cb/google-restricted`), and paste its ID and secret into Make's advanced connection settings. Google will show an "unverified app" warning on your own test account; that is expected for a testing-mode app. A Google Workspace account avoids most of this. Drive and Sheets connect with Make's normal sign-in.

## Credits per invoice (estimate)

Roughly 7 credits per PDF (trigger share, iterator, Claude call, parse, Drive search, upload, sheet row, check call). 12 sample invoices ≈ 85 credits, inside the Free plan's 1,000 a month. At the client's 150 to 200 invoices a month that is about 1,000 to 1,400, so the client would need a paid Make plan: check Make's pricing page before quoting. Confirm the real count in the scenario's History after the first run.
