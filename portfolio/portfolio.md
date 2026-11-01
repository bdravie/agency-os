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
