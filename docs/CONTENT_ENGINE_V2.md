# Content Engine v2: build plan

**Goal:** turn the Content tab from an idea list into a system that learns. It should know what is working for me, what is breaking out for the creators I follow, and what is trending in my niches, and use that to decide what I film next.

**Where we are (1 Nov 2026):** 39 ideas, 1 scripted, 0 filmed, 0 posted. The one scripted item (GUESTS) was due on 17 Oct. `content_items` has no niche, pillar or performance fields. The `posts` and `post_metrics` tables from milestone 9 were never created. The ManyChat webhook (milestone 6) and the Social Engine (milestone 12) are not built. `prompts/video-ideas.md` still contains the template niche line. The ideas cover Airbnb hosts and HVAC, but `focus_niches` is hvac, roofing and pest_control, and the live deals are dental and clinic businesses.

**How to use this file:** put it in the repo as `docs/CONTENT_ENGINE_V2.md`. In Claude Code, run one milestone at a time: paste its prompt, then tick its done-checklist before starting the next. Every milestone follows `CLAUDE.md`. That means:
- schema changes only through a new dbmate migration
- commit with `node tools/git/sync.mjs`
- AI only on click, unless a milestone says otherwise
- prompts kept in `prompts/`
- each model set by an environment variable in `crm/lib/llm.ts`
- maths in code with tests, never done by the model
- every page working in `DEMO_MODE`
- British English throughout

**Build order:** C0 → C1 → C2 → C3 → C4 → C5 → C6 → C7 → C8 → C9. Most of the value is in C0–C4 (posting, measuring, learning). C5–C6 add the creator tracker. C7–C9 make it smarter and faster.

---

## Kick-off prompt (paste first)

> Read CLAUDE.md, BUILD_PLAN.md and docs/CONTENT_ENGINE_V2.md. Then read the current content code: `crm/lib/content.ts`, the content actions in `crm/lib/actions.ts`, `crm/components/ContentBoard.tsx`, `crm/components/ContentDrawer.tsx`, `crm/app/content/**`, and `prompts/video-ideas.md`, `content-ideas.md`, `video-script.md` and `repurpose.md`. Summarise in 10 lines how the content engine works today. List anything in CONTENT_ENGINE_V2.md that conflicts with CLAUDE.md or the existing code. Change nothing yet.

---

## C0: Housekeeping and focus (small, do first)

> Build C0 of docs/CONTENT_ENGINE_V2.md.
> 1. Add an `Archived` content status, hidden from the board by default, with a "Show archived" toggle. Add bulk select on the Ideas column with Archive and Delete buttons. Delete asks for confirmation first.
> 2. Add `content:` to `config/niches.yaml` with three settings: `posts_per_week` (default 4), `max_open_ideas` (default 15), and `content_niche` (default: the first of `focus_niches`).
> 3. Replace the template "Niche (edit this line)" in `prompts/video-ideas.md` with a placeholder `{{NICHE}}`. Fill it from `content_niche` in `crm/lib/content.ts`, and ask me to confirm the wording.
> 4. On the Today page, add a "Content" card showing: posts this week against the target, scripts overdue (`scheduled_for` in the past and status not Posted), and filmed but not posted.
> 5. When open Ideas number more than `max_open_ideas`, disable "Generate 20 video ideas" and explain why ("Script or archive some first"), with an override link.

**Done when:**
- [ ] I can archive 30 ideas in under a minute *(built and checked against the database in a rolled-back transaction; still to click through in the app)*
- [x] The Today page shows the overdue GUESTS script *(built 1 Nov 2026; it also lists idea 20, an HVAC idea scheduled for 17 Oct)*
- [x] Generating ideas is blocked while the backlog is over the limit *(blocked on the page and again in the server action; "Generate anyway" overrides)*
- [x] Tests pass and the feature works in `DEMO_MODE` *(254 tests; the Today card and board read the same tables in demo mode)*

