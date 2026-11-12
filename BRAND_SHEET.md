# Agency OS brand sheet

Approved by the owner on 3 Nov 2026; the palette was changed by the owner to Navy, Cream and Coral on 11 Nov 2026. Every new screen, component and feature follows this. The values live in one place, the token block at the top of `crm/app/globals.css`. Components use tokens, never raw hex. The visual reference is the CRM itself: `docs/brand-sheet-preview.html` still shows the earlier orange palette, so use it for layout and motion only.

**One line:** calm cream, one coral to follow. Cream and white do the resting, Coral marks the one thing that needs you, teal means done or on track.

## 1. Colour

The owner’s colours are **Navy `#14213D`, Cream `#F4EDE0` and Coral `#FF6B5B`**, used exactly. **Lagoon** (deep teal) is kept beside them for "done", "on track" and "money kept", because Coral cannot mean both "needs you" and "finished".

| Role | Token | Light | Dark | Use |
|---|---|---|---|---|
| Page | `--bg` | `#F4EDE0` Cream | `#14213D` Navy | The page behind the cards |
| Card | `--surface` | `#FFFFFF` White | `#1C2B4C` | Every card, drawer, dialog |
| Tile | `--surface-2` | `#EAE3D6` Deep cream | `#27375B` | Tiles inside cards, inputs, board columns, secondary buttons |
| Lines | `--line`, `--line-soft` | `#DCD3C3`, `#E7DFD0` | `#34456B`, `#283858` | Hairlines only where a shadow is not enough |
| Text | `--text`, `--text-2`, `--muted` | `#14213D` Navy, `#3B4660`, `#566076` | `#F4EDE0` Cream, `#D3D0CC`, `#A3ACC0` | Main text, body, secondary |
| **Coral** (the accent) | `--accent`, `--accent-strong` | `#FF6B5B` | `#FF6B5B` | The one main button, active bars, count badges |
| Coral text | `--accent-text` | `#B23526` | `#FF8E80` | Coral used as text or a link (5.3:1 on Cream) |
| Coral tint | `--accent-soft` | `#FFE8E4` | 16% Coral | "Needs you" backgrounds, hover on the active thing |
| Focus ring | `--ring` | `#E04A39` | `#FF6B5B` | Keyboard focus outline and the focused field border |
| **Lagoon** | `--good` | `#0F5C5E` | `#5CC5BF` | Done, on track, won, paid, success |
| Lagoon tint | `--good-soft` | `#DCEEEC` | 14% Lagoon | Success and finished backgrounds |
| Danger | `--bad`, `--bad-soft` | `#A3123F`, `#FBE4EA` | `#FF85A8` | Errors and overdue only. Never decoration |

Supporting tokens keep their names so every screen carries on working: `--warn` is Coral text ("needs attention"), `--violet`, `--cyan`, `--blue` and `--orange` are quiet slate, teal and Coral shades for status badges. There are no other accent colours.

**Proportions:** about 60% Cream, 20% white, 12% Coral, 8% Lagoon (in dark mode, Navy takes the place of Cream). If a screen looks coral all over, it is wrong.

**Contrast rules**
- Text on Coral is **Navy** (`--on-accent`, 5.7:1). Never white on Coral (only 2.8:1).
- Coral as small text or a link uses `--accent-text`, never `--accent` (plain Coral is 2.4:1 on Cream).
- A keyboard focus ring uses `--ring`, never `--accent` (plain Coral is under 3:1 against Cream).
- Coral sits close to red, so danger is a crimson and never relies on colour alone: an error line carries a "!" mark on its own tint, and an overdue badge is the only badge with an outline.
- Text on a stage pill is always Navy (`--on-stage`), so stage colours are light enough for it.
- Anything new gets checked: body text 4.5:1 or better, in both themes.

**Deal stages** run a calm ramp from cream to teal as the deal progresses, Coral for the stages that need the owner, full teal for Won (`--st-*` tokens, used by `lib/stages.ts`).

## 2. Type

Two fonts, both already loaded by the app (no new downloads).

- **Display: Bricolage Grotesque** 600/700, tight tracking (-0.02 to -0.03em): page titles, section titles and every big number (use tabular figures).
- **Body: Instrument Sans** 400/500/600: lists, forms, tables, buttons.
- Section labels are small capitals: 11.5-12px, 600, +0.06 to +0.12em, muted.
- Sizes: label 12, small 13, body 15, section 20-30, page and numbers 30-62.

## 3. Shape and surfaces

