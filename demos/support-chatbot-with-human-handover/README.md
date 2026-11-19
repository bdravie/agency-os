# Support chat with human handover (demo)

**Outcome:** customers get accurate answers to support questions at any hour, straight from the business's own help pages, and are walked through common fixes step by step. Anything the chat cannot settle goes to a person with the whole conversation attached, so nobody repeats themselves. The support team can see every question the chat could not answer and fill the gap in a minute.

**This is a demo.** It runs on a made-up online homeware shop, *Thistledown Home*, with 12 made-up help articles. It has not been run for a client. No real shop, customer, order or account is involved, and nothing is sent to anyone.

**Who it's for:** an online business whose support inbox fills up with the same questions (where's my order, how do I return this, I can't sign in, my payment failed). It suits teams that already keep help pages and want a chat that sticks to them, with a clean way to take over when it can't.

## How it works

1. **The customer opens the chat** on the shop's help page and types a question, or picks a common issue (*My order is late*, *I can't sign in*, *My payment was declined*) or *Talk to a person*.
2. **The app finds the closest help articles** with a plain keyword search (BM25, `lib/search.ts`) and sends **only those** to Claude (Haiku 5.5). Claude answers from them and must name the article it used. The chat shows the answer with a **Source** button that opens that article on the page.
3. **If nothing is close, or the articles don't cover it, the chat says it isn't sure** and offers a person, rather than guessing. This happens in two layers:
   - if no article scores high enough, Claude is never called (free);
   - if an article shares a word but doesn't answer the question ("gift" in *Ways to pay*), Claude must say `answerable: false`.

   Code then checks every answer before the customer sees it: the source must be one of the articles sent, and every figure in the answer (days, prices, hours) must appear in that article. An answer that fails either check becomes "not sure".
