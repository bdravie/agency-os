// Rules for LinkedIn posts and their images (Content > LinkedIn). Pure: no database, no AI, no canvas, so it can be tested.
// linkedinPost.ts asks the AI and checks its answer here; linkedinDraw.ts draws what cleanPostImage lets through.
import { FIGURE } from "./breakdownMath.ts";
import { containsContactDetails } from "./audit.ts";
import { coverTextProblem } from "./thumbnailDesign.ts";
import { STOCK_OPENERS } from "./filmMath.ts";

/** A LinkedIn post is a content item with this format (the value repurposing has always saved). */
export const LINKEDIN_FORMAT = "LinkedIn post";
/** LinkedIn's own limit for a post. */
export const POST_MAX_CHARS = 3000;
/** Roughly how much of a post shows before "see more". A guide for the opening lines, not an exact figure. */
export const FOLD_CHARS = 200;
export const TITLE_MAX = 120;

export const STAGES = ["Drafted", "Image ready", "Scheduled", "Posted"] as const;
export type Stage = (typeof STAGES)[number];

/** Where a post is, worked out from what exists rather than stored: posted, given a day, has a chosen image, or just drafted. */
export function postStage(p: { status: string; day: string | null; hasImage: boolean }): Stage {
  if (p.status === "Posted") return "Posted";
  if (p.day) return "Scheduled";
  return p.hasImage ? "Image ready" : "Drafted";
}

