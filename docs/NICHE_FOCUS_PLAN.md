# Niche focus plan (council decision, 14 Nov 2026)

Work through this file one milestone at a time, like `BUILD_PLAN.md`. Each milestone has a prompt to paste into Claude Code and a done-checklist.

## The decision this plan builds

The three niches stay, but they run **one after another, not side by side**. Each niche gets a **status** that decides what the CRM lets you do with it:

| Niche key | Who | Status | Channels allowed | Content platforms | Offer (one per niche) |
|---|---|---|---|---|---|
| `dental` | Dental practices (Ltd) | **active** | Cold email, LinkedIn | LinkedIn | Missed calls and enquiries answered and booked into your diary |
| `aesthetics` | Aesthetic / medspa **clinics** (Ltd, usually CQC-registered or medically led) | **active** | Cold email, LinkedIn, Instagram DM | LinkedIn, Instagram | Same offer as dental, worded for consultations |
| `beauty` | Lash, brow, hair, nail studios and solo aesthetics practitioners (mostly sole traders) | **audience** | None (content and the Whop kit only) | Instagram, TikTok | The 30-day content kit (product, not service) |
| `property_developers` | Developers and investors (Ltd) | **seeding** | LinkedIn only, capped | LinkedIn (1 post a week) | Buyer and investor enquiries qualified and followed up, with flyover visuals as the door-opener |
| `peptide_clinics` | Peptide / weight-loss clinics | **parked** | None | None | Not now: prescription-only medicine advertising rules |
| `hvac`, `roofing`, `pest_control`, `trades`, others | Previous niches | **parked** | None | None | Kept for history, hidden from defaults |

**Aesthetics overlap rule:** a business with a clinic (Ltd, medical lead or CQC registration) is `aesthetics`. A solo practitioner or a studio that is mainly lashes, brows or hair is `beauty`.

**Statuses**

- `active`: full lead sourcing, outreach drafts, sends, DMs and content. **At most 2 active niches.**
- `seeding`: LinkedIn content plus a small number of LinkedIn connection notes. No Lead Sourcer runs, no cold email.
- `audience`: content only. No outreach drafts of any kind.
- `parked`: hidden from pickers and defaults. Data kept and still visible on existing companies.

**Rules**

- **Unlock rule:** a niche can only become `active` if an existing active niche has **2 paying clients** (deals Won with a monthly value). If not, you can override it with your password and a written reason, the same pattern as the verification bypass.
- **Stop rule:** when an active niche reaches **150 touches** (emails, DMs and LinkedIn notes logged) with **no calls booked**, the CRM says *change the offer, not the niche* until you edit that niche's offer.
- The existing `lead_gate` (verified active Ltd/LLP/PLC, not suppressed, not opted out) is unchanged and still decides who can be contacted. Niche status is an extra gate on top, never a replacement.

---

## Milestone N1: Niche status, platforms and channels in config

**Prompt to paste:**

> Read `docs/NICHE_FOCUS_PLAN.md` and `CLAUDE.md`. In `config/niches.yaml`, give every niche these new fields: `status` (active | seeding | audience | parked), `label`, `tier` (low | mid | high), `channels` (from: email, linkedin, instagram_dm), `platforms` (from: linkedin, instagram, tiktok), `promise` (one plain-English sentence a stranger would repeat, no figures), and `pain_points` (a short list). Use the table in the plan for the values. Add the niches `beauty` (SIC 96020, 96040; search terms lash studio, brow bar, hair salon, beauty salon, nail salon), `property_developers` (SIC 41100, 68100; search terms property developer, residential developer, house builder) and `peptide_clinics` (SIC 86900; parked). Set every other existing niche to `parked`. Remove `defaults.focus_niches` and derive the focus list from `status: active` everywhere it is read (`crm/lib/leadConfig.ts`, `crm/lib/content.ts`, `crm/lib/contentConfigMath.ts`, and the Python lead tools if they read it). Add `tiktok` to `content.platforms` and update `content_niche` / `content_audience` to the new niches. Write a new migration that adds the same fields to `custom_niches` (status defaulting to `parked`, channels and platforms as text arrays with CHECK constraints on allowed values), so a niche added in the CRM later has exactly the same shape. Put the rules for reading a niche's status in one pure module, `crm/lib/nicheStatus.ts` (`nicheStatus(key)`, `canSource(key)`, `canOutreach(key, channel)`, `platformsFor(key)`), with unit tests. Do not change `lead_gate`.

