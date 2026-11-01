// Pure helpers for the content engine settings (no files, no database), so they can be tested on their own.

export type ContentConfig = { posts_per_week: number; max_open_ideas: number; niches: string[]; audience: string };

const whole = (v: unknown, fallback: number, min: number) => (typeof v === "number" && Number.isInteger(v) && v >= min ? v : fallback);

/**
 * The `content:` block of config/niches.yaml with safe defaults: 4 posts a week, 15 open ideas,
 * and the niches default to the first of `focus_niches` when none are set (a single key or a list is accepted).
 */
export function parseContentConfig(raw: any, focusNiches: unknown): ContentConfig {
  const asList = (v: unknown) => (Array.isArray(v) ? v : typeof v === "string" ? [v] : []).map((x) => String(x).trim()).filter(Boolean);
  const set = asList(raw?.content_niche);
  const niches = set.length ? set : asList(focusNiches).slice(0, 1);
  return {
    posts_per_week: whole(raw?.posts_per_week, 4, 1),
    max_open_ideas: whole(raw?.max_open_ideas, 15, 1),
    niches,
    audience: typeof raw?.content_audience === "string" ? raw.content_audience.trim() : "",
  };
}

/** How the video guide names the audience: the written sentence, or the niche keys ("hvac, roofing and pest control"). */
export function audienceText(c: ContentConfig): string {
  if (c.audience) return c.audience;
  const names = c.niches.map((n) => n.replace(/_/g, " "));
  if (names.length === 0) return "small UK businesses";
  return names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** Put the audience into the `{{NICHE}}` placeholder of a prompt. Throws if the prompt has none, so a missing placeholder is never silent. */
export function fillNiche(prompt: string, audience: string): string {
  if (!prompt.includes("{{NICHE}}")) throw new Error("The video guide (prompts/video-ideas.md) has no {{NICHE}} placeholder.");
  return prompt.split("{{NICHE}}").join(audience);
}

/** Whether new ideas may be generated: blocked while more than `max` ideas are waiting, unless overridden. */
export function backlogState(open: number, max: number, override: boolean): { blocked: boolean; message: string | null } {
  if (open <= max || override) return { blocked: false, message: null };
  return { blocked: true, message: `You have ${open} ideas waiting (the limit is ${max}). Script or archive some first.` };
}
