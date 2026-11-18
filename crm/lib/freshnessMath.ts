// Rules that keep drafted posts fresh (LinkedIn, Instagram and TikTok). Pure: no database, no AI, no files, so it can be tested.
// Two things are refused in a post the AI wrote: a stock phrase from the owner's list (config/content-phrases.yaml),
// and a phrase an earlier post already used. freshness.ts loads the list and the earlier posts; the drafting steps ask the AI again with what was found.

/** An earlier post: what it is called on the board, its wording, and its opening lines (hook A and B). */
export type Earlier = { id: number; title: string; text: string; hooks: string[] };
export type Repeat = { phrase: string; title: string };
export type FreshRules = { generic: string[]; allowed: string[]; earlier: Earlier[] };

/** A run of this many words shared with an earlier post is a repeated phrase, when at least CONTENT_WORDS of them carry meaning. */
export const RUN_WORDS = 4;
export const CONTENT_WORDS = 3;
/** Two opening lines that start with the same HOOK_START words are the same opening. */
export const HOOK_START = 3;

const STOP = new Set(("a an the and or but so if then than that this these those there here it its it's i i'm i've i'll i'd me my we our us you your you're you've you'll " +
  "he she they them their his her is are was were be been being am do does did done have has had having will would can could should may might must " +
  "to of in on at by for from with without into onto over under up down out off about as not no nor yet just only even also very too more most much many some any all " +
  "each every one what which who whom when where why how while because after before again once still isn't aren't wasn't weren't don't doesn't didn't won't can't couldn't " +
  "that's there's here's what's let's get gets got go goes going went").split(" "));