- Radii: card 20px (`--radius`), tile 14px (`--radius-md`), input and small 10px (`--radius-sm`), buttons and chips are pills (`999px`).
- Cards are glass (`--box-bg`). In light mode that is frosted White (70%) on Cream with a hairline border and a soft shadow (`--shadow-1`). In dark mode, and inside the Navy dashboard hero, it is a 30% Cream tint with a hairline border and no shadow. A box inside a box (a field in a card, a deal in a column, a calendar day) uses the well tint `--box-in`, so tints never stack and wash out the text. Dark-mode text colours are deliberately pale: anything dimmer falls under 4.5:1 on a 30% box, so check contrast before darkening them.
- Tiles (Deep cream) sit inside cards for grouped numbers and fields.
- Generous space: 16-22px inside cards, 14-16px between them.

## 4. Buttons, fields, badges

- **One Coral button per screen** (the main action): Coral fill, Navy text, soft Coral shadow.
- Secondary: white or Deep cream fill with a faint line. Quiet actions: text only (`button.link`). Destructive: tint of danger, solid only on confirm.
- Hover lifts the main button 1px, press shrinks to 97%, keyboard focus draws a thick Coral ring (`--ring`).
- Success is a button morph, not a pop-up: the button turns Lagoon with a tick for about 1.5 seconds. (Toasts stay for background confirmations.)
- Inputs are Deep cream with a transparent border; focus turns the border Coral with a soft Coral halo.
- Badges are tinted pills: Coral = needs you, Lagoon = on track or done, Deep cream = waiting, Danger = overdue (with an outline).
- Segmented switches (Today / Week / Month, filters) use the pill switch (`.seg`).

## 5. Motion

Motion explains a change. Apart from the dashboard hero, it never decorates and never loops. Everything else is 150-450ms with one curve, `cubic-bezier(.2,.8,.2,1)` (`--ease-out`), and switches off for anyone who has "reduce motion" set.

1. **Settle-in (420ms):** a page's top-level blocks rise 8px and fade in, 60ms apart.
2. **Count-up and fill (900ms):** big numbers count up, bars and rings fill when a screen opens. A thin tick on a bar is the pace marker: where you should be by now.
3. **Type-out:** an AI draft writes itself at reading speed, only after the owner has clicked Generate.
4. **Press to success (300ms):** shrink, then morph to Lagoon with a tick.
5. **Lift and drop:** a dragged card lifts (scale 1.03, 2 degrees tilt, bigger shadow) and springs into place.
6. **Panel open (220ms):** drawers slide in from the right; collapsible sections (Recent activity) expand in place.
7. **Dashboard hero drift (`crm/lib/particleField.ts`, `crm/components/Particles.tsx`):** the one place where decorative looping motion and a soft Coral-and-Navy gradient are allowed, strictly on the dashboard hero. A drift of Cream and Coral dots (12 to 51, 15% more particles moving 0.1x faster, about 30 frames a second) rises behind the hero's glass pace cards. The accent orange glow interactively follows the mouse pointer, while individual particles organically avoid the cursor as it moves across the hero. Pauses whenever the tab is hidden or the hero scrolls off screen, and draws a single still frame when "reduce motion" is set.

A sidebar count pops in once (240ms) when it appears or changes. It never pulses or loops.

## 6. Layout and navigation

