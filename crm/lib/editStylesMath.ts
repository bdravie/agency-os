// Editing styles (Content > Styles): the pure rules. The catalogue is config/edit-styles.yaml, read by the CRM and by Claude before an edit.
// Nothing here reads a file or the database, so it runs in the unit tests as it is.

/** What fills the frame for one beat. `plate` is the full-screen ground a step plate or a generated graphic sits on. */
export const LAYOUTS = ["face", "over_shoulder", "screen_card", "punch", "broll", "plate"] as const;
export type Layout = (typeof LAYOUTS)[number];
export const LAYOUT_NAME: Record<Layout, string> = { face: "Face", over_shoulder: "Over-shoulder", screen_card: "Screen card", punch: "Punch", broll: "B-roll", plate: "Plate" };

/** Every element the CRM can draw (components/styles/ReelFrame.tsx is typed against this, so a key cannot be listed here and not drawn). */
export const DRAWN = [
  "face", "over_shoulder", "screen_card", "punch",
  "hook_title", "spoken_hook", "site_captions", "chapter_title",
  "progress_bar", "step_plate", "callout_pill", "spotlight", "tape_counter", "job_ticket", "payoff_slam", "end_plate",
  "slow_push", "hard_cut", "slide_blur", "speed_match", "redaction",
  "music_bed", "swoosh", "tick", "thud",
  "broll", "kinetic_type", "logo_sting", "stat_card",
] as const;
export type DrawnKey = (typeof DRAWN)[number];
export const isDrawn = (k: string): k is DrawnKey => (DRAWN as readonly string[]).includes(k);

/** Motion graphics that take the viewer's eye: the brand sheet allows one of these on screen at a time. The progress bar is always there, so it is not counted. */
export const GRAPHICS = ["step_plate", "callout_pill", "spotlight", "tape_counter", "job_ticket", "payoff_slam", "end_plate", "chapter_title", "kinetic_type", "logo_sting", "stat_card"];
export const MAX_STEP_PLATES = 3;
export const MAX_BEATS = 12;

export type Group = { key: string; name: string; blurb: string };
export type Element = { key: string; group: string; name: string; when: string; rule: string; on: Layout; with: string[]; timing: string; sfx: string; cost: string };
export type Beat = { label: string; layout: Layout; elements: string[]; seconds: number; note: string };
export type Template = { key: string; name: string; format: string; niche: string; length: string; blurb: string; beats: Beat[]; custom?: boolean };
export type Rule = { tag: string; text: string };
export type Safe = { top: number; bottom: number; rail: number; side: number; caption_face: number; caption_screen: number };
export type Catalogue = { groups: Group[]; elements: Element[]; rules: Rule[]; safe: Safe; templates: Template[] };

export const DEFAULT_SAFE: Safe = { top: 220, bottom: 380, rail: 150, side: 64, caption_face: 1240, caption_screen: 1420 };

const text = (v: unknown, max: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const keyOf = (v: unknown) => text(v, 40).toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "");
const asLayout = (v: unknown): Layout => ((LAYOUTS as readonly string[]).includes(String(v)) ? (v as Layout) : "face");
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
const PHONE = /(?:\+\d{1,3}[\s-]?\(?\d{1,4}\)?|\(?\b0\d{2,4}\)?)(?:[\s-]?\d){6,10}\b/;
export const hasContact = (s: string) => EMAIL.test(s) || PHONE.test(s);
/** Emails and phone numbers never go into a brief: the same masking as a call transcript. */
export const maskContacts = (s: string) => s.replace(new RegExp(EMAIL, "g"), "[email]").replace(new RegExp(PHONE, "g"), "[phone]");

function parseBeat(raw: any, known: Set<string>): Beat | null {
  if (!raw || typeof raw !== "object") return null;
  const seconds = Number(raw.seconds);
  return {
    label: text(raw.label, 40) || "Beat",
    layout: asLayout(raw.layout),
    elements: [...new Set(list(raw.elements).map(keyOf))].filter((k) => known.has(k)).slice(0, 6),
    seconds: Number.isFinite(seconds) && seconds > 0 ? Math.min(120, Math.round(seconds * 10) / 10) : 0,
    note: text(raw.note, 200),
  };
}