export const wordCount = (text: string): number => text.trim().split(/\s+/).filter(Boolean).length;
export const hashtagsIn = (text: string): string[] => text.match(/#[\p{L}\p{N}_]+/gu) ?? [];
/** The first line of a post: what a reader sees before deciding to open it. */
export const openingLine = (text: string): string => text.replace(/\r/g, "").split("\n").map((l) => l.trim()).find(Boolean) ?? "";

const tidy = (text: string) => text.replace(/\r\n?/g, "\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();

const isListLine = (l: string) => /^\s*([-•*–]|\d+[.)])\s/.test(l);
/** Paragraphs a phone can read: a blank line between paragraphs, while the lines of a list stay together. */
export function spaceParagraphs(text: string): string {
  const lines = tidy(text).split("\n");
  const out: string[] = [];
  lines.forEach((line, i) => {
    const prev = lines[i - 1];
    if (i > 0 && line.trim() && prev.trim() && !(isListLine(line) && isListLine(prev))) out.push("");
    out.push(line);
  });
  return out.join("\n");
}

/** The post as it is pasted into LinkedIn: the opening line, the body (spaced for a phone), then up to three hashtags on their own line. */
export function assemblePost(opening: string, body: string, hashtags: string[]): string {
  const tags = [...new Set(hashtags.map((h) => `#${String(h).replace(/[^\p{L}\p{N}_]/gu, "")}`).filter((h) => h.length > 1))].slice(0, 3);
  return tidy([opening.trim(), spaceParagraphs(body), tags.join(" ")].filter(Boolean).join("\n\n"));
}

/** The post with a different opening line, or null when its first line is no longer the one being replaced (the owner rewrote it). */
export function swapOpening(text: string, from: string, to: string): string | null {
  const t = tidy(text);
  if (!from.trim() || !to.trim() || openingLine(t) !== from.trim()) return null;
  return tidy(to.trim() + t.slice(t.indexOf(from.trim()) + from.trim().length));
}

const plain = (s: string) => s.toLowerCase().replace(/[‘’]/g, "'").replace(/^[^a-z0-9]+/, "").trim();
const CLIENT_CLAIM = /\b(my|our)\s+clients?\b|\bclients?\s+(saw|got|made|gained|loved|doubled|tripled)\b|\bcustomers?\s+(saw|got|made|gained)\b/i;

/**
 * What is wrong with a post the AI wrote, or an empty list. The positioning rule: no figure or client result that was not supplied,
 * no links, @ names or contact details, the owner is not described as an "AI automation" business, and the opening is not a stock one.
 */
export function draftProblems(d: { title: string; opening: string; openingAlt: string; text: string }, banned: string[] = []): string[] {
  const out: string[] = [];
  const words = wordCount(d.text);
  if (!d.title.trim()) out.push("it needs a short working title");
  if (!d.opening.trim()) out.push("it needs an opening line");
  const letters = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  if (!d.openingAlt.trim() || letters(d.openingAlt) === letters(d.opening)) out.push("it needs a second opening line that is really different from the first");
  if (words < 60) out.push(`the post is only ${words} words: write 120 to 220`);
  if (words > 280) out.push(`the post is ${words} words: keep it to 120 to 220`);
  if (d.text.length > POST_MAX_CHARS) out.push(`the post is over LinkedIn's ${POST_MAX_CHARS.toLocaleString("en-GB")} character limit`);
  for (const [name, t] of [["post", d.text], ["second opening line", d.openingAlt]] as const) {
    if (/https?:\/\/|www\./i.test(t)) out.push(`the ${name} contains a link: remove it`);
    if (/(^|\s)@\w/.test(t) || containsContactDetails(t)) out.push(`the ${name} contains an @ name, email or phone number: remove it`);
    if (FIGURE.test(t)) out.push(`the ${name} states a money amount, percentage or multiplier: remove it, a result can only be claimed once it is real`);
    if (CLIENT_CLAIM.test(t)) out.push(`the ${name} talks about clients or their results: none were supplied, so describe what the change is designed to do`);
    if (/\bAI[- ]automation\s+(agency|consultant|consultancy|partner|expert|business|company)\b/i.test(t)) out.push(`the ${name} describes the owner as an AI automation business: lead with the result for the business`);
    const hit = banned.find((b) => t.toLowerCase().includes(b));
    if (hit) out.push(`the ${name} names a business or person from the CRM ("${hit}"): describe the pattern, never the business`);
  }
  for (const [name, o] of [["opening line", d.opening], ["second opening line", d.openingAlt]] as const) {
    if (STOCK_OPENERS.some((s) => plain(o).startsWith(s))) out.push(`the ${name} starts with a stock phrase ("${o.slice(0, 30)}"): open with one concrete detail`);
    if (wordCount(o) > 22) out.push(`the ${name} is too long: one sentence of 20 words or fewer`);
  }
  if (hashtagsIn(d.text).length > 3) out.push("the post has more than 3 hashtags");
  return out;
}

/** Why the owner's own post cannot be saved, or null. Their words are theirs: only length and contact details are refused. */
export function postProblem(title: string, text: string): string | null {
  if (!title.trim()) return "Give the post a working title.";
  if (title.trim().length > TITLE_MAX) return `The title is too long (${TITLE_MAX} characters at most).`;
  if (text.length > POST_MAX_CHARS) return `LinkedIn posts stop at ${POST_MAX_CHARS.toLocaleString("en-GB")} characters: this is ${text.length.toLocaleString("en-GB")}.`;
  if (containsContactDetails(title) || containsContactDetails(text)) return "Remove the email address or phone number: posts are about the business, and anyone can read them.";
  return null;
}

/** Things worth a second look before posting. Advice only: nothing here stops a save. */
export function postWarnings(text: string): string[] {
  const out: string[] = [];
  const t = text.trim();
  if (!t) return out;
  const first = openingLine(t);
  if (first.length > FOLD_CHARS) out.push(`The opening line is ${first.length} characters, so it will be cut off by "see more". Aim for under ${FOLD_CHARS}.`);
  if (FIGURE.test(t)) out.push("This states a money amount, percentage or multiplier. Only keep it if it is a real figure you can back up.");
  if (/https?:\/\/|www\./i.test(t)) out.push("This contains a link. Posts with a link in the text are usually shown to fewer people: consider putting it in the first comment.");
  if (hashtagsIn(t).length > 3) out.push("More than 3 hashtags tends to read as spam.");
  if (wordCount(t) < 40) out.push("This is very short for a text post.");
  return out;
}

// ---------- Images ----------

export const IMAGE_KINDS = [
  { code: "quote", label: "Quote card", hint: "One line from the post, large, with one word picked out." },
  { code: "steps", label: "Numbered steps", hint: "A heading and the steps or points the post makes." },
  { code: "compare", label: "Before / after", hint: "How it works now against how it works after the change." },
  { code: "diagram", label: "Workflow diagram", hint: "The process the post describes, drawn as a flowchart." },
  { code: "carousel", label: "Carousel", hint: "A cover, one slide per point and a closing question, downloaded as a PDF to post as a LinkedIn document." },
] as const;
export type ImageKind = (typeof IMAGE_KINDS)[number]["code"];

export const IMAGE_SIZES = [
  { code: "4:5", label: "Portrait 4:5", w: 1080, h: 1350 },
  { code: "1:1", label: "Square 1:1", w: 1080, h: 1080 },
] as const;
export type ImageSize = (typeof IMAGE_SIZES)[number]["code"];
export const imageSize = (code: string) => IMAGE_SIZES.find((s) => s.code === code) ?? IMAGE_SIZES[0];

export const IMAGE_THEMES = [{ code: "navy", label: "Navy" }, { code: "cream", label: "Cream" }] as const;
export type ImageTheme = (typeof IMAGE_THEMES)[number]["code"];

export type PostImage = {
  kind: ImageKind; size: ImageSize; theme: ImageTheme;
  /** The quote itself on a quote card; the heading on every other kind. */
  title: string;
  /** One word of the title drawn in Coral. */
  power: string;
  /** Steps (numbered steps only). */
  items: string[];
  before: string[]; after: string[];
  /** Mermaid flowchart code (workflow diagram only). */
  code: string;
  /** Whether the business name is drawn along the bottom. */
  footer: boolean;
  /** Carousel only: one slide per point (a heading and a line or two), then the closing line on the last slide. */
  slides: Slide[];
  cta: string;
};
export type Slide = { heading: string; body: string };

export const LIMITS = { quote: 160, title: 80, item: 90, steps: 6, side: 4, code: 1500, nodes: 8, slides: 8, slideHeading: 70, slideBody: 220, cta: 120 } as const;

/** Why a few words cannot go on an image, or null. The same rule as a video cover: a figure on an image is a claim, and no contact details. */
export function imageTextProblem(text: string): string | null {
  return coverTextProblem(text)?.replace(/on a cover/g, "on an image") ?? null;
}

/** Why Mermaid code cannot be used for a post image, or null. Flowcharts only, small enough to read in a feed, no directives, links or figures. */
export function diagramCodeProblem(code: string): string | null {
  const c = code.replace(/\r\n?/g, "\n").trim();
  if (!c) return "The diagram is empty.";
  if (c.length > LIMITS.code) return `The diagram is too long for an image (${LIMITS.code.toLocaleString("en-GB")} characters at most). A feed image reads best with 4 to 6 steps.`;
  if (!/^(flowchart|graph)\s+(TD|TB|LR|BT|RL)\b/.test(c)) return "Start the diagram with \"flowchart TD\" (top to bottom) or \"flowchart LR\" (left to right): only flowcharts are drawn on an image.";
  if (/%%/.test(c)) return "Remove the %% line: the image sets its own colours, and comments are not needed.";
  if (/^\s*(click|href|classDef|style|linkStyle)\b/m.test(c)) return "Remove the click, style and classDef lines: the image is drawn in the brand colours.";
  return imageTextProblem(c);
}

const lineOf = (v: unknown, max: number) => [...String(v ?? "").replace(/\s+/g, " ").trim()].slice(0, max).join("").trim();
const linesOf = (v: unknown, max: number, count: number) => (Array.isArray(v) ? v : []).map((x) => lineOf(x, max)).filter(Boolean).slice(0, count);
const bare = (w: string) => w.toUpperCase().replace(/[^A-Z0-9'’-]/g, "");

/** Anything (the AI's reply, a saved row, the editor's state) made into an image that is safe to draw: unknown values fall back, text is cut to length. It does not judge the words; imageProblems does. */
export function cleanPostImage(raw: unknown): PostImage {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const kind = (IMAGE_KINDS.some((k) => k.code === r.kind) ? r.kind : "quote") as ImageKind;
  const title = lineOf(r.title, kind === "quote" ? LIMITS.quote : LIMITS.title);
  const power = bare(lineOf(r.power, 30));
  return {
    kind,
    size: (IMAGE_SIZES.some((s) => s.code === r.size) ? r.size : "4:5") as ImageSize,
    theme: (IMAGE_THEMES.some((t) => t.code === r.theme) ? r.theme : "navy") as ImageTheme,
    title,
    power: power && title.split(/\s+/).map(bare).includes(power) ? power : "",
    items: kind === "steps" ? linesOf(r.items, LIMITS.item, LIMITS.steps) : [],
    before: kind === "compare" ? linesOf(r.before, LIMITS.item, LIMITS.side) : [],
    after: kind === "compare" ? linesOf(r.after, LIMITS.item, LIMITS.side) : [],
    code: kind === "diagram" ? String(r.code ?? "").replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim().slice(0, LIMITS.code + 1) : "",
    footer: r.footer !== false,
    slides: kind === "carousel" ? (Array.isArray(r.slides) ? r.slides : []).map((x: any) => ({ heading: lineOf(x?.heading, LIMITS.slideHeading), body: [...String(x?.body ?? "").replace(/[ \t]+/g, " ").replace(/\s*\n\s*/g, "\n").trim()].slice(0, LIMITS.slideBody).join("").trim() })).filter((x: Slide) => x.heading || x.body).slice(0, LIMITS.slides) : [],
    cta: kind === "carousel" ? lineOf(r.cta, LIMITS.cta) : "",
  };
}

/** How many pages an image has: a carousel is its cover, its slides and a closing slide when it has a closing line; everything else is one. */
export const pageCount = (d: PostImage): number => (d.kind === "carousel" ? 1 + d.slides.length + (d.cta ? 1 : 0) : 1);

/** Carousel slides as the editor shows them: one block per slide, the heading on its first line and the text below, a blank line between slides. */
export const slidesToText = (slides: Slide[]): string => slides.map((s) => [s.heading, s.body].filter(Boolean).join("\n")).join("\n\n");
export function textToSlides(text: string): Slide[] {
  return text.replace(/\r\n?/g, "\n").split(/\n\s*\n/).map((block) => block.split("\n").map((l) => l.trim()).filter(Boolean))
    .filter((lines) => lines.length).map(([heading, ...rest]) => ({ heading, body: rest.join("\n") }));
}

/** Whether a word of the title is the one picked out (punctuation and case ignored). */
export const isPowerWord = (word: string, power: string) => !!power && bare(word) === power;

/** What stops an image being saved or used, or an empty list: missing parts for its kind, or words that break the image rule. */
export function imageProblems(d: PostImage): string[] {
  const out: string[] = [];
  if (!d.title) out.push(d.kind === "quote" ? "Write the line for the quote card." : "Give the image a heading.");
  if (d.kind === "steps" && d.items.length < 2) out.push("Numbered steps need at least 2 steps.");
  if (d.kind === "compare" && (!d.before.length || !d.after.length)) out.push("A before / after image needs at least one line on each side.");
  if (d.kind === "diagram") { const p = diagramCodeProblem(d.code); if (p) out.push(p); }
  if (d.kind === "carousel" && d.slides.length < 2) out.push("A carousel needs at least 2 slides after the cover.");
  if (d.kind === "carousel" && d.slides.some((s) => !s.heading)) out.push("Every slide needs a heading (its first line).");
  for (const t of [d.title, ...d.items, ...d.before, ...d.after, ...d.slides.flatMap((s) => [s.heading, s.body]), d.cta]) {
    const p = imageTextProblem(t);
    if (p) { out.push(`"${t.slice(0, 40)}": ${p}`); break; }
  }
  return out;
}

export type GraphNode = { id?: unknown; label?: unknown; decision?: unknown };
export type GraphEdge = { from?: unknown; to?: unknown; label?: unknown };

/**
 * Mermaid flowchart code built from the steps the AI picked out, so the syntax is always valid: labels lose anything Mermaid would read as syntax,
 * edges to steps that do not exist are dropped, and steps with no edges at all are joined in order.
 */
export function mermaidFromGraph(nodes: GraphNode[], edges: GraphEdge[], direction: "TD" | "LR" = "TD"): string {
  const label = (v: unknown, max: number) => lineOf(String(v ?? "").replace(/["'`\[\]{}()<>|#;&\\]/g, " "), max);
  const kept = (Array.isArray(nodes) ? nodes : []).map((n) => ({ key: String(n?.id ?? "").trim(), label: label(n?.label, 42), decision: n?.decision === true })).filter((n) => n.label).slice(0, LIMITS.nodes);
  if (kept.length < 2) return "";
  const idOf = new Map<string, string>();
  kept.forEach((n, i) => { if (n.key && !idOf.has(n.key)) idOf.set(n.key, `n${i + 1}`); });
  const lines = [`flowchart ${direction}`, ...kept.map((n, i) => (n.decision ? `  n${i + 1}{"${n.label}"}` : `  n${i + 1}["${n.label}"]`))];
  const seen = new Set<string>();
  const links = (Array.isArray(edges) ? edges : []).flatMap((e) => {
    const a = idOf.get(String(e?.from ?? "").trim()), b = idOf.get(String(e?.to ?? "").trim());
    if (!a || !b || a === b || seen.has(`${a}>${b}`)) return [];
    seen.add(`${a}>${b}`);
    const l = label(e?.label, 18);
    return [l ? `  ${a} -->|"${l}"| ${b}` : `  ${a} --> ${b}`];
  });
  return [...lines, ...(links.length ? links : kept.slice(1).map((_, i) => `  n${i + 1} --> n${i + 2}`))].join("\n");
}

/** Text cut to a length at the end of a word, so a heading never stops mid-word. */
export function cutAtWord(text: string, max: number): string {
  const t = text.replace(/\s+/g, " ").trim();
  if ([...t].length <= max) return t;
  const cut = [...t].slice(0, max + 1).join("");
  const at = cut.lastIndexOf(" ");
  return (at > max * 0.5 ? cut.slice(0, at) : [...t].slice(0, max).join("")).replace(/[\s,;:–-]+$/, "");
}

/** A starting image of one kind, built without the AI from the post's own first lines (and its working title as the heading), for the owner to edit. */
export function starterImage(kind: ImageKind, postText: string, postTitle = ""): PostImage {
  const lines = postText.replace(/\r/g, "").split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
  const ok = (l: string) => !imageTextProblem(l);
  const first = lines.find(ok) ?? "";
  const rest = lines.slice(1).filter(ok);
  const short = (l: string, max: number) => cutAtWord(l.replace(/^[-•*\d.)\s]+/, ""), max);
  const head = postTitle.trim() && ok(postTitle) ? cutAtWord(postTitle, LIMITS.title) : short(first, LIMITS.title);
  switch (kind) {
    case "steps": return cleanPostImage({ kind, title: head, items: rest.slice(0, 4).map((l) => short(l, LIMITS.item)).concat(rest.length < 2 ? ["First step", "Second step"] : []) });
    case "compare": return cleanPostImage({ kind, title: head, before: ["How it works today"], after: ["How it works after the change"] });
    case "carousel": {
      // One slide per paragraph after the first, the paragraph's first sentence as the heading; the closing line is the post's last question.
      const paras = postText.replace(/\r/g, "").split(/\n\s*\n/).map((p) => p.trim()).filter((p) => p && !p.startsWith("#") && ok(p));
      const question = [...paras].reverse().find((p) => p.trim().endsWith("?")) ?? "";
      const body = paras.slice(1).filter((p) => p !== question).slice(0, 5).map((p) => {
        const [first, ...more] = p.split(/(?<=[.!?])\s+|\n/);
        return { heading: cutAtWord(first.replace(/^[-•*\d.)\s]+/, ""), LIMITS.slideHeading), body: cutAtWord(more.join(" "), LIMITS.slideBody) };
      });
      while (body.length < 2) body.push({ heading: body.length ? "Second point" : "First point", body: "" });
      return cleanPostImage({ kind, title: head, slides: body, cta: cutAtWord(question, LIMITS.cta) });
    }
    case "diagram": return cleanPostImage({ kind, title: head, code: mermaidFromGraph([{ id: "a", label: "An enquiry comes in" }, { id: "b", label: "It is logged in one place" }, { id: "c", label: "The right person is told" }, { id: "d", label: "The customer hears back" }], []) });
    default: return cleanPostImage({ kind: "quote", title: short(first, LIMITS.quote) });
  }
}

/** The file name for a downloaded image. */
export const imageFileName = (title: string, kind: string, size: string) =>
  `linkedin_${kind}_${size.replace(":", "x")}_${(title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "post")}.${kind === "carousel" ? "pdf" : "png"}`;