/** Text as plain lowercase words: curly quotes straightened, punctuation and hyphens turned into spaces. */
export const plainText = (text: string): string =>
  String(text ?? "").toLowerCase().replace(/[‘’]/g, "'").replace(/[^a-z0-9']+/g, " ").replace(/(^| )'+|'+( |$)/g, " ").replace(/\s+/g, " ").trim();
/** Hashtags are labels, not wording: the same three can sit under every post. */
const noTags = (text: string): string => String(text ?? "").replace(/#[\p{L}\p{N}_]+/gu, " ");
const wordsOf = (text: string): string[] => { const t = plainText(noTags(text)); return t ? t.split(" ") : []; };
const sentencesOf = (text: string): string[] => noTags(text).split(/[.!?…\n]+/).map(plainText).filter((s) => s.split(" ").length >= 2);
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * The stock phrases found in a text, as written in the list. A phrase matches whole words only; one ending in * also matches longer endings
 * ("streamlin*" finds streamline, streamlined and streamlining).
 */
export function genericHits(text: string, phrases: string[]): string[] {
  const t = plainText(text);
  const out: string[] = [];
  for (const raw of phrases) {
    const star = /\*\s*$/.test(String(raw));
    const p = plainText(String(raw));
    if (!p) continue;
    if (new RegExp(`(?:^| )${escape(p)}${star ? "[a-z0-9']*" : ""}(?= |$)`).test(t)) out.push(String(raw).replace(/\*\s*$/, "").trim());
  }
  return [...new Set(out)];
}

/** The text with every allowed phrase swapped for a marker no run can cross, so a phrase the owner allows to recur never counts. */
function withoutAllowed(text: string, allowed: string[]): string {
  let t = ` ${plainText(noTags(text))} `;
  for (const a of allowed) { const p = plainText(a); if (p) t = t.split(` ${p} `).join(" ¦ "); }
  return t.trim();
}

/**
 * Phrases a new text shares with earlier posts: a run of RUN_WORDS or more words in the same order with at least CONTENT_WORDS meaningful words
 * (so "at the end of the" never counts), or a whole short sentence used before ("Picture it."). Each comes with the post it was found in.
 */
export function repeatedPhrases(text: string, earlier: Earlier[], allowed: string[] = [], limit = 6): Repeat[] {
  const grams = new Map<string, string>(), sentences = new Map<string, string>();
  for (const e of earlier) {
    const w = wordsOf(e.text);
    for (let i = 0; i + RUN_WORDS <= w.length; i++) { const g = w.slice(i, i + RUN_WORDS).join(" "); if (!grams.has(g)) grams.set(g, e.title); }
    for (const s of sentencesOf(e.text)) if (!sentences.has(s)) sentences.set(s, e.title);
  }
  const out: Repeat[] = [];
  const add = (phrase: string, title: string) => { if (!out.some((r) => r.phrase.includes(phrase) || phrase.includes(r.phrase))) out.push({ phrase, title }); };
  const allowedPlain = new Set(allowed.map(plainText));

  const w = withoutAllowed(text, allowed).split(" ").filter(Boolean);
  for (let i = 0; i + RUN_WORDS <= w.length; i++) {
    const first = grams.get(w.slice(i, i + RUN_WORDS).join(" "));
    if (!first) continue;
    let j = i;
    while (j + 1 + RUN_WORDS <= w.length && grams.has(w.slice(j + 1, j + 1 + RUN_WORDS).join(" "))) j++;
    const run = w.slice(i, j + RUN_WORDS);
    if (run.filter((x) => !STOP.has(x)).length >= CONTENT_WORDS) add(run.join(" "), first);
    i = j;
  }
  for (const s of sentencesOf(text)) {
    const title = sentences.get(s);
    if (title && !allowedPlain.has(s) && s.split(" ").some((x) => !STOP.has(x))) add(s, title);
  }
  return out.slice(0, limit);
}

/** The earlier post whose opening line starts with the same words as this one, or null. */
export function sameStart(hook: string, earlier: Earlier[]): Repeat | null {
  const w = wordsOf(hook);
  if (w.length < HOOK_START) return null;
  const start = w.slice(0, HOOK_START).join(" ");
  for (const e of earlier) for (const h of e.hooks) if (wordsOf(h).slice(0, HOOK_START).join(" ") === start) return { phrase: start, title: e.title };
  return null;
}

const quote = (s: string) => `"${s}"`;

/**
 * What stops a drafted piece being fresh, or an empty list, worded so the AI can fix it when asked again.
 * `parts` are the pieces of one post (its text, an opening line, a caption); one marked `hook` is an opening line, which must also start differently from every earlier one.
 */
export function freshProblems(parts: { name: string; text: string; hook?: boolean; startOnly?: boolean }[], rules: FreshRules): string[] {
  const out: string[] = [];
  for (const p of parts) {
    if (!p.text.trim()) continue;
    // An opening line that is already inside a checked text only needs its first words compared.
    if (p.startOnly) {
      const s = sameStart(p.text, rules.earlier);
      if (s) out.push(`the ${p.name} starts the same way as an earlier post (${quote(s.phrase)}, in ${quote(s.title)}): open differently`);
      continue;
    }
    const stock = genericHits(p.text, rules.generic);
    if (stock.length) out.push(`the ${p.name} uses wording everyone in the niche uses (${stock.slice(0, 5).map(quote).join(", ")}): replace it with a detail or a picture only this post has`);
    const rep = repeatedPhrases(p.text, rules.earlier, rules.allowed);
    if (rep.length) out.push(`the ${p.name} repeats wording from an earlier post (${rep.map((r) => `${quote(r.phrase)} from ${quote(r.title)}`).join(", ")}): say it from a different angle, in different words`);
    else if (p.hook) {
      const s = sameStart(p.text, rules.earlier);
      if (s) out.push(`the ${p.name} starts the same way as an earlier post (${quote(s.phrase)}, in ${quote(s.title)}): open differently`);
    }
  }
  return out;
}

/** Whether an opening line should be dropped from the options: it uses a stock phrase, repeats an earlier post, or starts like an earlier opening. */
export const staleHook = (hook: string, rules: FreshRules): boolean => freshProblems([{ name: "hook", text: hook, hook: true }], rules).length > 0;

/** Phrases two pieces written in the same go share (the Reels caption and the TikTok caption of one video), as problems. */
export function sharedBetween(pieces: { name: string; text: string }[], allowed: string[] = []): string[] {
  const out: string[] = [];
  for (let i = 1; i < pieces.length; i++) {
    const before = pieces.slice(0, i).map((p, n) => ({ id: n, title: p.name, text: p.text, hooks: [] }));
    const rep = repeatedPhrases(pieces[i].text, before, allowed, 3);
    if (rep.length) out.push(`the ${pieces[i].name} repeats wording from the ${rep[0].title} (${rep.map((r) => quote(r.phrase)).join(", ")}): each place gets its own wording and its own angle`);
  }
  return out;
}

/**
 * What the AI is shown before it writes: the opening line, first sentence and last line of recent posts, so it can steer away from them.
 * A line that mentions a name from the CRM, or an email or phone number, is left out. The code check above is what actually enforces the rule.
 */
export function usedDigest(earlier: Earlier[], skip: (line: string) => boolean = () => false, maxChars = 3000): string {
  const lines: string[] = [];
  const seen = new Set<string>();
  const sentences = (l: string) => l.split(/(?<=[.!?])\s+/).map((x) => x.trim()).filter(Boolean);
  for (const e of earlier) {
    const body = e.text.replace(/\r/g, "").split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
    // The closing line is the last sentence only, so a long hand-written paragraph is never passed on whole.
    const first = sentences(body[0] ?? "")[0] ?? "", last = body.length > 1 ? sentences(body[body.length - 1]).pop() ?? "" : "";
    for (const l of [...e.hooks, first, last]) {
      const line = l.replace(/\s+/g, " ").trim();
      const key = plainText(line);
      // Skipped: one word, too long to be a line, said already (or the start of a line already listed), or not to be shown.
      if (key.split(" ").length < 2 || line.length > 160 || [...seen].some((k) => k === key || k.startsWith(`${key} `)) || skip(line)) continue;
      seen.add(key);
      lines.push(`- ${line}`);
    }
  }
  let out = "";
  for (const l of lines) { if (out.length + l.length + 1 > maxChars) break; out += (out ? "\n" : "") + l; }
  return out;
}

/**
 * The earlier posts closest to what is about to be written (most meaningful words in common with `about`), so the AI can be shown them in full
 * and steer round their wording first time. Posts with nothing in common are left out.
 */
export function closestPosts(earlier: Earlier[], about: string, count = 5): Earlier[] {
  const want = new Set(wordsOf(about).filter((w) => !STOP.has(w) && w.length > 2));
  if (!want.size) return [];
  return earlier.map((e) => ({ e, n: new Set(wordsOf(e.text).filter((w) => want.has(w))).size }))
    .filter((x) => x.n >= 2).sort((a, b) => b.n - a.n || b.e.id - a.e.id).slice(0, count).map((x) => x.e);
}

/** The owner's phrase lists from config/content-phrases.yaml, made safe: strings only, trimmed, no blanks. */
export function parsePhraseConfig(raw: unknown): { generic: string[]; allowed: string[] } {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const list = (v: unknown) => [...new Set((Array.isArray(v) ? v : []).map((x) => String(x ?? "").trim()).filter((x) => plainText(x)))];
  return { generic: list(r.generic), allowed: list(r.allowed_repeats) };
}