**Done when:**
- [x] Every niche in `niches.yaml` has a status, channels, platforms, promise and pain points.
- [x] `focus_niches` is gone and nothing still reads it (check with a search).
- [x] The migration runs, and down-migrates without loss.
- [x] `nicheStatus.ts` tests cover all four statuses and an unknown key (treated as parked).
- [x] `npm test` and `uv run pytest` pass.

## Milestone N2: Enforce status in sourcing and outreach

**Prompt to paste:**

> Using `crm/lib/nicheStatus.ts`, enforce niche status in one place per feature. Lead Sourcer (`crm/lib/sourcerActions.ts`, `apifyActions.ts`, `leadSearchActions.ts`): the niche picker shows active niches first, seeding and audience niches greyed out with the reason, parked niches only under a "Show parked" toggle; a search on a non-active niche is refused on the server. Outreach drafts and sends (`outreachActions.ts`, `outreachOfferActions.ts`, `sendActions.ts`): refused unless `canOutreach(niche, 'email')`. Instagram DM drafts (`dmActions.ts`): refused unless `canOutreach(niche, 'instagram_dm')`. Add a LinkedIn connection-note draft for `seeding` and `active` niches that allow linkedin (drafting only; under 300 characters; real name and opt-out wording added by code; daily cap `LINKEDIN_NOTE_DAILY_CAP`, default 10; the app never sends). The refusal message should say which status blocked it and link to the Niches screen. Add a database-level backstop: extend the send-guard trigger to refuse logging a send for a company whose niche is not active (a seeding niche may log LinkedIn notes only). Companies already saved under a now-parked niche keep their history and can still be read, but cannot get new drafts until moved to an active niche.

**Done when:**
- [x] A search, draft, send or DM for a parked, audience or seeding niche is refused on the server, not only hidden in the UI.
- [x] The trigger refuses a direct insert that skips the app.
- [x] LinkedIn note drafts work for `property_developers` and refuse `beauty`.
- [x] Tested in `DEMO_MODE` with fake data.

## Milestone N3: Niches screen with the unlock rule

**Prompt to paste:**

> Build a Niches screen (extend the existing Add or manage niches UI, keeping the brand sheet and the phone rules). One card per niche: status pill, tier, promise, channels, platforms, offer, and live counts (companies, touches, calls booked, clients won). The owner can change status here. Changing a niche to `active` is refused while 2 niches are already active, and refused unless an existing active niche has at least 2 deals Won with a monthly value. The owner can override with their login password (same check and lockout as `gateBypass.ts`) and a written reason of 15 to 300 characters, logged as `niche_unlock_override`. Moving to `parked`, `audience` or `seeding` needs no password, because it only tightens. Changing a niche's offer or promise is logged as `niche_offer_changed`. YAML niches are edited by writing back to `config/niches.yaml` with a `.bak` copy, or by saving an override row in the database, whichever matches how the CRM already treats config; say which you chose and why in `CLAUDE.md`.

**Done when:**
- [x] A third active niche is refused, and so is a second one before 2 clients are won, unless overridden.
- [x] An override needs the password and a reason, and shows on the card.
- [x] Every status and offer change is in Activity.

## Milestone N4: Targets per niche and the stop rule

**Prompt to paste:**

