// Pure helpers for the "needs you" counts (no files, no database), so they can be tested on their own.

/** What a sidebar badge shows. Past 99 the exact number stops helping and would stretch the row. */
export const badgeText = (n: number) => (n > 99 ? "99+" : String(n));

export type NeedWording = { n: number; one: string; many: string };

/** "2 posts need numbers, 1 video past its date": used for the tooltip and for screen readers. Groups with nothing in them are left out. */
export const describeNeeds = (groups: NeedWording[]) =>
  groups.filter((g) => g.n > 0).map((g) => `${g.n} ${g.n === 1 ? g.one : g.many}`).join(", ");

/** A demo that has been built lives in its own folder under demos/. Anything else cannot be filmed yet, and is never looked up on disk. */
export const isDemoFolder = (p: string | null | undefined) => /^demos\/[\w-]+\/?$/.test((p ?? "").trim());

/** Long titles are cut at a word where possible, so a row stays on one or two lines. */
export function shortTitle(s: string, max = 80): string {
  const t = s.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return `${space > max * 0.6 ? cut.slice(0, space) : cut}…`;
}