**Decided 1 Nov 2026:** content niche = trades and clinics, stored as `content_niche: [trades, dental, aesthetics]` with a written `content_audience` sentence in `config/niches.yaml`. `focus_niches` (hvac, roofing, pest_control) is untouched: it still drives lead searches.

**My job, not Claude's:** choose one content niche that matches who I'm selling to, archive the ideas that don't fit, and film the GUESTS script (or a version for my niche).

---

## C1: Schema for posts, metrics, creators and trends

> Build C1 as one new dbmate migration, `content_v2`. Never edit an applied migration.
> - `content_items`: add `niche text`, `pillar text` (Show the build / Build in public / Teach / Niche pain), `hook_type text` (the 8 formulas in `video-ideas.md`), `length_s int`, `source text NOT NULL DEFAULT 'manual'` (manual / generated / outlier / trend / pipeline / repurpose), `source_ref text`, `idea_score int`, `idea_score_reason text`, `archived_at timestamptz`.
> - `posts` (from milestone 9): `id`, `content_item_id` references `content_items`, `platform` (tiktok / instagram / youtube / linkedin), `external_id`, `url` (unique), `hook_used text`, `posted_at`, `created_at`.
> - `post_metrics`: `post_id`, `captured_at`, `age_hours`, `views`, `likes`, `comments`, `shares`, `saves`, `follows`, `avg_watch_s numeric`, `source` (api / manual). Unique on (`post_id`, `age_hours` bucket).
> - `creators`: `id`, `platform`, `handle` (unique per platform), `profile_url`, `niche`, `why_i_follow text`, `active bool`, `last_checked_at`.
> - `creator_posts`: `id`, `creator_id`, `platform`, `external_id` (unique), `url`, `caption`, `posted_at`, `duration_s`, `views`, `likes`, `comments`, `shares`, `outlier_score numeric`, `breakdown jsonb`, `fetched_at`. Public post metadata only: no commenter names, no follower lists, no personal data.
> - `trend_signals`: `id`, `source` (manual / reddit / google_trends / sound), `niche`, `title`, `detail`, `url`, `score numeric`, `seen_at`, `used_in_content_id`.
> - `content_runs`: `tool`, `cost_usd`, `items`, `ran_at`, so scraping spend can be seen.
>
> Add indexes. Back-fill `pillar` from the existing `format` values. Extend `scripts/seed_demo.py` with fake posts, metrics, creators (fake handles like `@demo_creator_1`), creator posts and trends.

**Done when:**
- [x] `npm run db:migrate` runs cleanly *(`20261106100000_content_v2.sql`, 2 Nov 2026)*
- [ ] Demo seed fills every new table *(not done: `scripts/seed_demo.py` has no content section and Python cannot run on this Mac yet, so it could not be tested; the tables are filled by real use instead)*
- [x] Existing cards keep their data *(all 40 kept their text, status and keyword; pillar was back-filled from format)*

---

## C2: Posting and measuring (the feedback loop)

> Build C2.
> 1. Moving a card to Posted opens a small dialog: platform(s), post URL for each, and which hook was used. It saves `posts` rows. Allow adding more platforms later from the drawer.
> 2. In the drawer, add a Performance section. It shows metrics at 24 h, 72 h and 7 days, with a "Enter numbers" form (views, likes, comments, shares, saves, follows, average watch time) for platforms with no API.
> 3. Add `src/agency/social/analytics.py`. It pulls metrics for posts under 8 days old from the Upload-Post API (`UPLOAD_POST_API_KEY`), stores them in the right age bucket, and logs one activity per run. Check Upload-Post's docs for what each platform returns, and write the limits into `docs/SETUP.md`. Cache responses in development.
> 4. Add `scripts/launchd/com.agencyos.content-metrics.plist` to run it every 6 hours.
> 5. Add `crm/lib/contentMath.ts`, with tests. For each post, compute a **performance score** = views at 72 h ÷ my median views at 72 h over my last 20 posts (shown as e.g. "2.4×"), plus save rate, share rate and comment rate. Show it on the card on the board.