4. **Common issues are scripted step-by-step flows** (`sample-data/flows.json`): one question at a time with buttons, ending in *Has that sorted it?* No AI is involved, so the steps say exactly what the support team wrote.
5. **Handover.** Any of these hands the chat to the team:
   - the customer asks for a person;
   - two answers fail (a "not sure", or *That didn't help*);
   - the customer sounds unhappy;
   - a flow doesn't fix it.

   The chat offers two optional fields (first name, order number `TH-#####`). On *Send to the team*, the transcript (with any email addresses or phone numbers removed) and a short summary with a suggested next step from Claude are saved as a ticket. The ticket is also **added as a row in a Google Sheet**.
6. **Staff page** (`/staff`) has three tabs:
   - **Gaps to fix** lists every question the chat couldn't answer or that a customer said didn't help, with *Write an article for this*, *Ask the chat again* and *Dismiss*.
   - **Handovers** lists each ticket with its summary and transcript.
   - **Help articles** lets staff add or edit an article. The chat uses a saved article **from the very next question**, because it reads the articles on every request.

### What is real and what is a stand-in

| Part | In this demo | In a real build |
|---|---|---|
| Chat widget and help page | Real: Next.js page on this Mac (port 3100) | A widget on the client's own site |
| Answers | Real: keyword search + Claude Haiku 5.5, checked by code | Same, on the client's help articles |
| Troubleshooting flows | Real: `sample-data/flows.json` | Written with the client's support team |
| Help articles | 12 made-up articles, edited copy kept in `data/` | Their help centre (Zendesk, Intercom, Notion…) or a database |
| Tickets | Real Google Sheet via Apps Script (once set up below); always also kept in `data/tickets.json` | Their help desk, or the same Sheet |
| Staff page | No sign-in (demo) | Behind the team's own login |

## Setup (on the Mac)

Needs Node (already installed) and `ANTHROPIC_API_KEY` in the repo's `.env` (already there). The app reads the repo's `.env` itself; there is no second copy of the key.

```
cd demos/support-chatbot-with-human-handover
npm install            # first time only, about a minute
npm run dev            # http://127.0.0.1:3100  (staff page: /staff)
```

- `npm run eval` runs the 15 test questions in `sample-data/test-questions.json` through the same code as the chat and prints PASS or FAIL for each. Replies are cached in `.cache/support-chatbot/` at the repo root, so a re-run is free; `-- --fresh` ignores the cache, and `-- --search-only` tests the search alone with no Claude call.
- `npm test` runs 10 free, offline tests:
  - the sample data;
  - search;
  - the figures check;
  - email and phone masking;
  - the handover fields;
  - the article rules;
  - the Sheet call through a local stand-in that copies Google's redirect.
- `npm run reset` goes back to the 12 sample articles with no tickets and no gaps. Run it before each Loom take.
- Optional settings in `.env`:
  - `SUPPORT_DEMO_MODEL` (default `claude-haiku-5-5`);
  - `SUPPORT_DEMO_NO_LLM=1` for offline mode, which shows the closest article and is labelled as offline.

The staff page shows which model is answering and whether the Sheet is connected.

### Connect the Google Sheet (free, about 10 minutes, needs your Google sign-in)

This uses your existing Google account (the Workspace business account, as for the invoice demo). No Google Cloud project, no service account and no key file.

1. Make a new Google Sheet called `Thistledown tickets (demo)`. Go to **Extensions > Apps Script**.
2. Paste in `apps-script/Code.gs`. Then turn on **Project Settings > Show "appsscript.json" manifest file in editor** and paste in `apps-script/appsscript.json`. Save.
3. Reload the sheet and run **Support demo > Set up Tickets tab**. Google asks you to authorise the script the first time. It asks only for this spreadsheet and its menu.
4. **Project Settings > Script properties > Add property:** `TICKETS_SECRET`, set to a long random value (`openssl rand -hex 24` in Terminal makes one).
5. **Deploy > New deployment > Web app.** Set Execute as **Me** and Who has access **Anyone**, then Deploy, and copy the address ending in `/exec`.
   - "Anyone" means the address can be called without a Google login, but a call without the secret does nothing.
   - If your Workspace admin settings don't allow "Anyone", use a personal Google account for the demo sheet.
6. Add both values to the repo's `.env`:
   ```
   SHEETS_WEBHOOK_URL=https://script.google.com/macros/s/.../exec
   SHEETS_WEBHOOK_SECRET=<the same value as TICKETS_SECRET>
   ```
7. Restart `npm run dev`. The staff page now says **Google Sheet: connected**, and the next handover adds a row.
8. **If you change `Code.gs` later:** go to Deploy > Manage deployments > Edit, set Version to **New version** and Deploy. The address stays the same; until you do this, the old code keeps running.

Before a Loom take: `npm run reset`, then **Support demo > Clear demo tickets** in the sheet.

## Running cost

Measured on the runs above with Haiku 5.5:

| Step | Tokens per call | Cost per call |
|---|---|---|
| An answered question | about 900 in, 80 out | about $0.00013 |
| A handover summary | about 850 in, 350 out | about $0.00026 |
| A question with no close article | none (Claude is not called) | free |
| Troubleshooting flows | none (no AI) | free |

- **AI:** at Haiku 5.5's list price ($0.10 in and $0.50 out per million tokens), 3,000 questions and 150 handovers a month would come to roughly $0.45. Check the Anthropic usage page after the first real runs.
- **Google Sheets and Apps Script:** no charge for this use on a normal Google account.
- **Hosting:** £0 while it runs on this Mac. For a client, it runs on their existing web host or a small Node host; check that provider's current price.
- **The whole demo run** (15 eval questions plus the Loom steps) cost under one US cent.

## What data it touches

The chat runs on the shop's **business information**: help articles, opening hours, policies and troubleshooting steps.

Customer chats can hold personal data, because people type what they type. So the demo keeps collection to a minimum:

- Email addresses and phone numbers are removed in code before anything goes to Claude or is saved. The chat tells the customer it removed them.
- The handover asks only for an optional first name and an order number in the shop's format. Anything else is refused.
- Only the question, the chosen articles and the last few chat turns go to Claude; the handover summary also sends the masked transcript.
- Tickets are kept in `data/tickets.json` (git-ignored) and the demo Sheet.

This demo uses only the made-up shop and fake details typed during the recording (*Sam*, *TH-10482*).

**A real build needs a data processing agreement with the client before any real customer chats.** It would also need:

- the client's privacy notice next to the chat;
- Anthropic and Google listed as sub-processors;
- a retention period for tickets and transcripts;
- a rule that the chat never asks for card details, passwords or health information.

Left out on purpose:

- live chat with a human agent in real time;
- voice, WhatsApp and other channels;
- logins and real accounts;
- order look-ups;
- a paid vector database;
- fine-tuning.

Nothing is sent, posted or scraped.

## What I learned

Read on 19 Nov 2026 from each tool's own documentation, then checked by running the demo.

**Answering only from the business's own information (work I had not done)**
- The reliable pattern is: search first, send only the matching articles, and make the model say whether they answer the question. A schema with an `answerable` flag (Claude structured outputs) makes "I don't know" a normal answer, not a failure.
- **Keyword search (BM25) is enough for a help centre of tens of articles.** It is free, instant and explainable: the eval prints which words matched. Its limit is synonyms. "Parcel" would not find an article that only says "order", which is why `lib/search.ts` has a small synonym list. For hundreds of articles, or customers who phrase things very differently, embeddings would be the next step (a cost and a new service, so only when the eval shows misses).
- **Questions that share a word with an article are the risky ones.** "Do you offer gift wrapping?" matches *Ways to pay* on "gift". In the eval, Claude declined all 3 such questions (gift wrapping, warehouse collection, price matching). That is the model's judgement, though, so code adds two checks the model cannot talk its way past:
  - the cited article must be one that was sent;
  - every figure in the answer must appear in that article.

  The **Gaps to fix** list is the human safety net.
- Result on the 15 test questions: 15 of 15 as expected (12 answered from the right article, 3 "not sure").

**Claude API: structured outputs and model choice**
- `output_config.format` with a JSON schema makes the reply match the schema exactly.
  - Objects must set `additionalProperties: false`.
  - Length limits (`minLength`, `maximum` and the like) are not supported and return a 400, so lengths are checked in code instead.
  - Haiku 5.5 supports it.
- Haiku 5.5 at `effort: "low"` is plenty for answering from 1 to 3 short articles: about 900 tokens in and 80 out per answer.
- Forcing a tool call (`tool_choice`) is rejected by the newest models, so structured outputs is the cleaner way to get JSON back.

**Guided step-by-step troubleshooting (work I had not done)**
- The flows are **data, not AI**: a small JSON tree of steps and buttons. That makes them predictable and easy for a support team to edit, and testable: a test checks that every step can be reached and every button goes somewhere.
- AI handles the free-text questions; the scripted flows handle the known issues where the exact steps matter. A flow that doesn't fix the problem hands over with the path the customer took (*My order is late > Yes, I've checked it > Not moved for 2+ working days*).