/** Reads the parsed yaml. Anything malformed is dropped rather than shown half-right; a duplicate key keeps the first. */
export function parseCatalogue(y: any): Catalogue {
  const groups: Group[] = [];
  for (const g of list(y?.groups) as any[]) {
    const key = keyOf(g?.key), name = text(g?.name, 60);
    if (key && name && !groups.some((x) => x.key === key)) groups.push({ key, name, blurb: text(g?.blurb, 200) });
  }
  const elements: Element[] = [];
  for (const e of list(y?.elements) as any[]) {
    const key = keyOf(e?.key), name = text(e?.name, 60);
    if (!key || !name || elements.some((x) => x.key === key) || !groups.some((g) => g.key === keyOf(e?.group))) continue;
    elements.push({ key, group: keyOf(e.group), name, when: text(e.when, 200), rule: text(e.rule, 400), on: asLayout(e.on), with: list(e.with).map(keyOf).filter(Boolean), timing: text(e.timing, 80), sfx: keyOf(e.sfx), cost: text(e.cost, 80) });
  }
  const known = new Set(elements.map((e) => e.key));
  for (const e of elements) e.with = e.with.filter((k) => known.has(k) && k !== e.key);
  const rules: Rule[] = (list(y?.rules) as any[]).map((r) => ({ tag: text(r?.tag, 40) || "Rules", text: text(r?.text, 400) })).filter((r) => r.text);
  const safe = { ...DEFAULT_SAFE };
  for (const k of Object.keys(safe) as (keyof Safe)[]) { const n = Number(y?.safe?.[k]); if (Number.isFinite(n) && n >= 0 && n <= 1920) safe[k] = n; }
  const templates: Template[] = [];
  for (const t of list(y?.templates) as any[]) {
    const key = keyOf(t?.key), name = text(t?.name, 80);
    const beats = (list(t?.beats) as any[]).map((b) => parseBeat(b, known)).filter((b): b is Beat => !!b).slice(0, MAX_BEATS);
    if (!key || !name || beats.length < 2 || templates.some((x) => x.key === key)) continue;
    templates.push({ key, name, format: text(t.format, 40), niche: keyOf(t.niche), length: text(t.length, 40), blurb: text(t.blurb, 300), beats });
  }
  return { groups, elements, rules, safe, templates };
}

/** Elements by group, in the catalogue's order, leaving out a group with nothing in it. */
export function byGroup(c: Catalogue): { group: Group; elements: Element[] }[] {
  return c.groups.map((group) => ({ group, elements: c.elements.filter((e) => e.group === group.key) })).filter((g) => g.elements.length);
}

/** What a preview card draws: the element on its layout, with anything it is shown alongside. */
export function previewOf(e: Element): { layout: Layout; elements: string[] } {
  return { layout: e.on, elements: [...new Set([e.key, ...e.with])] };
}

export const totalSeconds = (beats: Beat[]) => Math.round(beats.reduce((n, b) => n + b.seconds, 0) * 10) / 10;

/** A saved template is `custom-<id>`; anything else is a key in the yaml. */
export const customKey = (id: number | string) => `custom-${id}`;
export const customId = (key: string): number | null => { const m = /^custom-(\d+)$/.exec(key); return m ? Number(m[1]) : null; };

export type TemplateInput = { name?: unknown; format?: unknown; niche?: unknown; length?: unknown; blurb?: unknown; beats?: unknown };
export type Cleaned = { template: Omit<Template, "key">; warnings: string[] } | { error: string };

/**
 * Checks a template the owner built on screen. Refused: no name, fewer than 2 beats, more than 12, contact details anywhere.
 * Warned, never refused (the brand sheet's own limits, which the owner may choose to break): more than 3 step plates,
 * two graphics in one beat, a beat with no captions, no hook title or end plate.
 */