**Done when:**
- [ ] I can mark a video posted with its links in under 30 seconds *(built: moving a card to Posted opens the dialog; still to try in the app)*
- [x] Numbers appear by API or by hand *(by hand is built; the API half is deferred, see below)*
- [x] Each Posted card shows its × score *(per platform, e.g. "Instagram 2.5×")*
- [x] Tests cover the maths, including fewer than 3 posts ("not enough data yet")

**Decided 2 Nov 2026:** platforms are Instagram and LinkedIn (`content.platforms` in `config/niches.yaml`). LinkedIn is posted and measured by hand to avoid any risk to the account; Instagram numbers are also typed in for now. The app never posts anything.
**Changed from the plan:** the × score compares a post with your other posts *on the same platform*, because an Instagram play and a LinkedIn impression are not the same thing. `post_metrics` has a `bucket` column (24 / 72 / 168) so each checkpoint is one row.
**Parked on the pre-launch list in `BUILD_PLAN.md` (owner is happy to do this by hand for now, 2 Nov 2026):** C3 (ManyChat webhook) and the automatic numbers below.
**Deferred (items 3 and 4 above):** `analytics.py` and its launchd job. `UPLOAD_POST_API_KEY` is empty, Upload-Post is a paid plan, and it is not known whether it can read posts made by hand in the Instagram app. Revisit once there is a key and the docs have been read.

---

## C3: Keyword comments → leads → revenue

> Build C3: the `manychat` webhook from milestone 6, scoped to content.
> 1. Build `/api/webhooks/manychat`. It verifies `MANYCHAT_WEBHOOK_SECRET` and accepts keyword-triggered events. It matches the keyword (case-insensitive) to the most recent posted `content_items.keyword` and logs an `engaged` activity with `post_id` and `content_item_id` in `meta`. It stores no Instagram usernames, and creates no Contact unless the event has an email the person gave by replying. In that case it creates a Contact with `consent_basis = 'Gave email in reply to content keyword <KEYWORD>'`.
> 2. Keywords must be unique among items that are not archived. Warn in the drawer if one is reused.
> 3. In the drawer and on the board card, show: keyword triggers, leads, calls booked, deals and £ won, attributed by first touch from `meta.content_item_id`.
> 4. Document the ManyChat setup in `docs/SETUP.md`: the keyword rule, the DM that ManyChat sends, and the webhook. The DM sending is done by ManyChat, which I set up myself. The CRM itself still never sends DMs. Add one line saying this to the business rules in CLAUDE.md, and ask me to approve the wording first.

**Done when:**
- [ ] A test webhook with keyword GUESTS logs an activity on that item
- [ ] A bad secret is refused
- [ ] Revenue attribution shows £0 correctly when nothing is won yet

---

## C4: "What's working" page

> Build C4: `/content/insights`, in the CRM's dark theme, keyboard-friendly and filmable.
> - Rank pillars, hook types, formats, niches, video length bands and posting weekday/hour by **median** performance score. Show the post count for each, and grey out any group with fewer than 3 posts.
> - Show the top 5 posts and bottom 5 posts with their hooks side by side.
> - Show a funnel by pillar: views → keyword triggers → leads → calls → £.
> - Add a "Next 5 to film" list: open Ideas ordered by `idea_score`, boosted when their pillar or hook type is a current winner. The ranking is done in code, and each idea shows why it was boosted.
> - All numbers are computed in `contentMath.ts`. Add a click-only "Explain this week" button: Haiku writes 3 plain-English observations and 3 things to try, using only the computed numbers (prompt `prompts/content-insights.md`, `CONTENT_MODEL`).

**Done when:**
- [x] The page works on demo data *(checked on throwaway posts, which were then deleted; with no posts it shows an empty state that says what is missing)*
- [x] Small samples are clearly marked *(groups under 3 posts are greyed, labelled "too few" and never ranked or boosted)*
- [x] The AI text never states a number that isn't in the table it was given *(`numbersNotIn` is tested, and the button re-asks once, then refuses to show an answer with a stray number)*