- Sidebar grouped under small capital labels, named by what the owner is doing: **Home** (Dashboard, Inbox, Tasks), **Find and win** (Lead Sourcer, Companies, Deals, Proposals), **Sell** (Calls, Quotes, Audits, Objections), **Deliver** (Clients, Outcomes, Enablement, Flowcharts), **Grow** (Content dashboard, Funnel), **Setup** (Offers, Mailboxes, Suppression). The menu collapses to an icon rail on wide screens (the button beside the logo, or ⌘B, remembered in a cookie); counts sit on the corner of the icon there, and the narrow-screen drawer always shows the whole menu. The active item is a Navy pill in light mode and a raised lighter-navy pill in dark mode; a count of things waiting on the owner (unread replies, tasks due, post numbers, Looms to record) is a Coral badge against that item, and the page it opens lists what is being counted.
- **Section menu bar (`crm/components/SectionTabs.tsx`, `.tabs`):** a rounded pill bar that switches between the sections of a multi-part screen (`aria-current="page"` with a Coral dot on the active tab, optional count pills with `.hot` in Coral for items waiting on the owner, and Left/Right/Home/End keyboard navigation). Each tab is a real link so every view can be bookmarked and the back button works.
- The **Dashboard** (`/`) starts with a dark Navy hero (`data-theme="dark"` in both themes, soft Coral glow, drifting particles, date, greeting "Good morning Brad", subtitle "what should we work on today?", the liquid glass YouVersion Bible widget for daily scripture, next meeting, main actions, and the three glass pace cards for Today, This week and This month), followed by the section menu bar switching between **Today** (key stats and tasks due), **This week** (week calendar and content summary), **This month** (the month grid, `MonthCalendar`), **Pipeline** (revenue, pipeline snapshot and deals going quiet) and **Activity** (recent timeline and backup status). Targets live in `config/targets.yaml`, never in code.
- **Pipelines (`Deals`, `Proposals`, `Content Board`):** the section menu bar has an **All** tab (the stacked stage bands with a coloured pill, count and total, rows underneath, and drag between bands) plus one tab per stage, with secondary views (such as Archived, Deleted, Proof and answers) in the right-hand pill bar.
- **Find and win screens (`Lead Sourcer`, `Companies`, `/companies/[id]`, `/deals/[id]`, `/proposals/[id]`):** Lead Sourcer uses `SectionTabs` for `Search`, `Find one company` and `Enrich`; `/companies` puts the workflow views on the left and the compliance/size checks on the right; `/companies/[id]` keeps the status stepper and next-step banner at the top and splits its 15 sections into `Overview`, `Research & offer`, `People`, `Outreach`, `Deals & work` and `Activity` (with `#hash` links and activity clicks switching to the right tab and flashing the section); `/deals/[id]` keeps the stage card at the top and switches between `Overview`, `Offers & quotes`, `Calls & audits` and `Activity`.
- **Content dashboard (`/content`, `crm/components/ContentTabs.tsx`):** `SectionTabs` switches between `Overview` (stats, next 5 to film, brief highlight), `Board` (idea pipeline), `Projects` (active projects table), `Calendar` (`/content/calendar`), `Analytics` (`/content/insights`), `Research` (`/content/creators`, with sub-pills for Creators, Outliers, Trends), `Brief` (`/content/brief`), `Footage` and `Thumbnails`.
- **Other multi-view screens (`Tasks`, `Inbox`, `Calls`, `Quotes`, `Clients`):** all use `SectionTabs` for view switching, with Coral `hot` badges on items requiring attention.
- Each screen has one job and one main button. Nothing important is more than two clicks from the dashboard.
- Light and dark are both supported (a switch at the bottom of the sidebar, remembered in a cookie). Light is the default.

## 7. Checklist for every new feature

Always:
- Use tokens (`--accent`, `--good`, `--surface`...) and never a raw hex.
- White card on Cream, Deep cream tiles inside, the radii above, a shadow instead of a border.
- One Coral button per screen; Navy text on Coral.
- Big numbers in Bricolage with tabular figures; labels in small capitals.
- Progress shows a fill plus a pace tick where there is a target; finished turns Lagoon.
- Check it in both light and dark. It must also work in `DEMO_MODE` with fake data and look good on camera.
- British English, prices in GBP.

Never:
- White text on Coral, or Coral as small text (use `--accent-text`).
- Coral backgrounds on whole sections, or two Coral buttons in view.
- Red for decoration, or Lagoon for anything that is not finished or healthy.
- Looping or decorative animation, or anything slower than 450ms (except the count-up/fill animations and the dashboard hero particle drift).
- New fonts, new accent colours, or gradients outside the dashboard hero.
- Copying another product's layout, colours or wording.

## 8. Where it lives

- Tokens and components: `crm/app/globals.css` (token block at the top, light first, `[data-theme="dark"]` after).
- Theme switch: `crm/components/ThemeToggle.tsx`, `theme` cookie read in `crm/app/layout.tsx`.
- Navigation: `crm/components/nav-items.ts` (one place). Sidebar counts: `crm/lib/needsYou.ts`. Stage colours: `crm/lib/stages.ts`.
- Dashboard: `crm/app/page.tsx`, targets `config/targets.yaml`, maths `crm/lib/paceMath.ts`.
- Lead Sourcer keeps its own layout and logic under `.sx` but uses the same tokens (`crm/app/sourcer/sourcer.css`).
- Flowcharts is scoped under `.fc` on the same tokens (`crm/app/flowcharts/flowcharts.css`). The diagram's own colours come from the Mermaid theme chosen, inside the preview and exports only; the preview sets `data-theme` on itself so its background always suits the diagram.
