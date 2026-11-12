// What a cover looks like, as plain data: a layout, a title style, one power word, and the stickers and logos placed on it.
// Pure (no database, no canvas), so it can be tested. thumbnailDraw.ts draws it; the editor and the AI both write it, and
// everything they write passes through cleanDesign, so a saved design is always safe to draw.

export const LAYOUTS = [
  { code: "side", label: "Title low left", hint: "A frame from the video with the title over the lower left." },
  { code: "face", label: "Face and title", hint: "You on the right, a big stacked title on the left." },
  { code: "split", label: "Before / after", hint: "Two halves with a divider, title across the bottom." },
  { code: "banner", label: "Screen and banner", hint: "A screen recording kept bright, title in a band along the top." },
  { code: "title", label: "Title only", hint: "No frame: a huge title on Navy." },
] as const;
export type Layout = (typeof LAYOUTS)[number]["code"];

export const TITLE_STYLES = [
  { code: "solid", label: "Solid" },
  { code: "outline", label: "Outlined" },
  { code: "block", label: "Blocks" },
] as const;
export type TitleStyle = (typeof TITLE_STYLES)[number]["code"];

/** Stickers are drawn in code in the brand colours (no image files). `text` marks the ones that carry a word or number. */
export const STICKERS = [
  { code: "arrow", label: "Arrow", text: false, sample: "" },
  { code: "circle", label: "Circle", text: false, sample: "" },
  { code: "tape", label: "Tape underline", text: false, sample: "" },
  { code: "pill", label: "Pill badge", text: true, sample: "NEW" },
  { code: "burst", label: "Burst", text: true, sample: "FREE" },
  { code: "number", label: "Number badge", text: true, sample: "5" },
  { code: "emoji", label: "Reaction", text: true, sample: "👀" },
  { code: "tick", label: "Tick", text: false, sample: "" },
  { code: "cross", label: "Cross", text: false, sample: "" },
] as const;
export type StickerKind = (typeof STICKERS)[number]["code"];

export const STICKER_COLOURS = ["coral", "cream", "navy", "lagoon"] as const;
export type StickerColour = (typeof STICKER_COLOURS)[number];
/** The brand palette for a rendered image. A canvas cannot read the CSS tokens, so the cover colours live here and nowhere else. */
export const BRAND = { navy: "#14213D", cream: "#F4EDE0", coral: "#FF6B5B", lagoon: "#2FA39E", white: "#FFFFFF" } as const;

export type Sticker = { kind: StickerKind; x: number; y: number; scale: number; rot: number; text?: string; colour: StickerColour };
export type LogoMark = { asset: number; x: number; y: number; scale: number; rot: number };
export type Design = { layout: Layout; style: TitleStyle; tilt: boolean; power: string; stickers: Sticker[]; logos: LogoMark[] };

export const MAX_STICKERS = 8, MAX_LOGOS = 4, MAX_STICKER_TEXT = 12;
export const MAX_ASSETS = 30, MAX_ASSET_BYTES = 1_048_576;

const num = (v: unknown, lo: number, hi: number, dflt: number) => { const n = Number(v); return v !== null && v !== undefined && v !== "" && Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dflt; };
const oneOf = <T extends string>(v: unknown, list: readonly { code: T }[], dflt: T): T => (list.some((x) => x.code === v) ? (v as T) : dflt);

/**
 * Why a few words on a cover are refused, or null. The positioning rule: no money amounts, percentages or multipliers
 * (a figure on a cover is a claim), and no contact details. A plain count ("5", "3 FIXES") is fine.
 */
export function coverTextProblem(text: string): string | null {
  const t = text.trim();
  if (/[£$€%]|\b\d+(\.\d+)?\s*(k|m|x)\b|\b\d+\s*figures?\b/i.test(t)) return "No money amounts, percentages or multipliers on a cover: a figure there is a claim.";
  if (/@|https?:|www\.|\b\d[\d\s-]{8,}\d\b/i.test(t)) return "No links, emails or phone numbers on a cover.";
  if (/guarantee/i.test(t)) return "No guarantees on a cover.";
  return null;
}

