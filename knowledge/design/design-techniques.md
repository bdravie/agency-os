# Design techniques

Reusable techniques for the CRM, demos, the public site and client builds. The brand rules themselves are in BRAND_SHEET.md; GSAP animation details are in the GSAP skill files.

## Hierarchy: one job per screen
- Decide the one thing a screen is for, then give it the biggest, highest-contrast element and the one primary (Coral) button.
- Group related things and separate groups with space rather than lines; proximity reads before borders.
- Put the most frequent action where the eye starts (top-left on a page, top of a card) and destructive actions away from it.

## Spacing and layout
- Use a spacing scale (4, 8, 12, 16, 24, 32, 48) instead of one-off values, so screens line up without measuring.
- Keep line length for reading text between about 45 and 75 characters.
- Design the phone layout first for anything used on the move; on wide screens add columns, not bigger text.
- Never set a fixed width over 400px without `min(…, calc(100vw - 32px))`, so nothing scrolls sideways on a phone.

## Type
- Two families at most: a display face for headings (Bricolage Grotesque) and a text face (Instrument Sans).
- A type scale with clear steps (for example 12, 14, 16, 20, 28, 40) and tighter letter-spacing on large headings.
- Inputs are 16px on touch screens, otherwise iPhone Safari zooms in and stays zoomed.

## Colour and contrast
- Mostly neutral surfaces, one accent used sparingly for the thing that matters (roughly 60% base, 30% secondary, 10% accent).
- Body text needs a contrast ratio of at least 4.5:1 against its background; large text and interface parts (borders of inputs, icons that carry meaning) at least 3:1 (WCAG 2.2 AA).
- Never use colour alone to carry meaning: pair it with a word, icon or shape.
- Define colours as tokens and switch the tokens for dark mode, rather than writing colours into components.

## Motion
- Motion explains a change (something appeared, moved or finished); it is not decoration, except in a hero.
- Keep interface motion between about 150 and 450ms with one easing curve, ease-out for things arriving.
- Animate transform and opacity, not width, height, top or left, so the browser does not redo layout every frame.
- Respect "reduce motion": show the final state instead of the animation (in GSAP, `gsap.matchMedia()` with `(prefers-reduced-motion: reduce)`).
- Looping motion must pause when off screen or when the tab is hidden.

## Interaction and accessibility
- Every control works with the keyboard and shows a visible focus ring.
- Touch targets at least 44 by 44 points on phones (Apple's guidance); WCAG 2.2 asks for at least 24 by 24 CSS pixels.
- Hover is a bonus, never the only way: anything revealed on hover must also open on focus and on tap.
- Pop-ups are native dialogs; anything that reaches someone outside the CRM asks for confirmation naming who and what.
- Build so the page still works with JavaScript off where it can: real links and forms first, then enhance.

## Forms
- Labels above fields, a hint under the label, the error next to the field it is about, in words that say how to fix it.
- Only ask for what the next step needs; default sensible values.

## Empty, loading and error states
- Empty: say what will appear here and give the one action that fills it.
- Loading: show the shape of what is coming; avoid spinners for anything under a second.
- Error: say what happened, that nothing was lost (if true), and what to do next.

## Dashboards and data
- Lead with the few numbers that drive a decision, each with its comparison (target, last week).
- Choose the chart for the question: change over time is a line, comparing categories is a bar, a part of a whole with few parts is a stacked bar.
- Label directly on the chart instead of a legend where possible; start bar axes at zero.

## Demos and Looms
- Fake data only (example.com emails, 07700 900xxx numbers), shaped like a real client's so it is believable.
- Zoom the browser so text is readable in a small Loom window, hide bookmarks and notifications, and plan the click path before recording.
- Show the before (the manual pain) for a few seconds, then the result, then how it works.
