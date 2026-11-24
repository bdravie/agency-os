# Portfolio

The proposal drafter and the pitch pack only use the projects listed below with a "## " heading, so keep every claim here true. Add a `- Loom:` line to an entry once its Loom is recorded (leave it out until then). Everything marked "demo" uses fictional data: no real business, customer or result.

## Agency OS: an AI-assisted CRM and sales system I built for my own agency
- Status: working internal tool, built and used by me (not sold, not a client project).
- What it does: one Postgres database and web app that holds leads, deals, clients, quotes, proposals and content. Finds UK limited companies from Companies House and Google Maps and ranks them with one suitability score. Finds senior decision-makers through Apollo. Drafts outreach and sends it one email at a time from connected Google Workspace mailboxes, only on my click, then reads replies to those threads in an inbox. Drafts Upwork proposals with a plain-English reason for the fit score, benefits and risks of applying, suggestions to improve the fit, and milestones with estimated hours priced from my rates. Also runs process audits, quotes, call-transcript analysis and client reports.
- Built with data protection in mind, following the ICO's guidance on AI and data protection: one "may be contacted" check that every list, draft and send must pass; opt-outs and a suppression list that are permanent; company-level scraping only (named people are added only when they have engaged or are found by a click-only, capped lookup); personal data masked before saving; nothing sent automatically; AI runs only when I click, and the code (not the model) does all arithmetic and adds the compliance wording.
- Tools: Next.js, TypeScript, PostgreSQL (Neon), Python, Anthropic Claude API, Google OAuth and Gmail API, Companies House API, Apollo API, Apify, Instantly (for warm-up and bounces).
- Result: none claimed yet. It is a working system, not a case study.

## Weekly client report for marketing agencies (demo)
- Status: working demo on sample data (a fictional client, Harbour & Co Interiors).
- What it does: turns eight weeks of ad metrics (Google Ads, Meta Ads, GA4 conversions) into a branded HTML email and PDF every week, with a plain-English summary, three wins, two concerns and three next actions. Code does all the arithmetic (week-on-week change, click-through rate, cost per conversion, return on ad spend); Claude only writes the commentary from the finished numbers, and a check flags any figure in the text that is not in the data. Nothing is sent automatically: the agency reviews and sends.
- Tools: Python, Claude Sonnet, n8n workflow export, CSV in, HTML and PDF out.
- Result: demo only. Model cost is roughly 2-5p per report on sample data. Business data only (ad totals): no customer personal data.

## Summit Roofing: instant quote funnel and missed-call text-back (demo)
- Status: demo website for a fictional roofing company. Filmed on laptop and iPhone.
- What it does: a mobile-first landing page and an eight-step quote funnel (postcode and coverage check, job type, property type, photo, timing, priced options, contact details, booking slot). On submit it saves the lead, can text the customer and alert the owner, and can pass the lead to a CRM by webhook. A second page shows the missed-call text-back: a missed call turns into an instant text with a booking link. Re-skinning for another trade means editing one config file.
- Tools: Next.js 16, React 19, TypeScript, Tailwind CSS, Motion animations, Twilio SMS and ntfy push alerts (switched off in demo mode, which is the default), webhook to a CRM.
- Result: demo only, with fictional prices, postcodes, reviews and phone numbers.

## Greenline Gardens: scroll-driven landscaping website (demo)
- Status: demo website for a fictional landscaping company.
- What it does: a scroll-driven hero that walks through a garden using frames from a drone video (separate wide and portrait sets for desktop and phone), project stories revealed line by line, a before-and-after slider, a "see your garden first" preview and an enquiry form that saves to a file or database. The preview always shows a pre-made render, whatever photo is uploaded.
- Tools: Next.js 16, React 19, TypeScript, Tailwind CSS, GSAP.
- Result: demo only.

## Trades Mode: phone-first job board for a tradesperson (demo)
- Status: interactive demo app with a timed script, built to be screen-recorded on a phone.
- What it does: a job board with leads, accepted quotes, reviews and payments arriving as notifications; screens for calls, alerts and rebooking; follow-up text templates at 2, 5 and 10 days after a quote; a review-request text; a spring check-in text for past customers.
- Tools: Next.js 16, React 19, TypeScript, Tailwind CSS, Motion animations.
- Result: demo only. Twelve screen recordings of the trades demos exist (quote page, enquiry page, after the form, missed-call text-back, priced quote options, review requests, finished-jobs showcase, survey booking, instant roof estimate, quote follow-up texts, old versus new site, seasonal rebooking).

