# Agency OS brand sheet

Approved by the owner on 3 Nov 2026. Every new screen, component and feature follows this. The visual reference is `docs/brand-sheet-preview.html` (open it in a browser: the buttons, motion and dashboard are live). The values live in one place, the token block at the top of `crm/app/globals.css`. Components use tokens, never raw hex.

**One line:** calm paper, one ember to follow. White does the resting, orange marks the one thing that needs you, teal means done or on track.

## 1. Colour

The owner's colours are **white and orange**. The third colour, chosen to suit them, is **Lagoon** (deep teal): it sits opposite orange, so both look stronger, and it reads naturally as "done", "on track" and "money kept". This is the brand's own palette, not a copy of any product.

| Role | Token | Light | Dark | Use |
|---|---|---|---|---|
| Page | `--bg` | `#FAF7F2` Paper | `#15110E` | The page behind the cards (a warm white, never grey) |
| Card | `--surface` | `#FFFFFF` White | `#1E1914` | Every card, drawer, dialog |
| Tile | `--surface-2` | `#F3EDE4` Sand | `#2A241E` | Tiles inside cards, inputs, board columns, secondary buttons |
| Lines | `--line`, `--line-soft` | `#E2DACE`, `#EAE3D9` | `#3B342C`, `#2D2720` | Hairlines only where a shadow is not enough |
| Text | `--text`, `--text-2`, `--muted` | `#1C1917`, `#4A443E`, `#78726B` | `#F7F2EA`, `#D6CEC3`, `#A1988C` | Ink, body, secondary |
| **Ember** (brand orange) | `--accent`, `--accent-strong` | `#F26B1D` | `#F26B1D` | The one main button, active bars, focus ring, count badges |
| Ember text | `--accent-text` | `#B4470A` | `#FF9A5C` | Orange used as text or a link (5.5:1 on white) |
| Ember tint | `--accent-soft` | `#FFF0E6` | 16% Ember | "Needs you" backgrounds, hover on the active thing |
| **Lagoon** (third colour) | `--good` | `#0F5C5E` | `#5CC5BF` | Done, on track, won, paid, success |
| Lagoon tint | `--good-soft` | `#DCEEEC` | 14% Lagoon | Success and finished backgrounds |
| Danger | `--bad`, `--bad-soft` | `#C8321F`, `#FDEBE8` | `#FF8A7A` | Errors and overdue only. Never decoration |

Supporting tokens keep the older names so existing screens carry on working: `--warn` is Ember text ("needs attention"), `--violet`, `--cyan` and `--orange` are quiet stone and teal shades for status badges. There are no other accent colours.

**Proportions:** about 60% paper, 20% white, 12% Ember, 8% Lagoon. If a screen looks orange all over, it is wrong.

**Contrast rules**
- Text on Ember is **Ink** (`--on-accent`, 5.7:1). Never white on Ember (only 3:1).
- Orange as small text or a link uses `--accent-text`, never `--accent`.
- Text on a stage pill is always Ink (`--on-stage`), so stage colours are light enough for it.
- Anything new gets checked: body text 4.5:1 or better.

**Deal stages** run a calm ramp from sand to teal as the deal progresses, Ember for the stages that need the owner, full teal for Won (`--stage-*` tokens, used by `lib/stages.ts`).

## 2. Type

Two fonts, both already loaded by the app (no new downloads).

- **Display: Bricolage Grotesque** 600/700, tight tracking (-0.02 to -0.03em): page titles, section titles and every big number (use tabular figures).
- **Body: Instrument Sans** 400/500/600: lists, forms, tables, buttons.
- Section labels are small capitals: 11.5-12px, 600, +0.06 to +0.12em, muted.
- Sizes: label 12, small 13, body 15, section 20-30, page and numbers 30-62.

## 3. Shape and surfaces

- Radii: card 20px (`--radius`), tile 14px (`--radius-md`), input and small 10px (`--radius-sm`), buttons and chips are pills (`999px`).
- Cards are white on Paper and separated by a soft shadow, not a border (`--shadow-1`; raised things such as drawers, menus and lifted cards use `--shadow-2`). In dark mode a hairline border carries the separation.
- Tiles (Sand) sit inside cards for grouped numbers and fields.
- Generous space: 16-22px inside cards, 14-16px between them.

## 4. Buttons, fields, badges

