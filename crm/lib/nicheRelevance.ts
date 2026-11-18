// Off-niche check for Lead Sourcer results (docs/LEAD_SOURCER_PLAN.md, step 2). Companies House industry codes are broad (96020 covers barbers
// and nail bars as well as aesthetics clinics), so a result whose name or Google category holds one of the niche's `name_excludes` words, and
// none of its `name_includes` words, is flagged: shown at the bottom, greyed, with the reason, and not ticked. It is never hidden, because a
// real clinic can be registered under any name. Pure; the same rule is in src/agency/core/niches.py (off_niche_reason) and both are tested
// against tests/fixtures/niche_relevance_cases.json.

/** `always`: words that flag even when an include word is there (`name_excludes_always`: a dental laboratory still says "dental"). */
export type RelevanceRules = { include: string[]; exclude: string[]; always: string[] };
export const NO_RULES: RelevanceRules = { include: [], exclude: [], always: [] };

const words = (s: string) => s.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
const list = (v: unknown) => (Array.isArray(v) ? v.map((x) => String(x).trim().toLowerCase()).filter((x) => words(x).length > 0).slice(0, 60) : []);

/** `name_includes`, `name_excludes` and `name_excludes_always` from a niche in config/niches.yaml. Anything else (missing, not a list) means no rule. */
export function readRelevanceRules(niche: any): RelevanceRules {
  return { include: list(niche?.name_includes), exclude: list(niche?.name_excludes), always: list(niche?.name_excludes_always) };
}

/**
 * Whether `keyword` appears in `text`, word by word, each keyword word matching the start of a text word:
 * "hair" matches "Hairdressing" but not "Chair"; "care home" matches "Care Homes" but "care" alone is not "care home".
 */
export function hasKeyword(text: string, keyword: string): boolean {
  const t = words(text), k = words(keyword);
  if (k.length === 0) return false;
  for (let i = 0; i + k.length <= t.length; i++) if (k.every((w, j) => t[i + j].startsWith(w))) return true;
  return false;
}

/** Which of `keywords` the name, then a category, holds, as the reason; or null. */
function reasonFrom(name: string, categories: string[], keywords: string[]): string | null {
  const inName = keywords.find((k) => hasKeyword(name, k));
  if (inName) return `Looks off-niche: the name says "${inName}"`;
  const cat = categories.find((c) => keywords.some((k) => hasKeyword(c, k)));
  return cat ? `Looks off-niche: Google lists it as "${cat}"` : null;
}

/** The reason a result looks off-niche, or null. An `always` word flags it outright; otherwise any include word (in the name or a category) clears it. */
export function offNicheReason(name: string, categories: string[], rules: RelevanceRules): string | null {
  const always = reasonFrom(name, categories, rules.always);
  if (always) return always;
  if (rules.exclude.length === 0) return null;
  if (rules.include.some((k) => [name, ...categories].some((t) => hasKeyword(t, k)))) return null;
  return reasonFrom(name, categories, rules.exclude);
}
