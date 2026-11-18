# Lead Sourcer rework: plan (council verdict accepted 17 Nov 2026)

> **Status, 17 Nov 2026: steps 1 to 5 done, plus the CQC source.** The dry run puts 50 sendable dental leads a week at about 10 to 15 minutes of the owner's attention, under the stop test's 30 minutes, so the verdict is **stop building the sourcer and send**. It only reopens if a real, timed week in the live CRM goes over 30 minutes. The deferred items at the end stay deferred until the reply data asks for them.

The first draft went to the council (five advisors, anonymous peer review, then a chairman). The owner accepted the verdict on 17 Nov 2026, and this is the plan rewritten to match it. The first draft's sub-niches, sticky search bar, filter chips and fifth score part are **deferred, not dropped**; see the end.

## The goal, and the test that ends the build

The Lead Sourcer exists to get about 50 **sendable** clinic leads a week (on niche, verified ltd/llp/plc, with a website and an address someone reads) for as few of the owner's minutes as possible, so their time goes to filming, scripting and selling.

- **Build cap: 3 days.**
- **Stop test**: if 50 sendable leads take **under 30 minutes a week**, stop building the sourcer and spend the time sending. If 50 emails haven't gone out by Sunday, the problem is sending, not sourcing.

## Why the first draft changed

- **Companies House is a legal register, not a list of clinics.** The off-niche results and Enrich's failures both come from searching it for something it doesn't hold. Industry codes are broad (`96020` covers barbers and nail bars), and clinics trade under names other than their registered ones. So search **by what a business trades as**, and use Companies House **only as the gate** (`lead_gate`, active ltd/llp/plc, suppression), which it already is.
- **Matching back to Companies House is easier than it looks.** A UK limited company must show its registered number on its website, and `verifyPage` (`crm/lib/sitecheck.ts`) already checks a page for it. A Maps result brings the website and postcode, so the match comes from the site, not from guessing a name.
- **Sub-niches can't change the copy.** Botox is a prescription-only medicine, and the clinic templates must never mention treatments or medicines (N5). A sub-niche could only narrow the search, and a keywords box does that.
- **The bottleneck may be replies, not leads.** Hence the cap and the stop test.

## The build, in order

### 1. This week, newest first (built 17 Nov 2026)
`/sourcer?tab=week` defaults to **Newest added**: one group per build of the list, newest at the top and open, with its time ("Added Tuesday 14:05 · 12 companies") and older builds folded. **Best fit** (`&sort=fit`) shows the old single list. Each build is one INSERT, so its rows share one `created_at` exactly and two builds in the same minute stay apart; no migration was needed (`groupRuns`, `parseSort` in `crm/lib/weeklyListMath.ts`).

### 2. Off-niche results flagged, not hidden (built 17 Nov 2026)
- Three keyword lists per niche in `config/niches.yaml`: `name_includes`, `name_excludes`, and `name_excludes_always` (flags even with an include word, because a dental laboratory still says "dental"). Each word matches the start of a word ("physio" catches "Physiotherapy", "hair" never catches "Chair"), and a phrase matches word by word ("care home"). "Clinic" is deliberately not an include word.
- The rule (`offNicheReason`, `crm/lib/nicheRelevance.ts`) runs on the name and any Google categories when results are shown (`sourcerResultsAction`), so editing the lists re-flags old searches too. A flagged row goes to the bottom, greyed, says why, and is not ticked, but can still be ticked and added. A line above the results says how many were flagged.
- The Python copy (`off_niche_reason`, `src/agency/core/niches.py`) is used when the Companies House tool runs by hand: a dry run marks flagged companies, and a direct save leaves them out unless `--keep-off-niche` is passed. Both copies pass the same cases in `tests/fixtures/niche_relevance_cases.json`.
- The Search button sits above "Narrow it down" (it used to fall below every filter on a narrow screen).
- **Checked on past results (17 Nov 2026)**: of 78 aesthetics results, 32 are flagged (barbers, hairdressers, opticians, nail bars, care and physio businesses). Of 66 dental results, 9 are flagged (labs, locum firms, consultancies, a hygienist). Names that say nothing ("Synergy P Limited") are never flagged.

