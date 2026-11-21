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
The numbers in brackets are Make's module ids, which the mappings refer to (`{{10.pdf_base64}}` is module 10's output), so they are not in running order.

| # | Module | Settings |
|---|---|---|
| 1 | **Gmail > Watch emails** | Connection: the test Google account (see "Gmail connection" below). Filter type: Gmail filter. Query: `label:invoices-demo has:attachment filename:pdf`. Mark email as read: no (the label is what limits it). Maximum number of results: 10. |
| 2 | **Gmail > List email attachments** | Message ID: `{{1.id}}`. One bundle per attachment, so it also does the Iterator's job. |
| 3 (9) | **Gmail > Make an API Call** | URL `/v1/users/me/messages/{{1.id}}/attachments/{{2.id}}`, method GET. Add a **filter** "PDF only" on the link into it, two conditions joined with **OR**: `{{2.mimeType}}` equal to `application/pdf`, or `{{lower(2.filename)}}` contains `.pdf` (some mail apps send PDFs as octet-stream; a logo or a .docx is skipped). |
| 4 (10) | **Tools > Set variable** | Name `pdf_base64`, lifetime one cycle, value `{{replace(replace(9.body.data; "/-/g"; "+"); "/_/g"; "/")}}`. Gmail's API returns base64url (`-` and `_`); Claude and Drive want standard base64 (`+` and `/`). |
| 5 (3) | **Anthropic Claude > Make an API Call** | URL: `/v1/messages`. Method: POST. Header `content-type: application/json`. Body: paste `claude-request-body.json` from this folder; its `data` field holds `{{10.pdf_base64}}`. Regenerate the file with `run_local.py make-body` whenever you edit `prompts/invoice-extract.md`. |
| 6 (4) | **JSON > Parse JSON** | JSON string: the text block of the reply, `{{last(map(3.body.content; "text"; "type"; "text"))}}`. Data structure: generate it from one example reply (the cached replies in `.cache/invoice-extract/` are examples). |
| 7 (5) | **Google Drive > Search for files/folders** | Search: folders, query `name contains '{{4.project}} - '` inside `Invoices (demo)`. Limit 1. |
| 8 (6) | **Google Drive > Upload a file** | Folder: `{{ifempty(5.id; "<id of the _Needs review folder>")}}`. File name: `{{4.invoice_date}} {{4.vendor}} {{ifempty(4.invoice_number; "no number")}}.pdf`. Data: `{{toBinary(10.pdf_base64; "base64")}}`. |
| 9 (7) | **Google Sheets > Add a row** | Sheet: the tracker, tab `Tracker`, table contains headers: yes (range `A1:Z1`). Map: Received `{{1.date}}`, Email from `{{ifempty(1.fromEmail; 1.from.address)}}`, Subject `{{1.subject}}`, File `{{6.name}}`, Drive link `{{6.webViewLink}}`, Vendor `{{4.vendor}}`, Invoice no `{{4.invoice_number}}`, Invoice date `{{4.invoice_date}}`, Amount `{{4.amount}}`, Project `{{4.project}}`, Extraction notes `{{join(4.unclear; "; ")}}`, Status `New`. |
| 10 (8) | **HTTP > Make a request** | GET `<web app address>?key=<CHECK_KEY>`. Follow redirects: yes (Apps Script answers through a redirect). Parse response: yes. The reply is `{"ok":true,"checked":1}`. |

## Problems met on the first runs (17 Nov 2026)

- **`PDF cannot be empty` from Claude.** The attachments that come with Watch emails had no file data in this account, so `toString(2.data; "base64")` sent an empty string. Fixed by listing the attachments and fetching each one through Gmail's API (steps 2 to 4 above).
- **`403: PERMISSION_DENIED - The caller does not have permission` on Add a row**, after the PDF had already been read and filed. The Sheets connection is the same Workspace account as Drive and has the spreadsheets scope, so the cause is the sheet itself: it was not editable by that account (most likely made while the browser was signed in to another Google account). Open the tracker, check the account at the top right, and either share it with the Workspace account as an Editor or make it again in that account (then update `tracker_spreadsheet_id` in `demo-ids.json` and the web app address, since the script is bound to the sheet). A protected Tracker tab gives a different message ("protected cell or object").
- **`400: INVALID_ARGUMENT - Unable to parse range: 'Tracker'!A1`** (21 Nov): the spreadsheet had no tab called exactly `Tracker`. Run **Invoices (demo) > Set up demo tabs** in the sheet; in Make, pick the tab from the list rather than typing it, so you can see Make finds it.
- **`BundleValidationError: Missing value of required parameter 'useQuerystring'` and `'useMtls'`** on the HTTP module (21 Nov): the API-created module lacked two settings the editor normally fills. Open the module, set Query String to Yes (keeping the `key` item) and Use Mutual TLS to No, then save. The builder now sets both.
- Each failed run still filed its PDF in Drive, so empty the project folders before a take.

Scheduling: every 15 minutes is plenty for invoices; for the Loom, press **Run once** after sending the test emails.

Error handling: right-click module 3 > **Add error handler > Break** with 3 retries, so a busy API retries instead of dropping an invoice. If extraction still fails, the PDF has not been filed and the email stays read but unlogged: the real build adds a route that logs a `Review` row saying "could not read".

## Gmail connection (read this first)

**With the Workspace business account (the demo's choice):** sign in with Make's normal Google connection. If the Workspace admin console limits third-party apps (Security > Access and data control > API controls), Make must be allowed there first. The connection's access covers the whole mailbox even though the scenario reads only `label:invoices-demo`, so remove it after recording if it is not needed.

**With a personal @gmail.com instead:** Make's documentation says a personal `@gmail.com` account cannot use Make's own Google sign-in for Gmail; it needs a **custom OAuth client** made in Google Cloud (free): create a project, enable the Gmail API, set up the consent screen as "External / Testing", add the test account as a test user, create an OAuth client (web application) with the redirect URI Make gives (`https://www.integromat.com/oauth/cb/google-restricted`), and paste its ID and secret into Make's advanced connection settings. Google will show an "unverified app" warning on your own test account; that is expected for a testing-mode app. A Google Workspace account avoids most of this. Drive and Sheets connect with Make's normal sign-in.

## Credits per invoice (estimate)

8 credits per PDF (attachment fetch, set variable, Claude call, parse, Drive search, upload, sheet row, check call) plus 2 per email (trigger, list attachments). A failed run on 17 Nov used 9 for one email up to the sheet row, which matches. 12 sample invoices in 3 emails ≈ 100 credits, inside the Free plan's 1,000 a month. At the client's 150 to 200 invoices a month that is about 1,300 to 1,800, so the client would need a paid Make plan: check Make's pricing page before quoting. Confirm the count in the scenario's History after the first full run.
