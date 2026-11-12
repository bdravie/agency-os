# Handover: CRM redesign and Content dashboard (11 Nov 2026)

For the next coding agent picking this up. Read `CLAUDE.md` and `BRAND_SHEET.md` first: they are the rules. This file says what the owner asked for, what is done, what is half done, and what comes next.

## How the owner wants this run

- Eleven sections, built **one at a time**. After each one the owner tests it and says "go on N" before the next starts. Do not start a section without that.
- Explain a change in one or two sentences, then do it. Plain British English, no jargon.
- Nothing is committed or pushed yet (see "Git" below).

## The four decisions the owner accepted

1. **Coral replaces the old orange** across the CRM. The public site (`site/`) is not part of this.
2. **Particles and a gradient are allowed**, in the dashboard hero only. The brand sheet's "nothing loops" and "no gradients" rules need rewriting to say so (not done yet).
3. **Pipelines keep an "All" tab** (today's board, with drag) plus one tab per stage.
4. **Notes are categorised by AI without a click**: the one exception to "AI only on click". Cheapest model, daily cap. Record it in `CLAUDE.md` when built.

## Section 1: colours and theme. DONE, awaiting the owner's test

Palette, used exactly: Navy `#14213D`, Cream `#F4EDE0`, Coral `#FF6B5B`. Lagoon teal stays for "done".

- `crm/app/globals.css`: new token block for light and dark. New tokens `--ring` (focus ring; plain Coral is under 3:1 on Cream) and `--shadow-2` (was used but never defined). Errors (`.error`) carry a "!" mark and a tint; `.tone-bad` is the only outlined badge, because Coral sits close to red.
- Text on Coral is Navy (`--on-accent`). Coral as text uses `--accent-text`. Never white on Coral.
- `crm/app/icon.svg`: Coral with a Navy "A".
- `BRAND_SHEET.md` section 1 and the brand line in `CLAUDE.md` are updated. `docs/brand-sheet-preview.html` still shows the old orange palette.
- Checked: every text and background pair is 4.5:1 or better in both themes; 484 CRM tests and the type check passed.
- Left open: quote, audit and outcome PDFs (`crm/lib/quote-pdf.ts`, `auditPdf.ts`, `outcomePdf.ts`) still use an old blue. The owner has not said whether to change them.

## Section 2: dashboard redesign and particles. CODE DONE, not yet checked in a browser (awaiting the owner's test)

Written:

- `crm/lib/particleField.ts`: canvas drift (`startParticles`, `dotCount`). About 30 frames a second, pauses when the tab is hidden or the hero is off screen, one still frame under "reduce motion", colours read from the tokens.
- `crm/components/Particles.tsx`: the canvas.
- `crm/components/SectionTabs.tsx`: the shared pill menu bar. Links with `aria-current`, optional count, `hot` for a Coral count, arrow keys move between tabs. **Section 3 reuses this.**
- `crm/app/globals.css` (end of file): `.tabs*` and `.hero*` styles. The hero carries `data-theme="dark"` so everything inside uses the dark tokens in both themes. Cards in the hero are glass, and the ring is redrawn as a masked band (`.hero .ring::before` with `--p: inherit`, which takes the parent's animated value).
- `crm/app/page.tsx`: hero (date, greeting, next meeting, three pace cards) then tabs through `?tab=`: Today (default), `week`, `pipeline`, `activity`. A late backup shows as an error line on every tab.
- `crm/tests/particleField.test.mjs`: unit test for `dotCount`.
- `BRAND_SHEET.md` (sections 5, 6 and 7) and `CLAUDE.md` updated for the hero particles, gradient and section menu bar.
- Checked: type check passes; all 485 CRM tests pass (`gcal.test.mjs` needs a local port, so it fails inside a sandbox but passes outside one). Not checked: how it looks in a browser. The login hook blocks reading `.env`, so an agent can't sign in to see the dashboard. The masked ring and glass cards still need the owner's eyes.

Owner test step:

1. Run `bash scripts/update-crm.sh` in Terminal and check the Dashboard (`/`) in both light and dark themes (hero particles, glass pace cards and masked rings, and switching between Today, This week, Pipeline and Activity tabs), then say `"go on 3"` when ready for Section 3.

## Section 3a: section menu bar pilot on Proposals. CODE DONE, awaiting the owner's test

Written:

- `crm/components/SectionTabs.tsx` and `crm/app/globals.css` (`.tabs`): added optional `right` pill bar so secondary tabs sit on the right with keyboard arrow navigation across both bars.
- `crm/app/proposals/page.tsx` and `crm/components/ProposalBoard.tsx`: `SectionTabs` on `/proposals` with `All`, `Draft`, `Sent`, `Viewed`, `Replied`, `Interview`, `Won`, `Lost` on the left (with live counts and a Coral `hot` badge when a stage has quiet proposals to chase) and `Archived`, `Deleted` and `Proof and answers` on the right. `All` keeps the full stacked board with drag between stages; each stage tab shows that stage on its own.
- `crm/app/proposals/[id]/page.tsx`: `SectionTabs` switching between `Draft` (default for plain proposals), `Fit`, `Plan and price`, `Loom pitch` (default when `pitch_mode = 'loom'`, with a Coral count when a scripted Loom is still waiting to be recorded) and `Better fit`, with `ProposalStageBar` kept above the tabs.
- `BRAND_SHEET.md` and `CLAUDE.md`: updated so pipelines (`Deals`, `Proposals`) and `/proposals/[id]` document the section menu bar instead of saying the old layout is fixed.

## Section 3b (Find and win group): CODE DONE, awaiting the owner's test

Written:

- `crm/app/sourcer/page.tsx` and `crm/app/sourcer/sourcer.css`: replaced the old `.sx-tabs` underline bar with `SectionTabs` (`Search`, `Find one company`, `Enrich`).
- `crm/app/companies/page.tsx`: replaced the `.pills` view switcher with `SectionTabs`, putting workflow views (`All`, `Qualified`, `Ready to email`, `Needs website`, `Needs email`, `Follow-ups due` with a Coral `hot` badge when due, `Contacted`, `Replied`, `Clients`) on the left and compliance/size checks (`Not verified`, `Size unknown`, `Filing problems`, `Blocked`) on the right.
- `crm/app/companies/[id]/page.tsx`: kept the status stepper and next-step banner at the top and split the 15 stacked sections across six `SectionTabs` tabs (`Overview`, `Research & offer`, `People`, `Outreach`, `Deals & work`, `Activity`).
- `crm/app/deals/page.tsx` and `crm/components/Board.tsx`: added `SectionTabs` to `/deals` with `All` (full board with drag between stages), one tab per stage (with a Coral `hot` badge when a stage has deals quiet for 7+ days), and `Deleted` on the right.
- `crm/app/deals/[id]/page.tsx`: kept the stage card at the top and split the deal sections across four `SectionTabs` tabs (`Overview`, `Offers & quotes`, `Calls & audits`, `Activity`).
- `crm/lib/jump.ts`, `crm/components/SectionTabs.tsx`, `crm/components/ActivityItem.tsx`, and `crm/tests/activityTarget.test.mjs`: added `tabForSection` so clicking an activity row, a dashboard feed link, or the next-step banner switches to the right tab and flashes the target section.

## Section 3c (Remaining sidebar groups): CODE DONE, awaiting the owner's test

Written:

- `crm/app/tasks/page.tsx`: added `SectionTabs` for `All`, `Overdue` (with Coral `hot` badge when > 0), `Today`, `Upcoming`, and `No date`.
- `crm/app/inbox/page.tsx`: added `SectionTabs` for `Unread` (with Coral `hot` badge when > 0), `All replies`, and `Automatic replies`, with mailbox filters sitting cleanly beneath.
- `crm/app/calls/page.tsx`: added `SectionTabs` for `All`, `Analysed`, `Saved` (with Coral `hot` badge when > 0), and `Failed`, with `Objection Library` on the right.
- `crm/app/quotes/page.tsx`: added `SectionTabs` for `All`, `Draft` (with Coral `hot` badge when > 0), `Sent`, `Accepted`, and `Declined`.
- `crm/app/clients/page.tsx`: added `SectionTabs` for `All`, `Active`, `Paused`, and `Ended`.

## Section 4: Content dashboard. CODE DONE, awaiting the owner's test

Written:

- `crm/components/nav-items.ts`: renamed "Content" to "Content dashboard" with updated hint.
- `crm/components/ContentTabs.tsx`: shared `ContentTabs` menu bar switching between `Overview`, `Board`, `Projects`, `Calendar`, `Analytics`, `Research`, `Brief` on the left, and `Footage` and `Thumbnails` on the right.
- `crm/app/content/page.tsx`: replaced the eight header action buttons with `ContentTabs`. Under `Overview`: stats (weekly target, open ideas, top performer), next 5 to film, latest brief headline & actions, and quick links. Under `Board`: niche filter, idea generator, and drag-and-drop pipeline board. Under `Projects`: active projects table. Under `Footage` and `Thumbnails`: feature previews for Sections 7 and 8.
- `crm/app/content/calendar/page.tsx`, `crm/app/content/insights/page.tsx`, `crm/app/content/brief/page.tsx`, `crm/app/content/creators/page.tsx`, `crm/app/content/outliers/page.tsx`, and `crm/app/content/trends/page.tsx`: integrated `ContentTabs` across all content sub-pages, with sub-pills on Creators, Outliers, and Trends to move between research sections.

## Section 5: Categories and Analytics graph. CODE DONE, awaiting the owner's test

Written:

- `db/migrations/20261119100000_content_categories.sql`: database migration creating `content_categories` table (`id`, `key`, `label`, `colour`, `active`, timestamps) seeded from `content.content_niche` in `config/niches.yaml` (`trades`, `dental`, `aesthetics`).
- `crm/lib/categoryTimeSeries.ts`: pure time series aggregation grouping post performance across months per category, and `slugifyNicheKey`.
- `crm/lib/contentCategories.ts`: category loading with graceful fallback to `config/niches.yaml` so the CRM works both before and after the migration is run.
- `crm/lib/categoryActions.ts`: server actions to add a category, rename and recolour it with brand tokens, and toggle active status (retire / reinstate).
- `crm/components/CategoryGraph.tsx`: responsive interactive SVG graph of category performance over time (metrics toggle: multiplier, 72h views, post count; legend category toggles; hover tooltips) with zero external charting packages.
- `crm/components/CategoryManager.tsx`: collapsible category manager on screen with brand color options and retire/reinstate controls.
- `crm/app/content/insights/page.tsx`: integrated `CategoryGraph` and `CategoryManager` while keeping all existing benchmark tables intact.
- `crm/tests/categoryGraph.test.mjs`: unit tests for category slugification and monthly time series calculation.

## Section 6: Video organiser and quick capture. CODE DONE, awaiting the owner's test

Written:

- `db/migrations/20261120100000_video_organiser.sql`: database migration adding `notes` to `content_items`, permitting source `'quick_capture'`, and creating `content_projects` (`id`, `content_item_id`, `raw_notes`, `summary`, `talking_points`, `checklist`, `footage_path`, timestamps) with cascade delete.
- `crm/lib/quickCaptureMath.ts`: pure validation refusing contact details (emails and UK/international phone numbers via `checkNoteSafety`), extracting fallback titles under 60 chars, and computing 7-step checklist progress and statuses.
- `crm/tests/quickCapture.test.mjs`: unit tests for contact detail refusal, creative notes allowance, title extraction, and checklist maths.
- `prompts/quick-capture-categorise.md`: AI categorisation prompt classifying raw notes into working title, niche, pillar, hook type, suggested opening hook, talking points, and summary.
- `crm/lib/quickCaptureCategorise.ts`: auto-categorisation module on save (decision 4) using `claude-haiku-5-5` with `QUICK_CAPTURE_DAILY_CAP` (default 50/day) and graceful heuristic fallback if offline or capped so notes are never lost.
- `crm/lib/quickCaptureActions.ts`: server actions to save and auto-categorise quick-capture notes, toggle checklist steps and sync `content_items.status`, and assign raw footage paths.
- `crm/components/QuickCaptureBox.tsx`: quick-capture box with live client-side contact detail checks and Coral styling.
- `crm/components/ProjectChecklist.tsx`: 7-step production checklist with progress bar and step toggles.
- `crm/app/content/page.tsx`: integrated `QuickCaptureBox` on Overview, and enhanced Active Projects table with checklist progress bar and summary.
- `crm/app/content/[id]/page.tsx`: integrated `ProjectChecklist` and raw captured notes with key talking points alongside the script editor.
- Script rewriting fix: updated `crm/lib/content.ts`, `crm/lib/scriptItem.ts`, `crm/lib/positioning.ts`, and created `crm/components/ScriptSyncInput.tsx` so "Rewrite script" passes user notes (from form inputs, rough textareas, and project notes) into the AI prompt and resolves file paths cleanly without throwing ENOENT. Also added direct "Rewrite / Polish" links in the Active Projects table.
- `CLAUDE.md`: updated to record decision 4 and the video organiser rules.

## Section 7: Raw footage. CODE DONE, awaiting the owner's test

Written:

- `db/migrations/20261121100000_raw_footage.sql`: database migration creating `footage_scans`, `footage_clips` (with duration, resolution, fps, frame path, AI label, and project lock), and `footage_renames` (audit log with `undone_at`).
- `crm/lib/footageSafety.ts`: pure safety and validation module calculating scan costs upfront (~$0.002/clip), verifying video extensions (.mp4, .mov, .mkv, .webm), refusing renames for clips locked to editing projects, sanitising proposed names against path traversal, and formatting durations.
- `crm/tests/footageSafety.test.mjs`: unit tests for cost calculation, extension detection, project locking, filename sanitisation, and duration formatting.
- `crm/lib/footageFfmpeg.ts`: integration with `/opt/homebrew/bin/ffmpeg` and `/opt/homebrew/bin/ffprobe` to extract video stream metadata and crisp preview frames into `.footage-cache`.
- `prompts/footage-label.md`: AI labelling prompt classifying clips as talking head, b-roll, or screen recording with structured filename recommendations.
- `crm/lib/footageAi.ts`: classification module using Claude Haiku with heuristic keyword fallback.
- `crm/lib/footageActions.ts`: server actions to scan local folders, extract frames, apply atomic file renames on disk, undo renames instantly, and assign clips to projects.
- `crm/app/api/footage/[id]/frame/route.ts`: API route streaming extracted preview frame images.
- `crm/components/FootageManager.tsx`: interactive footage manager with folder scanner, live cost estimate, clip preview table with AI labels and editable rename approvals, and recent rename undo log.
- `crm/app/content/page.tsx`: replaced the Section 7 placeholder on `tab === "footage"` with the live `FootageManager`.
- `db/migrations/20261124100000_fix_footage_clip_fk.sql`: fixes foreign key constraint on `footage_clips.used_in_project_id` to directly reference `content_items(id)` instead of `content_projects(id)`, resolving server error code 1560168903. Also made `assignClipToProjectAction` in `crm/lib/footageActions.ts` auto-ensure project row existence with fallback handling.

## Section 8: Thumbnail builder. CODE DONE, awaiting the owner's test

Written:

- `db/migrations/20261122100000_thumbnail_builder.sql`: database migration creating `content_thumbnails` (`id`, `content_item_id`, `clip_id`, `format`, `headline`, `subhead`, `frame_url`, `contrast_ratio`, `performance_score`, `platform_risk`, `risk_reasons`, `selected`, timestamps).
- `crm/lib/thumbnailMath.ts`: pure mathematical scoring evaluating WCAG 2.1 relative luminance and contrast ratios, platform guideline risks (TikTok/Reels UI safe zone occlusions and positioning claim violations), and 1-10 performance ratings based on brevity and visual punch.
- `crm/tests/thumbnailMath.test.mjs`: unit tests for WCAG contrast ratios, positioning claim flags, 9:16 safe zone boundaries, and performance scoring.
- `prompts/thumbnail-headlines.md`: AI headline prompt generating at least 3 distinct concepts (Curiosity/Question, Contrarian/Warning, Practical Blueprint) restricted to 2-4 punchy words with strict positioning rules (no unverified revenue claims).
- `crm/lib/thumbnailAi.ts`: Claude Haiku concept generator calculating contrast ratios and platform risks for each option, with robust candidate path resolution.
- `crm/lib/thumbnailActions.ts`: server actions to generate thumbnail variants, mark active covers, and delete options. Includes `$10::text[]` parameter type casting and auto-create table fallback.
- `crm/components/ThumbnailBuilder.tsx`: interactive thumbnail studio with format switching (16:9 vs 9:16), background frame picker from footage clips, safe-zone overlay toggles, WCAG contrast indicators, instant client-side canvas PNG download (1280x720 / 1080x1920), dynamic project synchronization, and active generation progress indicator.
- `crm/app/content/page.tsx`: replaced the Section 8 placeholder on `tab === "thumbnails"` with the live `ThumbnailBuilder`.

## Section 9: Follower tracking. CODE DONE, awaiting the owner's test

Written:

- `db/migrations/20261123100000_follower_tracking.sql`: database migration creating `follower_accounts` (`id`, `platform`, `handle`, `account_id`, `url`, `enabled`, `auto_poll`, `last_polled_at`, timestamps, seeded for YouTube, Instagram, TikTok and LinkedIn) and `follower_snapshots` (`id`, `account_id`, `platform`, `follower_count`, `delta_daily`, `source`, `notes`, `captured_at`).
- `crm/lib/followerMath.ts`: pure maths and guardrail module enforcing LinkedIn as manual-only (`canAutoPollPlatform`), throttling rapid polling to minimum 3-minute intervals (`isSnapshotRateLimited`), computing milestone tier progressions, and calculating daily/weekly/monthly growth deltas and pace.
- `crm/tests/followerMath.test.mjs`: unit tests for LinkedIn auto-poll refusal, rate limiting, metric count formatting, milestone math, and multi-window delta calculations.
- `crm/lib/followerTracking.ts`: server-side tracking engine with YouTube Data API v3 and gateway integrations, account-level polling with rate-limit tracking, and `loadFollowerDashboard` aggregating all 4 platform summaries.
- `crm/lib/followerActions.ts`: server actions to record manual snapshots (essential for LinkedIn and manual adjustments), trigger immediate account or batch polling, and edit channel handles/URLs.
- `crm/app/api/followers/poll/route.ts`: background API endpoint periodically triggered by the client while the dashboard remains open.
- `crm/components/FollowerTracker.tsx`: interactive audience dashboard with platform cards, current subscriber/follower counts, 7-day and 30-day growth badges, milestone progress bars, manual entry dialog, channel config drawer, and historical snapshot log.
- `crm/components/ContentTabs.tsx` & `crm/app/content/page.tsx`: integrated `Followers` tab into `ContentTabs` menu bar, hooked `FollowerTracker` to `/content?tab=followers`, and added a direct quick link from the Content overview.
- `CLAUDE.md`: updated to record Section 9 and the LinkedIn manual-only guardrails.

## Section 10: Liquid glass navigation. REVERTED / SKIPPED per owner instruction

Reverted per the owner's request: the section menu bar (`SectionTabs.tsx`) keeps its clean, instant pill tab navigation without fluid droplet or jelly animations.

## Section 11: Liquid glass YouVersion Bible widget. CODE DONE, awaiting the owner's test

Written:

- `crm/lib/bibleVerses.ts`: pure scripture data and helper module providing a curated library of high-impact daily Bible verses, deterministic calendar day calculation (`getDailyVerse`), and non-repeating random verse generation (`getRandomVerse`) with direct chapter links to YouVersion / Bible.com.
- `crm/tests/bibleVerses.test.mjs`: unit tests for day-of-year calculations, complete verse record validation, YouVersion link integrity, and random verse shuffling.
- `crm/components/BibleWidget.tsx`: interactive liquid glass widget styled with iOS 27 glassmorphism (`backdrop-filter: blur`, specular highlight top reflection, inner refraction glow, quotation styling, YouVersion external chapter link, and a fluid animated verse shuffle button).
- `crm/app/page.tsx`: updated the dashboard greeting to "Good morning Brad", added the subtitle "what should we work on today?", and embedded `BibleWidget` directly inside the hero head between the greeting block and the "Find a lead" page action group.
- `crm/app/globals.css`: liquid glass styling for `.bible-widget` using only brand tokens and responsive layout constraints (collapsing cleanly into the hero flow on mobile viewports).
- `BRAND_SHEET.md` & `CLAUDE.md`: updated to document the YouVersion Bible widget.

## Content Dashboard: Script Rewriting, Thumbnail Generator & Board Stage Views. CODE DONE

1. **Bug Fix — Thumbnail Generator & Footage FKs:**
   - Fixed `ThumbnailBuilder` comparison logic where database `bigint` IDs returned as strings broke selection matching.
   - Added explicit number casting for thumbnails in `crm/app/content/page.tsx`.
   - Migration `20261124100000_fix_footage_clip_fk.sql` drops the incorrect foreign key referencing `footage_clips(id)` so footage can be assigned directly to content projects.

2. **Bug Fix — Rewrite Script in Project Tab:**
   - Replaced fragile `path.resolve(process.cwd(), "..")` in `crm/lib/content.ts` and `positioning.ts` with `getRoot()` checking for `prompts/`, resolving `ENOENT` prompt lookup failures.
   - Enhanced `crm/lib/scriptItem.ts` and `content.ts` to pass user rough notes into the LLM rewrite prompt, with fallback JSON text parsing when tool calling output structure is nested.
   - Created `ScriptSyncInput` and `WriteScriptButton` with `router.refresh()` in `onDone` and dynamic React keys on `ToastForm` and the script `<textarea>` to guarantee live updates remount immediately upon server response.

3. **Content Board Redesign (Per Owner's Design Rules):**
   - Implemented `SectionTabs` inside `crm/components/ContentBoard.tsx` following the pipeline design rules (`All`, `Ideas`, `Script ready`, `Filmed`, `Posted`, and right: `Archived`) with live badge counters.
   - Designed individual screen layouts per stage: responsive card grid (`repeat(auto-fill, minmax(320px, 1fr))`), empty stage hints, and stage-specific action controls.
   - Kept the 4-column scrollable board with full drag-and-drop on the `All` view.
   - Integrated `NicheFilter` with stage-preserving search parameters and nested the collapsible idea generator on `All` and `Ideas` views.

## Linear Design & Interactive Dashboard Particles. CODE DONE

1. **Futuristic Linear Glass Design Across All Pages:**
   - Updated `crm/app/globals.css` with a spaced-out layout and a subtle 56px high-tech coordinate background grid.
   - All boxes (`.card`, `.stat`, `.tier`, `.lane`, `.deal`, `.tabs-bar`, `.table-wrap`, `input`, `select`, `textarea`, `.drawer`, `.dialog`, `.sidebar`) now use transparent frosted glass styling (`color-mix` with `backdrop-filter: blur(12px-20px)` and crisp 1px borders).
   - All buttons (`button`, `.btn`, `button.secondary`, `.btn.secondary`, `.deal-actions`) are styled with transparent glass, inner specular reflections, and glowing borders.

2. **Dashboard Particles (15% More, 0.1x Faster):**
   - Updated `crm/lib/particleField.ts` to increase particle density and bound counts between 12 and 51 (+15%).
   - Increased speed by 10% (0.1x faster vertical rise and horizontal sway).
   - Ensured particles remain exclusively on the dashboard screen (`crm/app/page.tsx`).
   - Unit tests updated and verified in `crm/tests/particleField.test.mjs`.

3. **Interactive Dashboard Accent 'Orange' Follower & Particle Avoidance:**
   - Added pointer tracking to the dashboard hero container in `crm/lib/particleField.ts` and `crm/app/globals.css`.
   - The dashboard hero's accent orange radial gradient dynamically tracks `--mouse-x` and `--mouse-y` as the mouse moves across the hero, creating an atmospheric spotlight that follows the cursor.
   - Within the particle canvas, a soft orange accent glow follows the mouse pointer, while individual particles smoothly steer around and avoid the cursor when it approaches.
   - Coral/orange accent particles pulse with an energetic halo when the cursor passes nearby. Scoped strictly to the dashboard screen.

4. **10% Opacity Translucent, Unembossed Minimal Design (No Liquid Glass):**
   - Replaced all liquid glass effects, glossy highlights, `.bible-glass-shine`, and specular reflections with pure transparent styling.
   - Removed all embossed 3D bevels (`inset 0 1px 1px...`, raised button shadows, and heavy dropshadows).
   - Added clean 10% background opacity across all buttons and boxes (`--box-bg`, `--btn-bg`, `--btn-sec-bg` via `color-mix`):
     - Buttons (`button`, `a.btn`): 10% accent opacity fill (`--btn-bg`), 1px accent border, no embossing.
     - Secondary buttons (`button.secondary`, `.seg button`, `.bible-btn`, `.pill`, `.search-btn`): 10% text opacity fill (`--btn-sec-bg`), 1px line border.
     - Boxes & Sections (`.card`, `.stat`, `.tier`, `.lane`, `.lane-body`, `.deal`, `.tabs-bar`, `.sidebar`, `input`, `textarea`, `.stepper`, `.offer-card`, `.wk-day`): 10% surface wash (`--box-bg`) with crisp 1px borders.



## Things that will trip you up

- **A hook blocks any command that reads `.env`.** Do not work around it. It means you cannot log in to a test copy with the password; check styling on the login page and on a static HTML sheet that links `crm/app/globals.css`, or ask the owner to look.
- **Never build in place.** The live CRM serves from `crm/.next` on port 3000. A test copy is `npx next dev -H 127.0.0.1 -p 3100` from `crm/` (it uses `.next-dev`). Going live is only `bash scripts/update-crm.sh`, run by the owner.
- **Schema changes only through a new migration** in `db/migrations/` (`npm run db:migrate`), and they must leave the previous code working.
- **Tokens only, no raw hex** below the token block in `globals.css`. Check new colour pairs for 4.5:1 in both themes.
- **Git:** the repo is public. Files under `site/` were already staged from earlier, unrelated work, and `node tools/git/sync.mjs` commits everything, so check `git diff --cached --name-status` and ask the owner before any sync or push.

## Files changed so far (all uncommitted)

`BRAND_SHEET.md`, `CLAUDE.md`, `crm/app/globals.css`, `crm/app/icon.svg`, `crm/app/page.tsx`, `crm/app/sourcer/page.tsx`, `crm/app/sourcer/sourcer.css`, `crm/app/companies/page.tsx`, `crm/app/companies/[id]/page.tsx`, `crm/app/deals/page.tsx`, `crm/app/deals/[id]/page.tsx`, `crm/app/proposals/page.tsx`, `crm/app/proposals/[id]/page.tsx`, `crm/app/tasks/page.tsx`, `crm/app/inbox/page.tsx`, `crm/app/calls/page.tsx`, `crm/app/quotes/page.tsx`, `crm/app/clients/page.tsx`, `crm/app/content/page.tsx`, `crm/app/content/calendar/page.tsx`, `crm/app/content/insights/page.tsx`, `crm/app/content/brief/page.tsx`, `crm/app/content/creators/page.tsx`, `crm/app/content/outliers/page.tsx`, `crm/app/content/trends/page.tsx`, `crm/app/flowcharts/flowcharts.css`, `crm/components/ActivityItem.tsx`, `crm/components/Board.tsx`, `crm/components/ProposalBoard.tsx`, `crm/components/FitPanel.tsx`, `crm/components/PlanPanel.tsx`, `crm/components/ImprovePanel.tsx`, `crm/components/LoomPitchPanel.tsx`, `crm/components/WeekCalendar.tsx`, `crm/components/nav-items.ts`, `crm/lib/categoryActions.ts`, `crm/lib/categoryTimeSeries.ts`, `crm/lib/contentCategories.ts`, `crm/lib/jump.ts`, `crm/lib/needsYou.ts`, `crm/tests/activityTarget.test.mjs`, `crm/tests/categoryGraph.test.mjs`, `db/migrations/20261119100000_content_categories.sql`, and new: `crm/lib/particleField.ts`, `crm/components/Particles.tsx`, `crm/components/SectionTabs.tsx`, `crm/components/ContentTabs.tsx`, `crm/components/CategoryGraph.tsx`, `crm/components/CategoryManager.tsx`, `crm/lib/categoryTypes.ts`, `crm/components/QuickCaptureBox.tsx`, `crm/components/ProjectChecklist.tsx`, `crm/lib/quickCaptureMath.ts`, `crm/lib/quickCaptureCategorise.ts`, `crm/lib/quickCaptureActions.ts`, `crm/tests/quickCapture.test.mjs`, `prompts/quick-capture-categorise.md`, `db/migrations/20261120100000_video_organiser.sql`, `crm/lib/footageSafety.ts`, `crm/lib/footageFfmpeg.ts`, `crm/lib/footageAi.ts`, `crm/lib/footageActions.ts`, `crm/components/FootageManager.tsx`, `crm/app/api/footage/[id]/frame/route.ts`, `crm/tests/footageSafety.test.mjs`, `prompts/footage-label.md`, `db/migrations/20261121100000_raw_footage.sql`, `crm/lib/thumbnailMath.ts`, `crm/lib/thumbnailAi.ts`, `crm/lib/thumbnailActions.ts`, `crm/components/ThumbnailBuilder.tsx`, `crm/tests/thumbnailMath.test.mjs`, `prompts/thumbnail-headlines.md`, `db/migrations/20261122100000_thumbnail_builder.sql`, `crm/lib/followerMath.ts`, `crm/lib/followerTracking.ts`, `crm/lib/followerActions.ts`, `crm/components/FollowerTracker.tsx`, `crm/app/api/followers/poll/route.ts`, `crm/tests/followerMath.test.mjs`, `db/migrations/20261123100000_follower_tracking.sql`, `crm/lib/bibleVerses.ts`, `crm/components/BibleWidget.tsx`, `crm/tests/bibleVerses.test.mjs`, `crm/tests/particleField.test.mjs`, `crm/components/ScriptSyncInput.tsx`, `crm/components/WriteScriptButton.tsx`, `crm/components/ScriptEditor.tsx`, `crm/components/ContentDrawer.tsx`, `crm/lib/scriptItem.ts`, `crm/lib/llm.ts`, `docs/HANDOVER_REDESIGN.md`.