**Built 2 Nov 2026 at `/content/insights`.** Because C3 is parked (see the pre-launch list in `BUILD_PLAN.md`), the funnel runs views to keyword replies only; replies are counted by hand from the video's drawer (`content_keyword_reply` activities, a count with no username). Leads, calls and £ per video come with C3. Videos are grouped by tags set in the drawer (pillar, hook type, niche, length). Until C7 tags new ideas automatically, untagged posts fall in "Not set".

---

## C5: Creator tracker (outlier finder)

**Needs my approval before it is built:** this is the first feature that reads social platforms. The rule to add to CLAUDE.md is:

> "Creator tracking reads only public post metadata (URL, caption, date, duration, view/like/comment/share counts) from creators I add by hand, via Apify, click-only or on a capped schedule. It never reads comments, commenter names, follower lists or DMs, never tracks private individuals or leads, and is never used for outreach."

> Build C5.
> 1. Add a Creators page (`/content/creators`) to add, edit and pause creators (platform, handle, niche, why I follow them).
> 2. Add `crm/lib/creatorScrape.ts`, reusing the patterns in `apify.ts` and `apifyMath.ts`. It runs an Apify profile-posts actor for TikTok or Instagram (pick actors with per-result pricing and record the actor IDs in `config/creators.yaml`). It fetches the last 30 posts per creator, keeps only the allowed fields, and upserts `creator_posts`.
> 3. Set budgets in `CONTENT_APIFY_DAILY_BUDGET_USD` and `CONTENT_APIFY_MONTHLY_BUDGET_USD`, kept separate from the lead-search budget. Use the same minimum run cap rules, record the real cost in `content_runs`, and show the cost before each run.
> 4. Add a "Check now" button per creator and for all creators, plus `src/agency/social/creators.py` with a daily launchd plist (off by default).
> 5. Compute the **outlier score** in code: views ÷ that creator's median views over their last 30 posts, counting only posts at least 48 h old. Flag posts at 3× or more, and make the threshold configurable.
> 6. Add an Outliers inbox (`/content/outliers`): newest flagged posts first, showing creator, × score, caption, and a link to watch it. Buttons: Break down (C6), Dismiss, Save to swipe file.

**Done when:**
- [x] I can add 10 creators *(up to 25 active, by handle or profile link, on `/content/creators`)*
- [ ] One run stays within budget and prints its cost *(built and tested end to end against a stand-in Apify server, including the daily and monthly limits; a real run waits for `APIFY_TOKEN`)*
- [x] Outliers appear ranked *(`/content/outliers`: newest first, each with its × score; best-scoring shown on the card)*
- [x] No disallowed fields are stored *(allow-list in `creatorMath.ts`; tests feed in comments, commenter names, mentions and tagged people and check none reach the result or the database)*

**Decided 2 Nov 2026 (owner approved, research only):** the rule is rewritten in `CLAUDE.md` ("Creator research"). It is looser than the plan's version where that helps the research (bio, link in bio, follower count, hashtags, sound, saves and a keyword found in the caption are now kept) and keeps the lines that protect other people (no comments, commenters, followers lists, DMs, mentions or private accounts), which the goal does not need.
**Changed from the plan:** 20 posts per check instead of 30 (cheaper; enough for a median); a creator needs 8 old-enough posts before anything is called an outlier; LinkedIn creators are saved but never checked automatically; checks are click-only, so `creators.py` and its schedule were not built. **Actors** (in `config/creators.yaml`): TikTok `clockworks~tiktok-profile-scraper`, Instagram `apify~instagram-reel-scraper` plus `apify~instagram-profile-scraper`, YouTube `streamers~youtube-scraper`. The output field names were checked against each actor's published output list on 2 Nov 2026. For Instagram they have also been checked against Apify's documented sample output (reel, feed post and profile; `crm/tests/creatorApifySamples.test.mjs`), including that commenters, mentioned and tagged people are dropped. TikTok and YouTube are not yet checked against real output, and none has had a live run: look at the first real run on each platform.
**Not built yet (C6):** the Break down button on an outlier.