**Handing a real enquiry to a person (work I had not done)**
- What makes a handover clean is that the person gets three things: the summary, the full transcript and the steps already tried. The customer never has to start again. Claude writes the summary from the masked transcript; if that call fails, a plain summary is used, so a handover never fails because of the AI step.
- Handing over on "two failed answers" counts both "not sure" replies and *That didn't help* clicks. Unhappy wording ("ridiculous", "speak to a person") hands over at once.

**Google Apps Script as a free webhook into Sheets (doPost was new to me; doGet I had used)**
- A script bound to a sheet and published as a **web app** receives POSTs in `doPost(e)`; the body is in `e.postData.contents`. It replies with `ContentService` text set to the JSON type.
- **The reply comes back through a redirect** to a one-time `script.googleusercontent.com` address, so the caller must follow redirects. A test copies this with a local stand-in.
- **Apps Script cannot read request headers**, so the shared secret has to travel in the JSON body. With "Anyone" access the address is public, and the secret is what stops strangers adding rows.
- **Execute as Me** runs the script with the owner's access, so the app needs no Google credentials at all.
- `LockService` stops two handovers writing at once.
- A value starting with `=`, `+`, `-` or `@` is prefixed with `'` so a customer's text can never become a formula.
- Limits: a cell holds up to 50,000 characters (transcripts are shortened well below that), and a run may take 6 minutes. Google's quota page lists 30 simultaneous executions per user and 90 minutes a day of *trigger* runtime on a free account. Web app calls are not triggers, and each call only adds one row.
- A deployment keeps running the version it was deployed with. Editing the code needs **Manage deployments > New version**; the address stays the same.

**Supporting the team to improve answers (work I had not done)**
- Every "not sure" and every *That didn't help* goes to **Gaps to fix**, with the closest article and the reason. Staff can write an article from the question, then *Ask the chat again* to see it answered.
- Because the articles are read on every request, there is no retraining, re-indexing or deploy: saving the article is the fix.
- The articles are the only knowledge the chat has, so better answers come from better articles, written by the people who know the business.

**Next.js 16 and Tailwind CSS 4 (Tailwind was new to me)**
- Tailwind 4 needs no `tailwind.config.js`. You add `@tailwindcss/postcss` in `postcss.config.mjs` and `@import "tailwindcss"` in the CSS. Colours and fonts are set in CSS with `@theme`, which then gives classes like `bg-sage`.
- In Next.js 16, a page's `searchParams` arrives as a Promise.
- Next caches its env-file loading. Loading the repo's `.env` from `next.config.ts` therefore needs `forceReload`; without it the key was silently skipped and the chat ran in offline mode.

## Copying for a new client

1. Replace `sample-data/articles.json` with their help articles (id, title, category, search words, text), or have `lib/store.ts` read their help centre's export.
2. Write their 2 or 3 most common issues as flows in `sample-data/flows.json` with their support team.
3. Write 15 to 30 real-looking questions (with the expected article, or `null`) into `sample-data/test-questions.json`. Run `npm run eval` until every one passes, adding search words or synonyms as needed.
4. Change the shop name in `lib/claude.ts` (`SHOP`), the wording in `prompts/`, and the colours in `app/globals.css` (`@theme`).
5. Change the order number format in `lib/text.ts` (`cleanOrderNumber`).
6. Connect their Sheet or help desk, put the staff page behind their login, and agree the data processing terms **before** real customers use it.