### 3. Clinics search Maps-first, and one chain fills the gaps (built 17 Nov 2026)

**What was built**
- `search_first: maps` on dental and aesthetics in `niches.yaml`: choosing the niche ticks Google Maps and unticks Companies House (both can still be changed; Maps runs only on the Search click, with its cost shown). A **Keywords for Google Maps** box sits under the niche, suggesting the niche's `search_terms` plus `maps_keywords` (a separate list, so content's audience wording never picks them up). Apify's paid contact add-on now starts unticked.
- Matching a Maps result to Companies House (`processBatch` in `crm/lib/apifyActions.ts`) runs in this order: the exact name as before; then the name with Google's advertising text cut off (`cleanMapsTitle`: "Skin Clinix | Chorlton Skin & Aesthetic Clinic" becomes "Skin Clinix"); then the company number the business's own website shows (`readSiteForMatch`, `companyNumbersIn`), used only if `sameBusiness` holds (a shared distinctive word, the same postcode area, or the niche's industry code), because a footer can show a web designer's number.
- The same free site read fills in generic emails, company social pages and a contact page (saved in `apify_results.site_read`, migration `20261206100000`). A matched company keeps its Maps name as `trading_name`, and `lead_added` / `contact_details_found` record which step found each detail (`mapsFoundBy`).
- **Enrich > Fill in the gaps** (`crm/components/FillGaps.tsx`, `crm/lib/fillGapsActions.ts`, rules in `fillGapsMath.ts`): one click for every company shown. It guesses the website from the trading and registered names (kept only if the page shows the number or name), then reads the site; with **use paid lookups** ticked it also tries a web search and Google Places for companies with no website, inside the daily caps. Only empty fields are filled. Companies not tried yet come first; those still missing show what was tried, with the search links as the fail-safe. Enrich now shows **active niches only** unless "Include parked and other niches" is on.

**What the real data showed (17 Nov 2026), and why the plan's first idea was weaker than expected**
- **Most clinic websites don't show a company number**, legal duty or not: on 11 real dental and aesthetics sites in the CRM, 1 showed one, and that was a sister company's. The website-number match is right when it fires but will rarely fire. The bigger free gain came from cleaning Maps names: **3 of 15** previously unmatched aesthetics results matched.
- **Many unmatched aesthetics results are individuals** ("Dr Daud Qazi", "Profile by Nurse Jo"), probably sole traders, so they rightly stay blocked. This supports the Contrarian's warning that the pool of limited-company clinics is small: **count the pool before the next build**.
- The free chain on the Enrich list's top 12 gave a way to reach **5 of 12** with no credits. But 11 of those 12 were from parked niches (marketing agencies, heating), which is why Enrich now shows active niches only.
- Whatever the plan said next, the original bullets are kept below for reference.

**Original plan for this step**
- For **dental and aesthetics**, the default source is Google Maps (Apify, existing caps and budgets, click-only, cost shown first). **Property developers stay Companies House-first**, because their registered name is usually their trading name. Set per niche (`search_first: maps | ch` in `niches.yaml`).
- A free-text **Maps keywords** box beside the niche ("botox clinic", "lip filler"), with the niche's `search_terms` as suggestions. This replaces sub-niches for now.
- **The chain**, for each result: Maps gives the trading name, website and postcode. The clinic's own website (free, robots.txt respected) is read for the company number, so the Companies House match comes from the site, plus generic emails and company social pages. Then the search API by trading name and postcode, then Google Places, each capped and stopping at the first confident answer.
- `pickFromResults` (`crm/lib/websearch.ts`) matches on the trading name as well as the registered name, and accepts a postcode match.
- **Record which step found each detail** (`activities` meta: website, search, Places or manual). The hit-rate display can come later; the data cannot be recovered afterwards.
- The Enrich tab keeps only companies where every step failed, with the manual search links as the fail-safe.

### 4. CQC check for dental (done 17 Nov 2026)

**Answer: yes, and without the API.** CQC publishes the **CQC care directory**, a free CSV of every regulated location in England, usually weekly, under the Open Government Licence v3. That licence asks you to acknowledge that you use CQC information, so the screen should say so. The file is listed on https://cqc.org.uk/about-us/transparency/using-cqc-data, and the 4 Nov 2026 file is `04_November_2026_CQC_directory.csv` (18 MB). It needs no key.
- **Columns**: Name (the trading name), Also known as, Address, Postcode, Phone number, Service's website, Service types (e.g. "Dentist"), Date of latest check, Specialisms, **Provider name (the legal entity)**, Local authority, Region, Location URL, CQC location ID, CQC provider ID. There are no registered managers or other named people in this file. The monthly "with filters" file has registered managers: never use it.
- **What it gives (4 Nov 2026 file)**:
  - 12,326 dental locations, 6,945 of them run by a ltd/llp/plc provider.
  - In **5,248 of those the trading name differs from the provider's registered name**, which is the exact problem behind the failed matches ("Langdale Dental" is "Cooper Dental Limited").
  - 4,482 independent limited dental providers (one or two locations; the big chains have up to 196).
  - Independent limited dental locations: **409 in Yorkshire & Humberside, 604 in the North West**. At 50 a week, Yorkshire alone is about 8 weeks of list. That answers the council's "count the pool" for dental.
  - Only about 37% of dental rows carry a website, so Fill in the gaps would supply the rest.
- **Aesthetics**: 557 registered locations have an aesthetics-type name (aesthetic, cosmetic, skin, laser, derma), 490 of them run by a limited company. That is a small but exact list of the medically led clinics the niche is meant for. Most aesthetics clinics are not registered, so Maps stays the main aesthetics source.
- **The API**: `https://api.service.cqc.org.uk/public/v1/...` needs a subscription key (`Ocp-Apim-Subscription-Key`) from https://api-portal.service.cqc.org.uk. Without one it answers 401 "invalid subscription key"; the old `api.cqc.org.uk` host answers 403. Whether a provider record carries a Companies House number is still unconfirmed, and it doesn't matter: the provider name plus postcode matches Companies House by exact name, which the Lead Sourcer already does well. The API isn't needed unless daily freshness matters.
- **Rules it must keep if built**: company-level only (the provider name, trading name, address, business phone and website; never the managers file). Providers that are not ltd/llp/plc (a dentist's own name, "… Partnership") stay out or blocked, as now. lead_gate, the niche gate and suppression apply as for any source.

**Built 17 Nov 2026 (owner's go-ahead, over the 3-day cap)**: the Lead Sourcer has a third source, **CQC register** (Free badge).
- **Files**: `crm/lib/cqc.ts` (download, search, matching, adding), pure rules in `crm/lib/cqcMath.ts`, migration `20261207100000_cqc_source.sql` (tables `cqc_imports`, `cqc_locations`, `cqc_searches`, `cqc_results`, and `sourcer_runs.cqc_search_id`).
- **Settings in `niches.yaml`**: a niche's `cqc:` block (`service_types`, `name_must_match`, `max_provider_locations`). Dental is `Dentist`, independents only (2 locations at most). Aesthetics is `Doctors/GPs` and `Clinic` with a `name_includes` word required, so GP surgeries never come in. `search_first` is now a list: dental `[cqc]`, aesthetics `[maps, cqc]`.
- **Download**: the first search of the week downloads the directory, finding its link on CQC's data page (robots.txt checked; `CQC_DIRECTORY_URL` overrides). Only ltd/llp/plc providers of the service types any niche needs are kept. The previous download is replaced.
- **Matching**: each result is matched to Companies House by the provider's name and postcode, a few per poll. A matched company keeps the CQC location name as `trading_name`. Two practices of one company make one row. CQC's phone numbers get their leading 0 back.
- **Attribution and filters**: the screen carries the Open Government Licence attribution. The Companies list's Source filter has CQC register.
- **Checked on real data**: 19 of 20 Leeds independents matched an active company, against about 1 in 5 from Google Maps names. The 4 Nov file parses in about 1.3 s and keeps 10,760 locations. A Leeds search gives 80 dental practices (35 chain locations left out, 28 with a website) and 7 medically led aesthetics clinics.

**Recommendation as written before the build**: add **CQC register** as a third source in the Lead Sourcer, with a Free badge, for dental, and for aesthetics as a top-up to Maps. The CSV is downloaded on click, at most once a week, and kept as a staged search like Companies House. Each row is matched to Companies House by the provider name and postcode, and each company keeps the CQC trading name as `trading_name`. About a day. It should come before step 5's measurement, because it changes the answer to "minutes per sendable lead" for dental.

**Original plan for this step**
Check whether the Care Quality Commission's API links a dental location (its trading name and address) to its provider's Companies House number, whether it needs a key, and its rate limits. **This came from the advisors' memory and is unverified.** It covers England only, and most aesthetics clinics are not CQC-registered. If it holds, it becomes a free dental source in the Lead Sourcer with its own cost badge; named registered managers are never stored (company-level only).

### 5. Measure, then send (machine half measured 17 Nov 2026)

**Dry run, free and read-only, on the dental chain for Leeds**: CQC register, then the Companies House match, then the checks against the CRM and suppression list, then a free website guess where CQC lists none, then the free site read. Taken from the 4 Nov file, first 50 independent limited practices:

| Stage | Count |
|---|---|
| CQC practices in | 50 |
| Already in the CRM | 6 |
| Matched to Companies House | 46 (92%) |
| New, verified, active limited companies | **41** |
| With a website (13 from CQC, 16 found by the guess) | 29 |
| Reachable: email, social page or contact page | 26 |
| With a generic email to send to now | **12** |

- **Machine time**: about 7 minutes in a row, nearly all of it reading websites. In the CRM the same work is the search, about 40 seconds of matching while you watch, then Fill in the gaps, about 5 minutes that run on their own.
- **Your attention**: about 5 clicks per batch of 50: Search, Add, Fill in the gaps, then This week's Build and Find people.
- **What 50 sendable leads a week takes**: the 29 with a website qualify for This week's list, where Apollo's free search finds a senior person and a reveal (credits) gets the work email. So two CQC searches cover a week (Leeds plus a neighbouring council area such as Bradford, Wakefield or Kirklees). Counting only generic emails (12 per 50), it would take four or five areas.
- **Estimated against the stop test**: two batches at about 5 clicks each plus This week is roughly **10 to 15 minutes of your attention a week**, under the 30-minute line. **Verdict: stop building the sourcer and send.**
- **Still to confirm by you**: time one real week in the CRM once it is live (from the first Search click to 50 on This week's list). Run one aesthetics search (Maps plus CQC, about $0.50 cap) to see aesthetics' yield, which this dry run couldn't measure without spending credits. If the real week takes over 30 minutes, the slow step is the next thing to fix, and the activity log's `found_by` shows which step it is.
- **Pool**: Leeds has 80 independent limited dental practices, Yorkshire & Humberside 409 and the North West 604. At two areas a week, Yorkshire lasts about two months before the North West.

**Original plan for this step**
Run one Maps search per clinic niche in one area and one Companies House-only search the same day. Compare **minutes per sendable lead** and the real Maps cost. Then apply the stop test.

## Deferred until the reply data asks for them

- **Sub-niches** (a `sub_niche` on each company, the yaml tree): only once replies show that one sub-niche answers differently. They stay search-only, never treatment copy.
- **Sticky search bar, filter chips, three-step tabs, keyboard shortcuts, phone bottom sheet** (the first draft's D): only if scrolling still gets in the way after step 3. Once one click returns 50 good rows, the screen should shrink anyway.
- **Fifth score part (On niche) and a Need score** (no online booking, "call us" only, read from the same free page load): the Need score is the idea most likely to lift replies rather than volume, so it is the first thing to revisit after the stop test.
- **Following each lead's source through to replies and calls booked**, so the 150-touch stop rule can tell a bad list from a bad offer.

## What does not change

`lead_gate`, `nicheGate.ts` and suppression still decide who may be contacted. Scraped data stays company-level (no named people, no personal emails, no review text). Paid steps stay click-only with their cost shown first, and robots.txt and every cap are respected.