---

## C6: Outlier breakdown → idea for my niche

> Build C6: the click-only Break down button (prompt `prompts/outlier-breakdown.md`, `CONTENT_MODEL`, default Sonnet).
> - Input: the caption, the stats and the × score, plus an optional transcript that I paste in (no automatic video download).
> - Output, as structured JSON saved to `creator_posts.breakdown`:
>   - the hook (first line) and which of my 8 hook types it is
>   - format, length and structure beats
>   - why it likely worked, phrased as hypotheses and not facts
>   - the call to action
>   - 3 adapted ideas for my `content_niche`, each with a hook in my voice
> - The prompt must say: borrow the structure and angle, never copy the wording or the script. Only claim results I can truly show.
> - "Add to Ideas" saves an idea with `source = 'outlier'`, `source_ref` = the creator post URL, and pillar and hook type filled in.
> - Track later in C4 whether outlier-sourced ideas beat generated ones.

**Done when:**
- [x] One click turns an outlier into 3 ideas on my board, with a link back to the original *(Break down on `/content/outliers`, then Add to Ideas on each of the three; each lands with `source = 'outlier'`, `source_ref` = the post link, and pillar, hook type and niche filled in)*

**Built 2 Nov 2026.** Prompt `prompts/outlier-breakdown.md`, model `BREAKDOWN_MODEL` (default Sonnet), cap `BREAKDOWN_DAILY_CAP` (20 a day), checks in `crm/lib/breakdownMath.ts`. The rules are enforced in code, not just asked for: any six words in a row copied from the original caption or transcript, a money amount, percentage or multiplier, an `@` name or the creator's own name, a hook over 14 words, or fewer than 3 usable ideas sends the answer back once with the problems listed, and if it still fails nothing is saved. A pasted transcript has emails and phone numbers masked and is never stored. The breakdown is saved on `creator_posts.breakdown`. "Where the idea came from" on What's working compares outlier-sourced ideas with generated and hand-written ones once they have been posted.

---

## C7: Ideas from evidence, not from nothing

> Build C7: upgrade `generateIdeas` in `crm/lib/content.ts`.
> 1. Build a context digest in code (max ~1,500 tokens) from:
>    - my top 5 posts and their hooks (C4)
>    - the 10 most recent unused outlier breakdowns (C6)
>    - unused trend signals (C8)
>    - a "pipeline pains" digest: the most common gaps in `offer_research` findings and deal plans in the last 30 days, anonymised (no company or person names, enforced in code)
> 2. The generator must spread ideas across the weekly pillar mix in `video-ideas.md`, and fill `niche`, `pillar`, `hook_type` and `source`.
> 3. Add `scoreIdeas`: Haiku gives each new idea an `idea_score` from 1 to 10 with a one-line reason, against my winners and my niche. Ideas scoring below 5 are created already archived, and can be shown with "Show low scores".
> 4. Add a "Pipeline content" button: from one deal's research findings, write 3 build-in-public or niche-pain ideas that name the pattern but never the business (e.g. "I read 20 dental websites; most had no enquiry form").
> 5. Generate fewer ideas: change the button to "Generate 10".

**Done when:**
- [x] New ideas arrive tagged and scored, mixed by pillar, and citing their source *(checked on your real data: exact 4/2/2/2 pillar mix, niche, pillar and hook type on every idea, source cited, low scores set aside)*
- [x] A test proves company names from deals never appear in the digest *(`ideaEvidenceMath.test.mjs`; also checked against the 269 real names, domains and contacts in the CRM and your 3 real deals)*