## Salon website (demo)
- Status: demo website for a fictional beauty salon.
- What it does: a fast multi-page site: home, treatments, a treatment page, about, contact and an SEO report page.
- Tools: Astro, with Unsplash photos credited in the project.
- Result: saved mobile Lighthouse reports (29 Oct 2026) score 100 for performance, accessibility, best practices and SEO on every page checked.

## Lash academy landing page (demo)
- Status: demo landing page for a fictional training academy. The trainer, testimonials and earnings figures are invented; the checkout is a mock form and takes no payment.
- What it does: a single conversion-focused page with curriculum, what's included, testimonials and a final call to action, plus an "under the hood" page with conversion and performance details for the demo.
- Tools: Astro, Pexels photos credited in the project.
- Result: saved mobile Lighthouse report for the home page (29 Oct 2026): 100 for performance, accessibility, best practices and SEO.

## Local SEO report for dental practices (demo)
- Status: demo report with fictional data for a fictional practice (Brightside Dental Studio).
- What it does: a client report showing local search rankings on a map, charts and a search-result preview, with the agency name changed in one place. Charts and map are hand-drawn SVG. A PDF version is included.
- Tools: Vite, JavaScript, JSON data file.
- Result: saved mobile Lighthouse report (30 Oct 2026): 100 for performance, accessibility, best practices and SEO.

## Demo capture kit (tool)
- Status: internal tool I use to present my demos.
- What it does: from a short config file, it opens a demo in a browser and records screenshots, a scripted walkthrough video and a contact sheet, ready for a portfolio or a Loom.
- Tools: Node.js, Playwright (Chromium), ffmpeg.
- Result: used to produce the screenshots and videos for the Upwork demos above.

## Support chat with human handover (demo)
- Status: working demo for a fictional online homeware shop (Thistledown Home) with 12 made-up help articles. Not run for a client.
- What it does: a chat on a shop's help page that answers customer questions only from the business's own help articles and shows which article it used. When the articles don't cover a question it says it isn't sure and offers a person, rather than guessing. Common problems are scripted step-by-step flows with no AI. A handover (asked for, two failed answers, unhappy wording or an unfixed flow) saves the conversation, with emails and phone numbers removed, and a short summary as a ticket, and can add it as a row in a Google Sheet. A staff page lists every question the chat could not answer so the team can write the missing article, and the chat uses it from the next question. Code checks every answer before the customer sees it: the source must be an article that was sent and every figure must appear in it.
- Tools: Next.js 16, TypeScript, Tailwind CSS, Claude Haiku, Google Sheets (through Apps Script).
- Result: demo only. On 15 made-up test questions the chat behaved as expected on all 15 (19 Nov 2026).
- Data note: customer chats can hold personal data, so a real build needs a data processing agreement first.

## Event listing to social post queue (demo)
- Status: working demo on made-up motorcycle events, run in n8n on my own machine (checked 12 Nov 2026). The events directory, the approval sheet and the Facebook Page are local stand-ins: it has not yet been tried against a real Brilliant Directories site or a real Meta app, and nothing is posted anywhere real.
- What it does: every newly published event listing becomes a ready-to-approve Facebook post and Instagram caption, with a square image card and a link back to the listing. A person approves each post, and only an approved row is published. Event IDs are logged so nothing posts twice, and a step that fails for one event is written to a failures list while the other events carry on. Claude writes the wording from the listing fields only; code checks it and adds the link and hashtags.
- Tools: n8n, Claude Haiku, Python, Playwright.
- Result: demo only.
- Data note: business data only (public event details). No organiser or attendee details.