export function cleanTemplate(input: TemplateInput, c: Catalogue): Cleaned {
  const name = text(input?.name, 80);
  if (!name) return { error: "Give the template a name." };
  const known = new Set(c.elements.map((e) => e.key));
  const raw = list(input?.beats);
  if (raw.length > MAX_BEATS) return { error: `A template has ${MAX_BEATS} beats at most. This one has ${raw.length}.` };
  const beats = raw.map((b) => parseBeat(b, known)).filter((b): b is Beat => !!b);
  if (beats.length < 2) return { error: "A template needs at least 2 beats." };
  const template = { name, format: text(input.format, 40), niche: keyOf(input.niche), length: text(input.length, 40), blurb: text(input.blurb, 300), beats, custom: true };
  const words = [name, template.blurb, template.format, template.length, ...beats.flatMap((b) => [b.label, b.note])];
  if (words.some(hasContact)) return { error: "Leave out email addresses and phone numbers. A template describes an edit, not a person." };

  const nameOf = (k: string) => c.elements.find((e) => e.key === k)?.name ?? k;
  const warnings: string[] = [];
  const plates = beats.filter((b) => b.elements.includes("step_plate")).length;
  if (plates > MAX_STEP_PLATES) warnings.push(`${plates} step plates: the brand sheet allows ${MAX_STEP_PLATES} in a video.`);
  for (const b of beats) {
    const g = b.elements.filter((k) => GRAPHICS.includes(k));
    if (g.length > 1) warnings.push(`${b.label}: ${g.map(nameOf).join(" and ")} together. One graphic at a time.`);
    // Captions hide while a plate, slam or end plate carries the words, so those beats are fine without them.
    const carried = b.elements.some((k) => ["step_plate", "payoff_slam", "end_plate", "hook_title", "spoken_hook", "kinetic_type", "logo_sting", "stat_card"].includes(k));
    if (!b.elements.includes("site_captions") && !carried) warnings.push(`${b.label}: no captions. Site Captions run on every video without gaps.`);
  }
  if (!beats.some((b) => b.elements.includes("end_plate"))) warnings.push("No end plate, so nothing asks the viewer to do anything.");
  if (!beats[0].elements.some((k) => k === "hook_title" || k === "spoken_hook")) warnings.push("The first beat has no hook title or spoken hook.");
  return { template, warnings: [...new Set(warnings)] };
}

export type BriefItem = { idea: string; hook?: string | null; hookAlt?: string | null; script?: string | null; caption?: string | null; keyword?: string | null; niche?: string | null };

/**
 * The brief the owner copies to Claude to get a video edited. Written by code, never by AI, so every brief carries the same rules:
 * the template's beats in order, each element with its rule, the script as saved, and the non-negotiables from the catalogue.
 * Emails and phone numbers in the script are masked. The CRM edits nothing and sends nothing.
 */
export function editBrief(item: BriefItem, t: Template, c: Catalogue): string {
  const el = (k: string) => c.elements.find((e) => e.key === k);
  const out: string[] = [];
  const clean = (s: string | null | undefined) => maskContacts(String(s ?? "").replace(/\r\n/g, "\n").trim());
  out.push(`Edit this video: ${clean(item.idea) || "Untitled"}`);
  out.push("");
  out.push("Before you start: load the video-editor skill, read the Brad Reels brand sheet, and read config/edit-styles.yaml in the agency-os repo. That file is the master list of elements and rules; where it and this brief differ, the file wins.");
  out.push("");
  out.push(`TEMPLATE: ${t.name}${t.format ? ` (${t.format})` : ""}${t.length ? `, ${t.length}` : ""}`);
  if (t.blurb) out.push(t.blurb);
  out.push("");
  out.push("BEATS, IN ORDER");
  t.beats.forEach((b, i) => {
    out.push(`${i + 1}. ${b.label}: ${LAYOUT_NAME[b.layout]} layout${b.seconds ? `, about ${b.seconds}s` : ""}`);
    for (const k of b.elements) { const e = el(k); if (e) out.push(`   - ${e.name}: ${e.rule}${e.timing ? ` (${e.timing})` : ""}${e.cost ? ` [${e.cost}: ask before spending]` : ""}`); }
    if (b.note) out.push(`   Note: ${b.note}`);
  });
  out.push(`The timings are a guide (about ${totalSeconds(t.beats)}s in all). The voiceover sets the real length.`);
  out.push("");
  if (clean(item.hook)) out.push(`HOOK A: ${clean(item.hook)}`);
  if (clean(item.hookAlt)) out.push(`HOOK B: ${clean(item.hookAlt)}`);
  if (clean(item.keyword)) out.push(`KEYWORD (end plate): ${clean(item.keyword)}`);
  out.push("");
  out.push("SCRIPT");
  out.push(clean(item.script) || "(No script saved yet. Ask for it before editing.)");
  if (clean(item.caption)) { out.push(""); out.push("CAPTION"); out.push(clean(item.caption)); }
  out.push("");
  out.push("RULES THAT ALWAYS APPLY");
  c.rules.forEach((r, i) => out.push(`${i + 1}. ${r.text}`));
  out.push("");
  out.push(`SAFE ZONES (1080 x 1920): keep text clear of the top ${c.safe.top}px, the bottom ${c.safe.bottom}px and the right ${c.safe.rail}px. Caption baseline ${c.safe.caption_face}px on Face and Punch, ${c.safe.caption_screen}px on Over-shoulder and Screen card.`);
  out.push("");
  out.push("Before delivering: check a contact sheet of the busiest moments, say what any generated footage cost, and tell me which raw clips you used.");
  return out.join("\n");
}