- **One Ember button per screen** (the main action): Ember fill, Ink text, soft Ember shadow.
- Secondary: Sand fill with a faint line. Quiet actions: text only (`button.link`). Destructive: tint of danger, solid only on confirm.
- Hover lifts the main button 1px, press shrinks to 97%, keyboard focus draws a thick Ember ring.
- Success is a button morph, not a pop-up: the button turns Lagoon with a tick for about 1.5 seconds. (Toasts stay for background confirmations.)
- Inputs are Sand with a transparent border; focus turns the border Ember with a soft Ember halo.
- Badges are tinted pills: Ember = needs you, Lagoon = on track or done, Sand = waiting, Danger = overdue.
- Segmented switches (Today / Week / Month, filters) use the pill switch (`.seg`).

## 5. Motion

Motion explains a change. It never decorates and never loops. Everything is 150-450ms with one curve, `cubic-bezier(.2,.8,.2,1)` (`--ease-out`), and switches off for anyone who has "reduce motion" set.

1. **Settle-in (420ms):** a page's top-level blocks rise 8px and fade in, 60ms apart.
2. **Count-up and fill (900ms):** big numbers count up, bars and rings fill when a screen opens. A thin tick on a bar is the pace marker: where you should be by now.
3. **Type-out:** an AI draft writes itself at reading speed, only after the owner has clicked Generate.
4. **Press to success (300ms):** shrink, then morph to Lagoon with a tick.
5. **Lift and drop:** a dragged card lifts (scale 1.03, 2 degrees tilt, bigger shadow) and springs into place.
6. **Panel open (220ms):** drawers slide in from the right; collapsible sections (Recent activity) expand in place.

A sidebar count pops in once (240ms) when it appears or changes. It never pulses or loops.

## 6. Layout and navigation

- Sidebar grouped under small capital labels, named by what the owner is doing: **Home** (Dashboard, Inbox, Tasks), **Find and win** (Lead Sourcer, Companies, Deals, Proposals), **Sell** (Calls, Quotes, Audits, Objections), **Deliver** (Clients, Outcomes, Enablement), **Grow** (Content, Funnel), **Setup** (Offers, Mailboxes, Suppression). The active item is an Ink pill in light mode and a raised Sand pill in dark mode; a count of things waiting on the owner (unread replies, tasks due, post numbers, Looms to record) is an Ember badge against that item, and the page it opens lists what is being counted.
- The **Dashboard** (`/`) is where every day starts: Today, This week and This month cards (completion ring, bars with a pace tick, projection), then what needs the owner, the pipeline snapshot and the collapsible Recent activity. Targets live in `config/targets.yaml`, never in code.
- **Deals pipeline format is fixed:** stacked stage bands with a coloured pill, count and total, rows underneath, drag between bands. Only its colours follow the brand.
- Each screen has one job and one main button. Nothing important is more than two clicks from the dashboard.
- Light and dark are both supported (a switch at the bottom of the sidebar, remembered in a cookie). Light is the default.

## 7. Checklist for every new feature

Always:
- Use tokens (`--accent`, `--good`, `--surface`...) and never a raw hex.
- White card on Paper, Sand tiles inside, the radii above, a shadow instead of a border.
- One Ember button per screen; Ink text on Ember.
- Big numbers in Bricolage with tabular figures; labels in small capitals.
- Progress shows a fill plus a pace tick where there is a target; finished turns Lagoon.
- Check it in both light and dark. It must also work in `DEMO_MODE` with fake data and look good on camera.
- British English, prices in GBP.

Never:
- White text on Ember, or Ember as small text (use `--accent-text`).
- Orange backgrounds on whole sections, or two Ember buttons in view.
- Red for decoration, or Lagoon for anything that is not finished or healthy.
- Looping or decorative animation, or anything slower than 450ms.
- New fonts, new accent colours or gradients.
- Copying another product's layout, colours or wording.

## 8. Where it lives

- Tokens and components: `crm/app/globals.css` (token block at the top, light first, `[data-theme="dark"]` after).
- Theme switch: `crm/components/ThemeToggle.tsx`, `theme` cookie read in `crm/app/layout.tsx`.
- Navigation: `crm/components/nav-items.ts` (one place). Sidebar counts: `crm/lib/needsYou.ts`. Stage colours: `crm/lib/stages.ts`.
- Dashboard: `crm/app/page.tsx`, targets `config/targets.yaml`, maths `crm/lib/paceMath.ts`.
- Lead Sourcer keeps its own layout and logic under `.sx` but uses the same tokens (`crm/app/sourcer/sourcer.css`).