> Extend `config/targets.yaml` with a `by_niche` block (weekly: emails, instagram_dms, linkedin_notes, posts per platform), and show it on the Dashboard as one row per active or seeding niche: target against actual this week, using the existing pace maths (`paceMath.ts`). Use these starting numbers: dental 30 emails and 5 LinkedIn notes; aesthetics 20 emails, 15 Instagram DMs and 5 LinkedIn notes; property_developers 10 LinkedIn notes and 1 LinkedIn post; posts per week: LinkedIn 3 (2 clinic, 1 property), Instagram 2 (beauty or aesthetics), TikTok 2 (same videos as Instagram). Add a stop-rule card to `crm/lib/needsYou.ts`: for each active niche, count touches since its offer last changed (emails sent, DMs logged, LinkedIn notes logged) and calls booked from that niche; at 150 touches and 0 calls, show "150 touches, no calls: change the offer, not the niche", linking to the niche card. It clears when the offer is changed (which resets the count) or a call is booked. Add a content mix check: the Content overview shows this week's planned posts per platform against `platformsFor(niche)`, and flags a LinkedIn post planned for an audience-only niche (beauty) or an Instagram or TikTok post for property.

**Done when:**
- [x] The Dashboard shows a per-niche row with weekly targets.
- [x] The stop-rule card appears at 150 touches with 0 calls on demo data and clears on an offer change.
- [x] Planning a beauty post for LinkedIn shows a warning.

## Milestone N5: Copy, offers and proof for the new niches

**Prompt to paste:**

> Write or rewrite the per-niche outreach templates in `prompts/outreach/`: `dental.md` and `aesthetics.md` around the one offer (missed calls and enquiries answered and booked into the diary; the agent handles booking logistics only and never discusses treatments or medicines), `property_developers.md` as a LinkedIn connection note and short follow-up only (no first email), and `beauty.md` saying that no outreach is drafted for this niche. Follow the existing template rules (subject 30 characters or fewer, body under 100 words, real name, business name, opt-out line, no figures, positioning from `prompts/positioning.md`). Because this offer handles patients' personal data, every clinic template must pitch it as a conversation and say a data processing agreement comes first, as `CLAUDE.md` requires. Add an offer "Missed-call and enquiry recovery" to `config/offers.yaml` as the entry-level tier for clinics (fixed setup plus monthly; leave the prices for the owner to fill in, marked CHANGE ME). Do not add the Kai Media dental job as a proof item until the owner records that they have permission to cite it.

**Done when:**
- [x] All four templates pass `outreachTemplateMath.ts` and the template test.
- [x] The new offer seeds with placeholder prices and shows under Offers.

## Before the first clinic goes live (not code: owner's checklist)

- [ ] Check your NHS contract for secondary-employment and conflict-of-interest rules, and declare if required.
- [ ] Register with the ICO (data protection fee) if you haven't, since Agency OS stores lead data.
- [ ] A data processing agreement template for clinic clients, plus a list of sub-processors (Retell, the model provider, telephony) and where each processes data.
- [ ] Professional indemnity and cyber insurance quotes.
- [ ] A support plan for hours when you are at work: what the agent does when the diary integration fails, and who the clinic calls.
- [ ] Ask Kai Media whether you can describe the dental diary build as a case study (unnamed).
- [ ] Prices and a 90-day target, e.g. 2 clinic retainers by 1 March 2027.

---

## The 90-day operating rhythm (starts Mon 1 Dec 2026, after the kit launch)

About 10 hours a week. If a week goes badly, cut property first, then content, and keep the clinic emails.

| When | Time | What |
|---|---|---|
| Sunday | 2.5 h | Film 3 videos: 1 clinic (LinkedIn and Instagram), 2 beauty or aesthetics (Instagram and TikTok). Write 3 LinkedIn posts (2 clinic, 1 property). |
| Mon, Wed, Fri | 30 min each | Post the day's LinkedIn post. Send 5 LinkedIn notes (property on Mon, clinics Wed and Fri). |
| Tue, Thu | 1.5 h each | Source and verify 15 clinics, then send 25 cold emails to limited-company clinics only. |
| Daily | 15 min | 3 Instagram DMs to aesthetics clinic pages only (never sole traders). Reply to anything in the Inbox. |
| Saturday | 1 h | Follow-ups due, look at the per-niche numbers on the Dashboard, one Upwork proposal for clinic or voice-agent work. |

**Review on 2 Mar 2027:** if clinics have produced 2 retainers, the unlock rule lets property become active. If they haven't, the stop rule will already have pushed an offer change. Don't add a niche.