## Invoice inbox to draw request (demo)
- Status: working demo on 12 made-up invoices from 6 made-up suppliers across 3 made-up building projects. Run end to end in Make.com on 21 Nov 2026 with a demo Gmail label, demo Drive folders and a demo Google Sheet. Not run for a client.
- What it does: supplier invoices that arrive by email as PDFs are read, filed in the right project folder in Google Drive and logged in a Google Sheets tracker without anyone typing them in. Duplicates (same supplier and invoice number, or same supplier and amount) and doubtful ones (a missing field, an unknown project, an unusual amount) are held back for a person to check. Each month's draw request is built from the approved invoices only, by filling a Sheets template, and an invoice that has been drawn is never counted again. Claude reads each PDF and is told never to guess an invoice number; code does the duplicate checks and the totals.
- Tools: Make.com, Claude Haiku, Gmail, Google Drive, Google Sheets, Google Apps Script.
- Result: demo only. On the 12 sample invoices, every field Claude read matched the answer key (16 Nov 2026).
- Data note: business data (supplier names, invoice numbers, amounts). Invoices can carry a sole trader's details, so in a real build the files stay in the client's own Google account.

## Missed-call WhatsApp text-back for clinics (demo)
- Status: demo for a fictional dental practice (Brightmoor Dental), shown with my own phone. The workflow's rules pass 15 automated checks and the assistant was tested against the live Claude API (22 Nov 2026). Not run for a client.
- What it does: a caller the front desk can't answer gets a WhatsApp from the practice within seconds instead of voicemail. An assistant asks one question at a time (new or existing patient, what it's about, a good time to call) and the front desk gets a one-line note of who to ring and when. It keeps to booking logistics and never gives clinical advice. Code, not the AI, decides when the note is ready; withheld numbers are never messaged, STOP blocks all further messages, and emails and phone numbers are masked before the AI sees a message. The website's leave-your-number form starts the same conversation.
- Tools: n8n, Twilio (voice and WhatsApp), Claude Haiku, GSAP.
- Result: demo only.
- Data note: this handles patients' phone numbers and messages, so for a real clinic a data processing agreement and DPIA come first.

## AI voice receptionist for clinics (demo)
- Status: demo for a fictional aesthetics clinic (Lumen Skin Clinic), built to be shown with my own phone. The workflow's rules pass 9 automated checks. Not run for a client.
- What it does: every call to the clinic is answered. When the team are with clients, a voice assistant says it is an AI and that the call is recorded, takes the caller's first name, whether they are new or returning, what it's about and a good time to call back, and sends the front desk a ready-to-act note on WhatsApp. Anyone who leaves their number on the website's form is rung back straight away. Booking logistics only: no treatment advice, prices or medical questions. Code requires the consent tick, limits calls per number and per day, and alerts the front desk if a call fails.
- Tools: ElevenLabs, Twilio, n8n, GSAP.
- Result: demo only.
- Data note: this handles callers' voice, number and request, and calls are recorded and transcribed, so for a real clinic a data processing agreement and DPIA come first.

## Consent-first lead capture and journey tracker (demo)
- Status: working demo for a fictional partnerships consultancy (Fernhollow Partners) with 25 invented contacts. The workflow's rules pass 15 automated checks and the whole story runs locally with no accounts. No email is sent and LinkedIn is never accessed: its export is a sample CSV file. Not run for a client.
- What it does: everyone who signs up on the website, joins the newsletter or fills in a LinkedIn lead form ends up once in one Google Sheet contact list, with a record of what they agreed to, the exact wording they were shown and when. Duplicates are merged, newsletter sign-ups stay pending until confirmed, and plain rules in code place each contact in one of four journey stages (Discovered, Engaged, Identified, Opportunity). For contacts at Opportunity, Claude drafts a short follow-up note for a person to review; code adds the greeting and opt-out line and skips anyone who unsubscribed or only agreed to the newsletter. Unsubscribes go to a suppression list that also blocks later imports.
- Tools: n8n, Google Sheets, Claude Haiku, GSAP.
- Result: demo only.
- Data note: a real build holds the client's prospects' personal data, so a data processing agreement comes first.

<!--
Not used by the proposal drafter until you fill them in (comments are ignored). Move each one above the comment, give it a "## " heading and say only what is true.

## Clinic Buddy
- Status: ? (live with a client, pilot, or demo)
- What it does: ?
- Tools: ?
- Result: ? (only a real, measurable result; leave "none claimed yet" otherwise)
- Data note: does it touch patient or customer personal data? If so, say how it is handled.

## Indulging Beauty OS
- Status: ? (this is not on this computer yet, so nothing is known about it; is it for a real client?)
- What it does: ?
- Tools: ?
- Result: ?
- Data note: as above.
-->
