# Loom script: my own CRM as a similar platform (creative agency job, about 3 min 45 s)

For an Upwork job from a creative agency that wants one system for client requests, who is doing what, where each job is up to, and optional AI help that a person always approves. The CRM is the owner's own system, built and used daily to run this business. Say that; never say it was built for or used by another business. The support chat is a **demo** on a made-up shop. The ticketing website (beat 5) was built for a real client: say "a client", never its name.

Cost and timeline are **not** in the video: they go in the written proposal, with the core platform and the AI part priced separately.

Every CRM and support-demo screen below was checked in the code on 19 Nov 2026 (route, component, button text). The code for the ticketing website is not in this repo or anywhere this session could reach, so its addresses and button labels are [fill in] placeholders.

---

## Before recording

**The big one: `DEMO_MODE` does not hide real data.** It only adds a "Demo mode" badge to the sidebar (`crm/components/Sidebar.tsx`). The live database holds real companies, contacts, email replies and proposals. Record from a separate database that only holds fake data:

1. Make a second, empty Postgres database for demos (a new database in the Neon project, or a new Neon project; check Neon's current free-plan limits first). Do not use an ordinary Neon branch of the live database: it copies the real data.
2. In a terminal on the Mac, set `DATABASE_URL` to the demo database for that terminal only (both the CRM and the Python tools never override a variable that is already set), then run `npm run db:migrate` and `uv run python scripts/seed_demo.py --dry-run`, then the same without `--dry-run`. **Never run `seed_demo.py` against the live database.**
3. Stop the live CRM, then in the same terminal run `npm run dev` in `crm/` (it gets its own build folder). `DEMO_MODE=true` stays on.
4. Make the demo records the script needs (all fake, all click-only AI, a few pence in total):
   - **Two quick-capture notes** on `/content?tab=projects`, so the Projects table has rows. Tick two or three checklist steps on one of them at `/content/<id>`.
   - **One proposal** from a made-up job at `/proposals/new`, for example "Demo: booking reminders for a made-up physio clinic". Open it, go to the **Plan and price** tab and click **Plan and price this job** once, so it is ready.
   - **One call** at `/calls/new` on a seeded demo deal: choose **Paste my notes** and paste fake notes (no names beyond the seeded fake contact, no emails or numbers). Leave it un-analysed so you can click **Analyse with AI** on camera (about 20 seconds; trim the wait in Loom), or analyse it once and use **Analyse again** at the bottom of the page (it asks before replacing).
   - Pick one seeded deal (for example "Northside Heating: weekly digest") and note its `/deals/<id>` address.
5. Support chat demo: in `demos/support-chatbot-with-human-handover` run `npm run reset`, then `npm run dev` (port 3100). In the demo Google Sheet: **Support demo > Clear demo tickets**. Follow its own `loom-script.md` "Before recording" steps (run the questions once so replies are cached, then reset).
6. Ticketing website (beat 5), built for a client:
   - Use a staging or test copy with test events and test orders if one exists. No real ticket buyer's name, email, seat or order on screen, and no real attendees in the "who's attending" chat window.
   - The public site carries the client's branding and event name, which names the client. Either get the client's OK to show it, switch it to a neutral test theme with the theme builder for the recording, or show only the admin side.
   - Choose the Google account before recording (sign in once off camera), or crop the account chooser: it shows your email and picture. Use an account that is on the site's approved list.
   - Close the Stripe dashboard and any payment details.
7. Screen hygiene:
   - No real client, company or person name anywhere on screen. Real clients are never named to a prospect; if one comes up, it is "a client".
   - Do not open **Inbox** or **Mailboxes**: on the live CRM they show real mail and your real mailbox addresses. On the demo database Inbox is empty, so it is only mentioned.
   - Close other browser tabs, turn off desktop notifications (Inbox can raise them), and hide bookmarks.
   - On the Google Sheet tab, your Google account picture and email show top right: crop or zoom past it.
   - On **Plan and price**, keep the **What to charge** table off screen (it shows your price, the Upwork fee and "You receive"). Show the milestones table only.
   - The Dashboard hero has the daily Bible verse card; decide whether you want it in this video, or start on `/tasks` instead.
   - Light theme, browser zoom about 110%, sidebar open.

---

## The script

Timings are a guide. "Say" lines are for you, in your own words; don't read the job post back to them.

### 1. Opening: what they get (0:00 to 0:20)
**Screen:** `/` (Dashboard, **Today** tab), or your face cam.
**Say:** "You want one place where every client request lands, everyone can see who's doing what, and nothing slips. I run my own business on a system like that, which I built and use every day. Everything you'll see in it is fake demo data."

### 2. Requests in one place (0:20 to 0:40)
**Screen:** `/deals/<id>` (your chosen demo deal). Show the **Overview** tab (stage bar, open tasks), then click the **Activity** tab.
**Say:** "Each client job is one record: where it's up to, what's still to do, and every email, call and change in one timeline. 'Where are we with this?' is answered on one page, not in someone's inbox."

### 3. Who's doing what (0:40 to 0:55)
**Screen:** `/tasks`. Type a task in **Add a task…**, pick a due date, click **Add task**. Point at the **Overdue / Today / Upcoming** tabs.
**Say:** "Anything that needs doing becomes a task with a date. Today it's just me; for your team, each task would have an owner, so everyone sees their own list."

### 4. Where each job is up to (0:55 to 1:20)
**Screen:** `/deals`. Drag a card from **Replied** to **Call booked**. Then `/content?tab=projects`: point at the **Progress** bars. Click a project name to open `/content/<id>` and tick a step in **Production checklist**.
**Say:** "Every job sits in a stage, and moving it is one drag. Production work has a checklist, so you can see which jobs are stuck at which step. Yours would follow how your studio actually works."

### 5. A client-facing site with team sign-in (1:20 to 1:50)
**Screen:** the ticketing website built for a client (in the pitch library as "TBG Website"), in a new tab: [fill in: public site URL, ideally a staging or test copy]. Scroll the public event page once. Then open [fill in: staff/admin URL], click [fill in: the "Sign in with Google" button's exact label], pick the account (see Before recording), and land on [fill in: the admin screen that lists orders or tickets, showing test data only].
**Say:** "This is a ticketing website I built for a client: the public side their customers use, and behind it the team's side. The team signs in with the Google accounts they already have, only approved people get in, and there are no passwords to manage. Your platform would work the same way for your staff, and for your clients too if you want them to log requests themselves."
Do not name the client or the event on camera, and claim no results for it.

### 6. AI thread starts: a request turned into a ticket (1:50 to 2:15)
**Screen:** switch to the support chat demo, `http://127.0.0.1:3100`. Click **Chat with us**, type `Do you offer gift wrapping?`, then **Pass to a person**, type **Sam** and **TH-10482**, click **Send to the team**. Switch to `http://127.0.0.1:3100/staff`, **Handovers** tab.
**Say:** "This one is a demo on a made-up shop. A written request comes in, and when it needs a person it becomes a ticket with a short AI summary, a suggested next step and the full conversation. The AI drafts; a person picks it up and decides."

### 7. Notes sorted automatically (2:15 to 2:30)
**Screen:** back to the CRM, `/content?tab=projects`. In **Quick capture note**, paste a rough note (for example "video idea: how a small clinic could follow up missed calls, show the before and after of the front desk"), click **Save & organise**. The new project appears in **Active projects** with a category and a checklist.
**Say:** "A rough note goes in and comes out sorted into the right category as a project. For you, that's a client brief landing as a categorised job, ready for someone to check."

### 8. A job broken into steps, with hours (2:30 to 2:50)
**Screen:** `/proposals/<id>?tab=plan` (your demo proposal). Show the milestones table: **Milestone and requirements**, **Ease**, **Time**. Do not scroll down to **What to charge**.
**Say:** "Give it a brief and it suggests the milestones, what each needs, how hard it is and the hours. It only suggests: code does the sums from my own rates, and I check every line. With your past jobs in the system, the hours would be checked against how long similar jobs really took."

### 9. Summaries and the next step (2:50 to 3:10)
**Screen:** `/calls/<id>` (your demo call). Click **Analyse with AI** (under **Analyse this call**). Point at **Summary and next step**, then click into the **Summary** box to show it can be edited.
**Say:** "After a call or meeting, one click gives a summary, the agreed next step and a follow-up task. It's a draft: I can edit any of it, and it only runs when I click."

### 10. Finding past work (3:10 to 3:20)
**Screen:** press **Ctrl+K** (Cmd+K on Mac). Type part of a demo company name (for example `North`) and press Enter.
**Say:** "Today this jumps to any client or page by name. For you I'd add plain-English search across past jobs, showing the matching jobs and why they matched."

### 11. Close: the approach (3:20 to 3:45)
**Screen:** face cam, or back on `/deals`.
**Say:** "The pattern is the same throughout: one place for requests and jobs first, then AI that drafts, sorts and summarises, with a person approving every step. In the proposal I've split it into the core platform and the optional AI part, priced separately, so you can start with the core and add the AI when you're ready. Happy to talk it through."

**Human approval, said along the way:** beat 5 (only approved people get in), beat 6 (a person picks up the ticket), beat 7 (ready for someone to check), beat 8 (only suggests; code does the sums; I check every line), beat 9 (draft, editable, only on click), beat 11 (a person approves every step). If there's time: "anything that goes out to a client asks me first, and names who it's going to" (the confirm dialog on **Send**, not filmed because it needs a connected mailbox).

---

## Requirement to screen

| What the job asks for | Where it is shown | Status |
|---|---|---|
| Client requests in one place | `/deals/<id>` Overview and Activity; `/companies/<id>` Activity; `/inbox` (replies to emails the CRM sent, not filmed) | Partly: per-client records and timelines, but no general request form or shared inbox for any incoming mail |
| Internal assignments | `/tasks`, tasks on a deal, `/?tab=week` | Partly: tasks and due dates, no owner per task (single user) |
| Job tracking | `/deals` board and stage bar; `/content?tab=projects` with the production checklist; `/proposals` board with days in status | Shown |
| Team accounts and logins | Client ticketing website: staff side behind "Sign in with Google", approved people only (beat 5). The CRM itself has one password login | Partly: sign-in with existing Google accounts is shown; roles and task owners are not |
| Team communication | none | Gap |
| Ticket creation from emails or written requests | Support chat demo: handover becomes a ticket and a Sheet row | Partly: from a chat, not from an email; and it is a demo, not in the CRM |
| Automatic categorisation | Quick capture note on `/content?tab=projects` (AI on save, Haiku) | Shown (for content notes) |
| Suggested project checklists | Plan and price milestones with requirements (`/proposals/<id>?tab=plan`) | Partly: AI milestones are per job; the production checklist is a fixed 7-step template, not AI-suggested |
| AI ticket summaries | Support demo handover summary; `/calls/<id>` Analyse | Shown |
| AI progress updates | `/calls/<id>` next step and follow-up task; "Explain this week" on `/content/insights` (content numbers only, not filmed) | Partly: no automatic per-job progress update |
| Natural-language search of past jobs | Ctrl/Cmd+K quick jump (company name, trading name, domain, page names); filter box on `/proposals` | Gap |
| AI estimates from historical data | Plan and price: AI estimates hours from the brief, code prices from `config/rates.yaml` | Partly: not based on past jobs |
| AI subject to human approval | Every AI step is click-only (except quick-capture sorting on save); editable call summary; chat hands over to a person; send, post and book ask first | Shown |

## Gaps and what to say

1. **Roles and task owners.** Sign-in with existing Google accounts is shown on the client ticketing website, but the CRM has one login (`APP_PASSWORD`) and tasks have no owner column. *Say:* "You saw the team sign-in on the ticketing site. Yours would add roles for who can see and approve what, and an owner on every task." (Check whether the ticketing site has roles before saying it does.)
2. **Team communication.** No comments, mentions or messages between people. *Say:* "Each job would get its own comment thread with @mentions and notifications, so the conversation about a job sits on the job, not in chat apps."
3. **Tickets from email.** The CRM reads only replies in threads it sent itself, and the support demo creates tickets from a chat. *Say:* "Client emails to a shared address would arrive as draft tickets, with the AI's suggested category, summary and checklist, and someone on the team accepts or edits them."
4. **Natural-language search of past jobs.** Nothing exists beyond name matching (no full-text index, no embeddings in `db/migrations`). *Say:* "I'd store every job's brief, notes and outcome, and let people ask in plain English; the AI turns the question into filters and the results always link to the real records."
5. **Estimates from history.** Plan and price reads the brief, your profile and your rates, not past jobs. *Say:* "Once there's a year of jobs in it, estimates would start from how long similar jobs actually took, shown side by side so a person decides."
6. **Per-job progress updates.** Summaries exist for calls, not as a running update on a job. *Say:* "A 'write an update' button on a job would draft a client-ready status from its tasks and timeline, for someone to edit and send."

**One small demo worth building (a day or less), covering gaps 4 and 5, the biggest ones:**
"Ask your job history" (`demos/job-history-search/`, via `/new-demo`; the proposal's **Demo brief** tab can write the brief). About 40 made-up past jobs for a made-up studio (brief, client type, service, hours, date) in a small database or JSON file. A plain-English question goes to Claude Haiku, which returns filters only (service, client type, date range, keywords); code checks the filters and runs the search, so every result is a real record with "why it matched". A second panel shows the hours of the closest similar jobs (median and range worked out in code) as a starting point for an estimate, labelled for a person to decide. Fake data, called a demo, no figures claimed.

## Things on screen that could leak real data

- **The whole live database.** `DEMO_MODE` is only a badge. Record from the demo-only database above, or not at all.
- **Inbox and Mailboxes**: real replies, sender names and your mailbox addresses. Don't open them.
- **Proposals**: on the live database, real job titles, client first names and your Upwork pipeline. On the demo database, only the made-up proposal. Even then, keep **What to charge** (your rate, Upwork fee, take-home) off screen.
- **Ctrl/Cmd+K**: it searches all companies as you type; only type a demo name.
- **Desktop notifications** from Inbox, and other browser tabs or bookmarks.
- **Google Sheet** in the support demo: your account picture and email top right.
- **Google account chooser** on the ticketing website's sign-in: it shows your email and picture. Choose the account off camera, or crop.
- **Ticketing website**: real ticket buyers' names, emails, seats and orders, the attendee chat window, and the client's branding and event name. Test data only, and the client only as "a client".
- **Command-line or `.env` windows**: never on screen (they hold `DATABASE_URL` and keys).
