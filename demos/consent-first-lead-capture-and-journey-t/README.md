# Consent-first lead capture and journey tracker (demo)

**Outcome:** everyone who signs up on the website, joins the newsletter or fills in a LinkedIn form ends up once in one contact list, with a record of exactly what they agreed to and when. The team can see at a glance who is ready for a personal note, and anyone who opts out is never contacted or added back.

**This is a demo.** It runs on a made-up partnerships consultancy, *Fernhollow Partners*, and 25 invented contacts on reserved example.com, example.org and example.net addresses. It has not been run for a client. No email is sent, nothing is posted, and LinkedIn is never accessed: its export is a sample CSV file.

**Who it's for:** small, relationship-led organisations (consultancies, charities, membership bodies) that already have a website, a newsletter and a LinkedIn presence, but whose contacts are scattered across all three with no clear view of who is warming up.

## How it works

1. **Website forms.** The site's newsletter form and *Talk to us* form post to an n8n webhook. A second route, the team view, takes the CSV that LinkedIn's lead form exports.
2. **One clean list.** n8n reads the Google Sheet once, cleans each address (case, spaces, `mailto:`, `Name <…>`, `+tags`), matches it against existing contacts and merges duplicates. A later source fills gaps but never overwrites what someone told you first. Each change is written back in one call.
3. **Consent recorded.** Every capture adds a row to the *Consent log* with the source, form version, the exact wording shown (the workflow's own copy, not whatever the page sent), the date and the lawful basis. Newsletter sign-ups start as *pending*. The confirm link opens a page with a button, and only the button confirms, so an email scanner opening the link changes nothing. No confirmation email is sent: the demo page shows the link instead.
4. **Journey stage from rules in code** (`stageOf` in `n8n-code/_helpers.js`, thresholds in Settings). The first rule that matches wins:
   - **Opportunity**: sent an enquiry, *or* a confirmed subscriber with name and organisation and 5 or more clicks.
   - **Identified**: name and organisation known, and 2 or more clicks (or confirmed with a job title).
   - **Engaged**: confirmed the newsletter, or clicked something.
   - **Discovered**: in the list, nothing confirmed or clicked yet.
5. **Follow-up drafts.** *Draft follow-ups* asks Claude Haiku for a short note to each Opportunity contact and writes it to the *Follow-up drafts* tab for a person to read. Code adds the greeting, sign-off and opt-out line, and flags any draft with a link, contact details, a figure, a promise or a track-record claim. It skips anyone on the suppression list, and anyone whose only permission is the newsletter (that covers the newsletter, not one-to-one sales emails). Unsubscribing, by link or by a request to the team, adds the address to *Suppression*, withdraws any draft waiting for review and blocks every later import.

The Google Sheet has four tabs: **Contacts**, **Consent log**, **Suppression** and **Follow-up drafts**.

## Files

| Path | What it is |
|---|---|
| `site/index.html` | The fictional consultancy's website, with the newsletter and enquiry forms |
| `site/journey.html` | The team view: LinkedIn import, click report, unsubscribe request, *Draft follow-ups*, and the four-stage board |
| `n8n/consent-first-lead-capture.json` | The n8n workflow to import (built, don't edit by hand) |
| `n8n-code/*.js` | The Code nodes' JavaScript, readable and editable |
| `prompts/follow-up-note.md` | What Claude is told when drafting a follow-up |
| `scripts/build-workflow.py` | Rebuilds the workflow from the two folders above and the Settings at its top |
| `scripts/test-workflow.mjs` | 15 checks on the Code nodes, with no n8n, Google or network needed |
| `scripts/local.mjs` | Runs everything locally with no accounts: `sample` prints the whole story, `seed` + `serve` give you the pages to rehearse with |
| `scripts/load-sample.mjs` | Loads the sample data into the real n8n workflow and Google Sheet before you record |
| `sample-data/` | Invented contacts: website forms, a LinkedIn export, a click report, unsubscribe requests, and the two Loom inputs |

## Try it now, with no accounts (2 minutes)

From the demo folder:

```bash
node scripts/test-workflow.mjs        # 15 checks
node scripts/local.mjs sample         # the whole story, with stand-in drafts; add --ai for real Haiku drafts (needs ANTHROPIC_API_KEY)
node scripts/local.mjs seed && node scripts/local.mjs serve   # then open the two addresses it prints
```

The local run uses the same Code nodes as n8n, and keeps the four tabs in `out/*.csv` (git-ignored) instead of Google Sheets.

## Set it up for real (about 45 minutes the first time)

**What you need:** a Google account (free), an Anthropic API key (you have one), and n8n on the Mac (free; it needs Node 24 or newer, see the event-listing demo's README). No paid account and no sign-up beyond Google Cloud's free console.

1. **The sheet.** Make a blank Google Sheet. Name four tabs exactly `Contacts`, `Consent log`, `Suppression` and `Follow-up drafts`, and leave them empty (the first save writes the headers). Copy the ID from its address: `docs.google.com/spreadsheets/d/<ID>/edit`.
2. **Google sign-in for n8n** (free, about 15 minutes). In the Google Cloud console:
   - Create a project. Under APIs and Services > Library, enable **Google Sheets API** and **Google Drive API** (n8n's Google Sheets credential needs both).
   - OAuth consent screen: audience **External**, then add your own Google account under **Test users**.
   - Credentials > Create credentials > OAuth client ID > **Web application**, with the redirect URL `http://localhost:5678/rest/oauth2-credential/callback`.
   - Apps left in *Testing* get tokens that **expire after 7 days**, so reconnect the credential in n8n before you record.
3. **Build your copy:** `uv run python demos/consent-first-lead-capture-and-journey-t/scripts/build-workflow.py --local --sheet-id PASTE_SHEET_ID` from the repo root (the `agency-os` folder), replacing `PASTE_SHEET_ID` with the ID from step 1 and no angle brackets (zsh reads `<` and `>` as file redirection and stops with *parse error near `\n'*). It writes `n8n/local/consent-first-lead-capture.local.json` (git-ignored) with your sheet's ID filled in.
4. **Import and start:** import first, also from the repo root, then start n8n: `npx n8n import:workflow --input=demos/consent-first-lead-capture-and-journey-t/n8n/local/consent-first-lead-capture.local.json`, then `npx n8n` (leave it running and use a second Terminal window for the steps below). Open http://localhost:5678.
5. **Credentials** (n8n > Credentials > New):
   - **Google Sheets OAuth2 API**: paste the client ID and secret, then *Sign in with Google*. Pick it on **Read the sheet** and **Save to the sheet** (both are HTTP Request nodes set to *Predefined credential type > Google Sheets OAuth2 API*). If that type isn't offered there, use **Google OAuth2 API** with the scope `https://www.googleapis.com/auth/spreadsheets`.
   - **Header Auth**: name `x-api-key`, value your Anthropic key. Pick it on **Ask Claude (Haiku)**.
6. **Publish** the workflow (top right). Its webhooks only answer on `/webhook/…` once published.
7. **Load the sample data:** `node demos/consent-first-lead-capture-and-journey-t/scripts/load-sample.mjs`. It sends 30 requests at roughly one a second, which keeps inside Google's limit. Check the four tabs have filled (all but `Follow-up drafts`). If it stops with HTTP 500, open the red run in n8n's Executions: *Bad request* on **Read the sheet** usually means a tab name doesn't match exactly, or the file is an uploaded .XLSX rather than a Google Sheet.
8. **Open the pages.** Run `node demos/consent-first-lead-capture-and-journey-t/scripts/local.mjs serve` (just to serve the pages and sample files; it uses port 5690 because n8n keeps 5679 for itself) and open the address under *With n8n*, `http://127.0.0.1:5690/?hook=http://localhost:5678/webhook/lead-capture`. The page remembers the address, and the strip at the top links to the team view. Add `&sheet=<ID>` to the team view's address for an *Open the Google Sheet* button. Double-clicking `site/index.html` also works, but then the *Use the Loom row* button is hidden, so you pick the CSV by hand.

To change a `.js` file, the prompt or the Settings, edit it, run the builder again and re-import. To start again, clear the four tabs (keep the tab names) and rerun step 7.

## Running cost

- **AI:** one Claude Haiku 5.5 call per follow-up draft. The live run on 23 Nov 2026 used 4,805 tokens in and 731 out for 5 drafts, about £0.0007 in all at $0.10 and $0.50 per million tokens, so well under a tenth of a penny each. Nothing else uses AI.
- **Google Sheets API:** free for standard use. Each request is one read and at most one write.
- **n8n:** free on the laptop. A client build needs it running all the time: n8n Cloud or a small server.
- **Per run of the sample data:** 30 webhook calls to load it (30 Sheets reads, 24 writes), then 7 more for the Loom steps, including 5 AI calls.

## What data it touches

**The demo:** 25 invented contacts on reserved example domains, a fictional business, and no real person, company or LinkedIn data. Nothing is sent.

**A real build would hold personal data** about the client's own prospects: names, work emails, organisation, role, what they agreed to and their clicks. That is the point of the job, so for a client it needs a data processing agreement first, with Google (Sheets), Anthropic (drafts) and the n8n host listed as sub-processors. The privacy notice should say what is kept, and the sheet should be shared with the team only. What the demo already does to keep it proportionate:

- Only what a form asked for is stored. Enquiries have emails and phone numbers masked before they are saved or sent to the AI.
- The team view shows names and stages, never addresses.
- The suppression list keeps the address only so nobody is added back.
- Everything typed into a cell is stored as text, so a typed formula can never run in the sheet or in a CSV export of it.

## What I learned (for the call)

**Google Sheets as the "CRM" (via n8n).**
- n8n's Google Sheets node offers Append, Append or Update, and Get Row(s). Append or Update matches on a column you choose. On an empty sheet it writes the header row from the item's keys, but only when "Handling extra data" is left on its default, *insert in new column*.
- For this demo I used n8n's HTTP Request node with the Google Sheets credential instead. That gives one `values:batchGet` read and one `values:batchUpdate` write per request, so the merge and dedupe logic is plain code that can be tested without Google.
- Writing with `valueInputOption: RAW` means nothing typed into a form is treated as a formula.
- Limits: 300 reads and 300 writes a minute per project, and **60 a minute per user**, with no daily cap. Going over returns HTTP 429, and Google's advice is exponential backoff. Requests under 2 MB are recommended. Standard use is free, though Google says charges for going over quota are planned for later in 2026.
- The honest limit for a client: a sheet is fine for hundreds of contacts and one or two editors. It has no record locking, so two people editing the same row at once is a risk, and it has no built-in audit trail beyond version history.
- Sign-in: a Google Cloud OAuth client with both the Sheets and Drive APIs enabled. A *Testing* app's tokens expire every 7 days, so a client build should publish the app or use a service account.

**LinkedIn lead forms.**
- Lead Gen Forms are filled in on LinkedIn, pre-filled from the member's profile, and downloaded as a CSV from Campaign Manager (Assets > Lead gen forms > Download leads). LinkedIn also offers lead gen forms on Pages.
- You can add up to 5 custom tick boxes (optional or required) for consent, and members can revoke consent per lead.
- Retention: older LinkedIn guidance says lead data is kept for 90 days, but its current privacy page says 365 days. Either way, download regularly.
- I couldn't find an official list of the CSV's column headings, so the importer accepts several spellings and treats any column with "consent", "newsletter" or "marketing" in its heading as the newsletter tick. **Check it against a real export before quoting.**
- For a real-time feed instead of a download, LinkedIn has integrations with marketing and CRM platforms. That is where the client's CRM choice matters.

**Consent records (ICO and PECR).**
- Keep who consented, when, how, and exactly what they were told, as specific as the consent itself. For an online form, keep the data submitted plus a timestamp linked to the version of the form they saw, which is why the Consent log has a form-version column.
- Records should be easy to update when someone changes their mind, and consent must not be bundled into terms and conditions.
- Double opt-in is not a legal requirement in the UK, but it is strong evidence that the person signing up owns the address.
- Newsletter consent covers the newsletter. A personal sales email to an individual needs its own basis (they asked, or they ticked for it), which is why drafts skip newsletter-only contacts.
- The lawful bases written in the demo are sensible defaults for talking through, not legal advice. The client's privacy notice decides.

**n8n webhooks.**
- The production `/webhook/…` address only works once the workflow is published. Test runs use a separate test address.
- *Allowed Origins (CORS)* defaults to `*`, and the docs say it applies to "cross-origin non-preflight requests". So the pages post as an ordinary form (`application/x-www-form-urlencoded`), which needs no preflight. The workflow's single Respond node adds `Access-Control-Allow-Origin`.
- The webhook payload limit is 16 MB.

**If they ask "CRM inside the website or a separate platform?"** This demo deliberately doesn't choose one. It shows the minimum any option must do, which is a useful checklist when comparing low-cost tools:
- Store consent wording and dates per contact.
- Keep a suppression list that also blocks imports.
- Merge duplicates on import.
- Take the website forms and the newsletter tool's data in automatically.
- Show a simple pipeline.

A sheet plus n8n is the cheapest "good enough" start. Moving to a CRM later means mapping these four tabs onto its contact fields, so nothing is wasted.

Sources: [n8n Google Sheets node](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.googlesheets/), [n8n Google OAuth2 setup](https://docs.n8n.io/integrations/builtin/credentials/google/oauth-single-service/), [n8n Webhook node](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.webhook/), [n8n custom API operations](https://docs.n8n.io/integrations/custom-operations/), [Google Sheets API limits](https://developers.google.com/workspace/sheets/api/limits), [LinkedIn Lead Gen Forms](https://www.linkedin.com/help/lms/answer/73944), [LinkedIn lead forms for Pages](https://www.linkedin.com/help/linkedin/answer/a599807), [LinkedIn lead form privacy](https://www.linkedin.com/help/linkedin/answer/87080), [ICO: recording consent](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/lawful-basis/consent/how-should-we-obtain-record-and-manage-consent), [ICO: PECR electronic mail marketing](https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/guidance-on-direct-marketing-using-electronic-mail/how-do-we-comply-with-the-pecr-electronic-mail-marketing-rules/). Read on 23 Nov 2026.

## Making it real for a client

- **Send the confirmation email** from their newsletter tool or mailbox, with the same link, and set `show_confirm_link_on_page` to `no`.
- **Put the team view behind a login**, or drop it and use the sheet itself, with filtered views per stage.
- **Check webhook requests** (a secret or signature from the form tool), and add rate limiting on the public form.
- **Feed in real clicks** from the newsletter tool's export or API, and real LinkedIn leads from the download or an integration.
- **Move to a CRM** when the list or the team outgrows a sheet. The four tabs map onto contacts, consent fields, a suppression list and tasks.