const bare = (w: string) => w.toUpperCase().replace(/[^A-Z0-9'’-]/g, "");

/** The headline word to pick out in Coral: the one asked for if it is in the headline, otherwise none. */
export function powerWord(headline: string, wanted: unknown): string {
  const w = bare(String(wanted ?? "").trim());
  return w && headline.split(/\s+/).map(bare).includes(w) ? w : "";
}
/** Whether a word of the title is the power word (punctuation and case ignored). */
export const isPower = (word: string, power: string) => !!power && bare(word) === power;

/** Anything (the AI's reply, a saved row, the editor's state) made into a design that is safe to draw. Unknown values fall back, numbers are clamped, extras are cut. */
export function cleanDesign(raw: unknown, headline = ""): Design {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const stickers: Sticker[] = (Array.isArray(r.stickers) ? r.stickers : []).flatMap((s: any) => {
    const def = STICKERS.find((x) => x.code === s?.kind);
    if (!def) return [];
    let text: string | undefined;
    if (def.text) {
      text = [...String(s.text ?? "").trim()].slice(0, MAX_STICKER_TEXT).join("").trim() || def.sample;
      if (coverTextProblem(text)) text = def.sample;
    }
    return [{ kind: def.code, x: num(s.x, 0, 1, 0.5), y: num(s.y, 0, 1, 0.5), scale: num(s.scale, 0.3, 3, 1), rot: num(s.rot, -180, 180, 0), ...(text ? { text } : {}),
      colour: (STICKER_COLOURS as readonly string[]).includes(s.colour) ? s.colour : "coral" } as Sticker];
  }).slice(0, MAX_STICKERS);
  const logos: LogoMark[] = (Array.isArray(r.logos) ? r.logos : []).flatMap((l: any) => {
    const asset = Number(l?.asset);
    return Number.isInteger(asset) && asset > 0 ? [{ asset, x: num(l.x, 0, 1, 0.85), y: num(l.y, 0, 1, 0.15), scale: num(l.scale, 0.3, 3, 1), rot: num(l.rot, -180, 180, 0) }] : [];
  }).slice(0, MAX_LOGOS);
  return { layout: oneOf(r.layout, LAYOUTS, "side"), style: oneOf(r.style, TITLE_STYLES, "solid"), tilt: r.tilt === true, power: powerWord(headline, r.power), stickers, logos };
}

/** Where the AI's suggested stickers start on each layout, clear of the title (0..1 across and down). The owner then drags them. */
const START: Record<"wide" | "tall", Record<Layout, [number, number][]>> = {
  wide: { side: [[0.78, 0.22], [0.6, 0.42]], face: [[0.66, 0.2], [0.62, 0.8]], split: [[0.25, 0.45], [0.75, 0.45]], banner: [[0.7, 0.6], [0.3, 0.62]], title: [[0.88, 0.18], [0.12, 0.82]] },
  tall: { side: [[0.75, 0.3], [0.3, 0.42]], face: [[0.75, 0.55], [0.3, 0.62]], split: [[0.78, 0.3], [0.78, 0.7]], banner: [[0.7, 0.55], [0.3, 0.6]], title: [[0.8, 0.24], [0.25, 0.64]] },
};

/** A starting design from the AI's suggestion: its layout, style and power word, with up to two stickers placed where that layout has room. */
export function suggestedDesign(s: { layout?: unknown; style?: unknown; tilt?: unknown; power_word?: unknown; stickers?: unknown }, headline: string, format = "16:9"): Design {
  const layout = oneOf(s.layout, LAYOUTS, "side"), spots = START[format === "9:16" ? "tall" : "wide"][layout];
  const kinds = (Array.isArray(s.stickers) ? s.stickers : []).filter((k) => STICKERS.some((x) => x.code === k)).slice(0, 2);
  return cleanDesign({ layout, style: s.style, tilt: s.tilt, power: s.power_word, stickers: kinds.map((kind, i) => ({ kind, x: spots[i][0], y: spots[i][1], scale: 1, rot: kind === "arrow" ? 20 : 0 })) }, headline);
}

/** Title lines that fit: breaks on words so no line runs past `max` characters (a single long word gets its own line). */
export function wrapTitle(headline: string, max: number): string[] {
  const lines: string[] = [];
  let cur = "";
  for (const w of headline.trim().split(/\s+/).filter(Boolean)) {
    if (cur && (cur + " " + w).length > max) { lines.push(cur); cur = w; } else cur = cur ? `${cur} ${w}` : w;
  }
  if (cur) lines.push(cur);
  return lines;
}

/** PNG, JPEG or WebP by its first bytes (never by the file name or the browser's word for it), or null. */
export function sniffImage(b: Uint8Array): "image/png" | "image/jpeg" | "image/webp" | null {
  if (b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length > 12 && String.fromCharCode(b[0], b[1], b[2], b[3]) === "RIFF" && String.fromCharCode(b[8], b[9], b[10], b[11]) === "WEBP") return "image/webp";
  return null;
}