**Built 2 Nov 2026.** Generate 10 (was 20) from `crm/lib/ideaGeneration.ts`: evidence is your top 5 posts, up to 10 unused outlier structures, trends from the last 14 days not yet used, and gaps seen at 2 or more different businesses in the last 30 days (never one business's own gap, never a line naming a business, domain or contact). The AI (`CONTENT_MODEL`, default Haiku) must give the exact pillar mix, may cite an evidence item (kept only if it was really supplied) and may not state a money figure. Haiku then scores every idea 1 to 10 (`prompts/idea-score.md`); under 5 is saved already archived. Pipeline content writes 3 ideas from one deal, using only counts the code supplied ("2 of the 2 dental sites I researched"), and refuses anything naming a business, an @, a figure or an unsupplied number. **Niche filter:** Content and What's working take `?niche=`; Generate and New idea let you pick the niche.

---

## C8: Trend radar and weekly brief

> Build C8.
> 1. `trend_signals` inputs:
>    - (a) a manual "Add trend" form (paste a link and a note, for things I see in my feed, TikTok Creative Center, trending sounds and so on)
>    - (b) optionally, `src/agency/social/reddit.py`: top posts this week from subreddits listed per niche in `config/niches.yaml`, using Reddit's official API within its free terms, titles and links only, no usernames
>    - (c) a "Search interest" check for my niche terms, only if there is a supported, terms-compliant way to do it. Otherwise skip it and write down why in `docs/SETUP.md`.
> 2. Add `src/agency/social/weekly_report.py` (milestone 12). Every Monday via launchd it writes a one-page brief, with all numbers computed in code:
>    - last week's posts and × scores
>    - best hooks and pillars
>    - keyword leads, calls and £
>    - new outliers
>    - top trends
>    - "Film these 5" (from C4's ranking)
>
>    Sonnet writes only the prose (`prompts/weekly-content-brief.md`). Save it to a `content_briefs` table (add a small migration) and show it at `/content/brief`, linked from Today.

**Done when:**
- [ ] The Monday brief appears on demo data
- [ ] Every number in it matches the Insights page

---

## C9: Make filming fast

> Build C9.
> 1. **Filming day:** select up to 5 Ideas, then press "Script all". This runs `writeScript` on each, one at a time with progress, and moves each to Scripted. Then open `/content/film`: a full-screen teleprompter (large text, adjustable speed, space to pause, arrow keys between scripts) with the on-screen text and shot list beside it. A "Mark filmed" button sits on each.
> 2. **Hook tests:** store 2 hooks per item. When posting, record which hook went on which post (or on an Instagram trial reel). C4 compares hook A against hook B when both have data.
> 3. **Repurpose a filmed item:** one click turns a filmed item into platform variants (TikTok, Reels, Shorts captions, a LinkedIn text post, and an Upwork portfolio blurb). Each is saved as a linked content item with `source = 'repurpose'`.
> 4. **Posting slots:** the Calendar suggests slots from my best weekday and hour (C4) and the `posts_per_week` target.

**Done when:**
- [ ] I can script and film 5 videos in one sitting from the app
- [ ] Every posted video has a hook recorded

---

## Running costs to watch

| Item | How it's capped |
|---|---|
| Apify creator scraping | `CONTENT_APIFY_*` budgets, recorded in `content_runs` and shown on the Creators page |
| Upload-Post | Check the plan limits before scheduling every 6 hours; drop to daily if needed |
| AI calls | Haiku for scoring and insights, Sonnet for scripts, breakdowns and the brief. All click-only except the Monday brief |

## Things I need to decide or set up

- [x] Content niche to match who I'm selling to: trades and clinics *(decided 1 Nov 2026)*
- [ ] Platforms I'm posting on
- [ ] The first 10 creators to track (handles + why)
- [ ] Approve the creator-tracking rule (C5) and the ManyChat line (C3) for CLAUDE.md
- [ ] Accounts: Upload-Post API key, ManyChat Pro + webhook secret, Apify token (already used for leads)
