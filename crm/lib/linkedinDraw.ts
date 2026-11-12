import { BRAND } from "./thumbnailDesign";
import { imageSize, isPowerWord, pageCount, type PostImage } from "./linkedinMath";
import { standaloneSvg } from "./flowchartExport";

// Draws a LinkedIn post image onto a canvas. The card preview, the editor and the PNG download all call drawPostImage,
// so what is on screen is what is downloaded. Browser only; the rules about what may be drawn live in linkedinMath.ts.
// Colours come from BRAND (a canvas cannot read the CSS tokens).

export type PostFonts = { display: string; text: string };
export type DrawParts = { fonts: PostFonts; diagram: HTMLImageElement | null; diagramNote?: string; footer: string };

const rgba = (hex: string, a: number) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${a})`; };

type Palette = { bg: string; ink: string; soft: string; card: string; line: string; chip: string; chipInk: string };
const PALETTE: Record<PostImage["theme"], Palette> = {
  navy: { bg: BRAND.navy, ink: BRAND.white, soft: rgba(BRAND.cream, 0.74), card: rgba(BRAND.white, 0.07), line: rgba(BRAND.cream, 0.2), chip: BRAND.cream, chipInk: BRAND.navy },
  cream: { bg: BRAND.cream, ink: BRAND.navy, soft: rgba(BRAND.navy, 0.72), card: BRAND.white, line: rgba(BRAND.navy, 0.12), chip: BRAND.navy, chipInk: BRAND.cream },
};

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const q = Math.min(r, w / 2, h / 2);
  ctx.beginPath(); ctx.moveTo(x + q, y); ctx.arcTo(x + w, y, x + w, y + h, q); ctx.arcTo(x + w, y + h, x, y + h, q); ctx.arcTo(x, y + h, x, y, q); ctx.arcTo(x, y, x + w, y, q); ctx.closePath();
}

/** Lines that fit a width, broken on words, measured with the font already set on the context. */
function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const lines: string[] = [];
  let cur = "";
  for (const w of text.trim().split(/\s+/).filter(Boolean)) {
    const next = cur ? `${cur} ${w}` : w;
    if (cur && ctx.measureText(next).width > maxW) { lines.push(cur); cur = w; } else cur = next;
  }
  if (cur) lines.push(cur);
  return lines;
}

type Fitted = { size: number; lines: string[][]; height: number; lh: number };
/**
 * The largest size (between max and min) at which every text wraps inside maxW and all of them together fit maxH.
 * `gap` is the space between texts and `minRow` the least height one takes (a step is never shorter than its number badge).
 */
function fit(ctx: CanvasRenderingContext2D, texts: string[], font: (px: number) => string, maxW: number, maxH: number, max: number, min: number, lhK: number, gap = 0, minRow = 0): Fitted {
  let size = max;
  for (;;) {
    ctx.font = font(size);
    const lines = texts.map((t) => wrap(ctx, t, maxW));
    const lh = size * lhK;
    const height = lines.reduce((a, l) => a + Math.max(minRow, l.length * lh), 0) + gap * Math.max(0, texts.length - 1);
    const tooWide = lines.some((ls) => ls.some((l) => ctx.measureText(l).width > maxW));
    if ((height <= maxH && !tooWide) || size <= min) return { size, lines, height, lh };
    size = Math.max(min, size - Math.max(2, size * 0.05));
  }
}

/** Draws wrapped lines from the left, word by word so one word can be picked out in Coral. Returns the y below the last line. */
function drawLines(ctx: CanvasRenderingContext2D, lines: string[], x: number, top: number, size: number, lh: number, ink: string, power = ""): number {
  ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
  const space = ctx.measureText(" ").width;
  lines.forEach((line, i) => {
    let cx = x;
    const base = top + i * lh + size * 0.82;
    for (const w of line.split(" ")) {
      ctx.fillStyle = isPowerWord(w, power) ? BRAND.coral : ink;
      ctx.fillText(w, cx, base);
      cx += ctx.measureText(w).width + space;
    }
  });
  return top + lines.length * lh;
}

function badge(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, fill: string, ink: string, mark: "tick" | "cross" | string, family: string) {
  ctx.fillStyle = fill; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
  if (mark === "tick" || mark === "cross") {
    ctx.strokeStyle = ink; ctx.lineWidth = r * 0.26; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.beginPath();
    if (mark === "tick") { ctx.moveTo(cx - r * 0.42, cy + r * 0.04); ctx.lineTo(cx - r * 0.1, cy + r * 0.36); ctx.lineTo(cx + r * 0.46, cy - r * 0.32); }
    else { ctx.moveTo(cx - r * 0.34, cy - r * 0.34); ctx.lineTo(cx + r * 0.34, cy + r * 0.34); ctx.moveTo(cx + r * 0.34, cy - r * 0.34); ctx.lineTo(cx - r * 0.34, cy + r * 0.34); }
    ctx.stroke();
  } else {
    ctx.fillStyle = ink; ctx.font = `800 ${r * 1.1}px ${family}`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(mark, cx, cy + r * 0.06);
  }
}

/** The heading every kind but the quote card starts with: the title, then a short Coral rule. Returns the y where the content starts. */
function heading(ctx: CanvasRenderingContext2D, d: PostImage, p: Palette, fonts: PostFonts, x: number, top: number, w: number, s: number): number {
  if (!d.title) return top;
  const f = fit(ctx, [d.title], (px) => `800 ${px}px ${fonts.display}`, w, 250 * s, 78 * s, 46 * s, 1.08);
  ctx.font = `800 ${f.size}px ${fonts.display}`;
  const y = drawLines(ctx, f.lines[0], x, top, f.size, f.lh, p.ink, d.power);
  ctx.fillStyle = BRAND.coral; roundRect(ctx, x, y + 22 * s, 120 * s, 10 * s, 5 * s); ctx.fill();
  return y + 22 * s + 10 * s + 44 * s;
}

function quote(ctx: CanvasRenderingContext2D, d: PostImage, p: Palette, fonts: PostFonts, x: number, top: number, w: number, h: number, s: number) {
  const markH = 150 * s;
  const f = fit(ctx, [d.title], (px) => `800 ${px}px ${fonts.display}`, w, h - markH, 108 * s, 50 * s, 1.1);
  const y0 = top + Math.max(0, (h - markH - f.height) / 2);
  ctx.fillStyle = BRAND.coral; ctx.font = `800 ${300 * s}px ${fonts.display}`; ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
  ctx.fillText("“", x - 10 * s, y0 + 232 * s);
  ctx.font = `800 ${f.size}px ${fonts.display}`;
  drawLines(ctx, f.lines[0], x, y0 + markH, f.size, f.lh, p.ink, d.power);
}

function steps(ctx: CanvasRenderingContext2D, d: PostImage, p: Palette, fonts: PostFonts, x: number, top: number, w: number, h: number, s: number) {
  const r = 38 * s, indent = r * 2 + 30 * s, n = d.items.length;
  if (!n) return;
  const minGap = 26 * s;
  const f = fit(ctx, d.items, (px) => `600 ${px}px ${fonts.text}`, w - indent, h, 54 * s, 28 * s, 1.26, minGap, r * 2);
  const gap = Math.min(84 * s, minGap + Math.max(0, h - f.height) / n);
  // A short list sits a little below the heading rather than leaving the whole bottom half empty.
  let y = top + Math.max(0, (h - f.height - (gap - minGap) * (n - 1)) * 0.3);
  d.items.forEach((_, i) => {
    const rowH = Math.max(r * 2, f.lines[i].length * f.lh);
    if (i > 0) { ctx.strokeStyle = p.line; ctx.lineWidth = 2 * s; ctx.beginPath(); ctx.moveTo(x, y - gap / 2); ctx.lineTo(x + w, y - gap / 2); ctx.stroke(); }
    badge(ctx, x + r, y + rowH / 2, r, BRAND.coral, BRAND.navy, String(i + 1), fonts.display);
    ctx.font = `600 ${f.size}px ${fonts.text}`;
    drawLines(ctx, f.lines[i], x + indent, y + (rowH - f.lines[i].length * f.lh) / 2, f.size, f.lh, p.ink);
    y += rowH + gap;
  });
}

function compare(ctx: CanvasRenderingContext2D, d: PostImage, p: Palette, fonts: PostFonts, x: number, top: number, w: number, h: number, s: number) {
  const gap = 28 * s, panelH = (h - gap) / 2, pad = 36 * s, labelH = 52 * s, r = 24 * s, indent = r * 2 + 22 * s;
  const innerW = w - pad * 2 - indent, innerH = panelH - pad * 2 - labelH - 22 * s, rowGap = 18 * s;
  // One text size for both panels, so the two sides read as a pair.
  const size = Math.min(...[d.before, d.after].map((items) => fit(ctx, items, (px) => `600 ${px}px ${fonts.text}`, innerW, innerH, 50 * s, 26 * s, 1.24, rowGap, r * 2).size));
  const panel = (items: string[], y: number, after: boolean) => {
    ctx.fillStyle = p.card; roundRect(ctx, x, y, w, panelH, 30 * s); ctx.fill();
    ctx.strokeStyle = after ? BRAND.coral : p.line; ctx.lineWidth = (after ? 6 : 2) * s; roundRect(ctx, x, y, w, panelH, 30 * s); ctx.stroke();
    const label = after ? "AFTER" : "BEFORE";
    ctx.font = `800 ${26 * s}px ${fonts.display}`; ctx.textAlign = "left"; ctx.textBaseline = "middle";
    const lw = ctx.measureText(label).width + 40 * s;
    ctx.fillStyle = after ? BRAND.coral : p.chip; roundRect(ctx, x + pad, y + pad, lw, labelH, labelH / 2); ctx.fill();
    ctx.fillStyle = after ? BRAND.navy : p.chipInk; ctx.fillText(label, x + pad + 20 * s, y + pad + labelH / 2 + 1 * s);
    ctx.font = `600 ${size}px ${fonts.text}`;
    const lh = size * 1.24;
    const rows = items.map((item) => { const lines = wrap(ctx, item, innerW); return { lines, rowH: Math.max(r * 2, lines.length * lh) }; });
    const used = rows.reduce((a, b) => a + b.rowH, 0) + rowGap * Math.max(0, rows.length - 1);
    // The lines sit in the middle of the space under the label, so a panel with one line does not look empty at the bottom.
    let cy = y + pad + labelH + 22 * s + Math.max(0, (innerH - used) / 2);
    for (const { lines, rowH } of rows) {
      if (cy + rowH > y + panelH - pad * 0.4) break;                      // never draw past the panel
      badge(ctx, x + pad + r, cy + rowH / 2, r, after ? BRAND.lagoon : rgba(p.ink === BRAND.white ? BRAND.cream : BRAND.navy, 0.28), after ? BRAND.white : p.ink, after ? "tick" : "cross", fonts.display);
      ctx.font = `600 ${size}px ${fonts.text}`;
      drawLines(ctx, lines, x + pad + indent, cy + (rowH - lines.length * lh) / 2, size, lh, after ? p.ink : p.soft);
      cy += rowH + rowGap;
    }
  };
  panel(d.before, top, false);
  panel(d.after, top + panelH + gap, true);
}

function diagram(ctx: CanvasRenderingContext2D, p: Palette, parts: DrawParts, x: number, top: number, w: number, h: number, s: number) {
  ctx.fillStyle = BRAND.white; roundRect(ctx, x, top, w, h, 30 * s); ctx.fill();
  ctx.strokeStyle = p.line; ctx.lineWidth = 2 * s; roundRect(ctx, x, top, w, h, 30 * s); ctx.stroke();
  const img = parts.diagram, pad = 40 * s;
  if (!img || !img.naturalWidth) {
    ctx.fillStyle = rgba(BRAND.navy, 0.6); ctx.font = `600 ${30 * s}px ${parts.fonts.text}`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(parts.diagramNote ?? "Drawing the diagram…", x + w / 2, top + h / 2);
    return;
  }
  // Fit the whole diagram inside the card, never enlarging it past 3 times (a two-step chart should not shout).
  const k = Math.min((w - pad * 2) / img.naturalWidth, (h - pad * 2) / img.naturalHeight, 3 * s);
  const dw = img.naturalWidth * k, dh = img.naturalHeight * k;
  ctx.drawImage(img, x + (w - dw) / 2, top + (h - dh) / 2, dw, dh);
}

/** A small "3 / 7" in the top right of a carousel page. */
function pageMark(ctx: CanvasRenderingContext2D, p: Palette, fonts: PostFonts, W: number, pad: number, s: number, page: number, pages: number) {
  ctx.fillStyle = p.soft; ctx.font = `700 ${28 * s}px ${fonts.display}`; ctx.textAlign = "right"; ctx.textBaseline = "alphabetic";
  ctx.fillText(`${page + 1} / ${pages}`, W - pad, pad + 20 * s);
}

/** One page of a carousel: the cover (title and a swipe cue), a numbered slide (heading and text), or the closing line. */
function carouselPage(ctx: CanvasRenderingContext2D, d: PostImage, p: Palette, fonts: PostFonts, W: number, x: number, top: number, w: number, h: number, s: number, page: number) {
  const pages = pageCount(d), pad = x;
  if (page === 0) {
    // The cover: the title as large as fits, with a "Swipe" pill so it reads as a carousel in the feed.
    const f = fit(ctx, [d.title], (px) => `800 ${px}px ${fonts.display}`, w, h - 160 * s, 124 * s, 56 * s, 1.06);
    const y0 = top + Math.max(60 * s, (h - 160 * s - f.height) / 2);
    ctx.fillStyle = BRAND.coral; roundRect(ctx, x, y0 - 50 * s, 120 * s, 10 * s, 5 * s); ctx.fill();
    ctx.font = `800 ${f.size}px ${fonts.display}`;
    drawLines(ctx, f.lines[0], x, y0, f.size, f.lh, p.ink, d.power);
    ctx.font = `800 ${32 * s}px ${fonts.display}`; ctx.textBaseline = "middle"; ctx.textAlign = "left";
    const label = "Swipe  →", lw = ctx.measureText(label).width + 56 * s, py = top + h - 40 * s;
    ctx.fillStyle = BRAND.coral; roundRect(ctx, x + w - lw, py - 34 * s, lw, 68 * s, 34 * s); ctx.fill();
    ctx.fillStyle = BRAND.navy; ctx.fillText(label, x + w - lw + 28 * s, py + 2 * s);
    return;
  }
  pageMark(ctx, p, fonts, W, pad, s, page, pages);
  const slide = d.slides[page - 1];
  if (!slide) {
    // The closing page: the question or next step, large, so it is the last thing read.
    const f = fit(ctx, [d.cta], (px) => `800 ${px}px ${fonts.display}`, w, h - 120 * s, 96 * s, 48 * s, 1.1);
    const y0 = top + Math.max(80 * s, (h - f.height) / 2);
    ctx.font = `800 ${f.size}px ${fonts.display}`;
    drawLines(ctx, f.lines[0], x, y0, f.size, f.lh, p.ink);
    ctx.fillStyle = BRAND.coral; roundRect(ctx, x, y0 + f.height + 36 * s, 120 * s, 10 * s, 5 * s); ctx.fill();
    return;
  }
  // A numbered slide: the number in Coral, the heading large, then the text. The block sits a little above the middle of the page,
  // so a slide with one short line does not leave the bottom two-thirds empty.
  const numH = 150 * s, gap1 = 50 * s, gap2 = 44 * s, room = h - 40 * s;
  const head = fit(ctx, [slide.heading], (px) => `800 ${px}px ${fonts.display}`, w, room * 0.4, 96 * s, 44 * s, 1.08);
  const paras = slide.body ? slide.body.split("\n") : [];
  const body = paras.length ? fit(ctx, paras, (px) => `500 ${px}px ${fonts.text}`, w, room - numH - gap1 - head.height - gap2, 54 * s, 26 * s, 1.36, 18 * s) : null;
  const total = numH + gap1 + head.height + (body ? gap2 + body.height : 0);
  const y0 = top + Math.max(0, (room - total) * 0.42);
  ctx.fillStyle = BRAND.coral; ctx.font = `800 ${150 * s}px ${fonts.display}`; ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
  ctx.fillText(String(page).padStart(2, "0"), x - 6 * s, y0 + numH * 0.82);
  ctx.font = `800 ${head.size}px ${fonts.display}`;
  let y = drawLines(ctx, head.lines[0], x, y0 + numH + gap1, head.size, head.lh, p.ink);
  if (body) {
    ctx.font = `500 ${body.size}px ${fonts.text}`;
    y += gap2;
    for (const lines of body.lines) y = drawLines(ctx, lines, x, y, body.size, body.lh, p.soft) + 18 * s;
  }
}

/** The whole image (or, for a carousel, one page of it). A missing part (no title yet, the diagram still drawing) is simply left out. */
export function drawPostImage(ctx: CanvasRenderingContext2D, W: number, H: number, d: PostImage, parts: DrawParts, page = 0) {
  const s = W / 1080, p = PALETTE[d.theme], pad = 84 * s;
  ctx.save(); ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = p.bg; ctx.fillRect(0, 0, W, H);
  // The same soft Coral glow as the video covers, kept faint so text stays readable.
  const glow = ctx.createRadialGradient(W * 0.86, H * 0.08, 0, W * 0.86, H * 0.08, W * 0.9);
  glow.addColorStop(0, rgba(BRAND.coral, d.theme === "navy" ? 0.3 : 0.2)); glow.addColorStop(1, rgba(BRAND.coral, 0));
  ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H);

  const footer = d.footer && parts.footer.trim() ? parts.footer.trim() : "";
  let bottom = H - pad;
  if (footer) {
    const fy = H - pad * 0.8;
    ctx.fillStyle = BRAND.coral; roundRect(ctx, pad, fy - 28 * s, 34 * s, 34 * s, 9 * s); ctx.fill();
    ctx.fillStyle = p.soft; ctx.font = `700 ${30 * s}px ${parts.fonts.display}`; ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
    ctx.fillText(footer, pad + 50 * s, fy);
    bottom = fy - 28 * s - 44 * s;
  }
  const x = pad, w = W - pad * 2;
  if (d.kind === "carousel") carouselPage(ctx, d, p, parts.fonts, W, x, pad, w, bottom - pad, s, Math.min(Math.max(0, page), pageCount(d) - 1));
  else if (d.kind === "quote") quote(ctx, d, p, parts.fonts, x, pad, w, bottom - pad, s);
  else {
    const top = heading(ctx, d, p, parts.fonts, x, pad, w, s);
    if (d.kind === "steps") steps(ctx, d, p, parts.fonts, x, top, w, bottom - top, s);
    else if (d.kind === "compare") compare(ctx, d, p, parts.fonts, x, top, w, bottom - top, s);
    else diagram(ctx, p, parts, x, top, w, bottom - top, s);
  }
  ctx.restore();
}

/** The display and text fonts the CRM already loads (Bricolage Grotesque, Instrument Sans), ready for a canvas. */
export async function postFonts(): Promise<PostFonts> {
  const css = getComputedStyle(document.body);
  const display = css.getPropertyValue("--font-display").trim() || "sans-serif", text = css.getPropertyValue("--font-text").trim() || "sans-serif";
  try { await Promise.all([document.fonts.load(`800 80px ${display}`), document.fonts.load(`700 30px ${display}`), document.fonts.load(`600 40px ${text}`)]); } catch { /* draw with whatever is there */ }
  return { display: `${display}, sans-serif`, text: `${text}, sans-serif` };
}

// Mermaid draws the flowchart; this line dresses it in the brand colours. It is added here, at draw time, and never saved with the diagram
// (linkedinMath refuses a %% line in saved code). An SVG used as a picture cannot load web fonts, so the labels use the system's own.
const DIAGRAM_FONT = "Helvetica, Arial, sans-serif";
const DIAGRAM_INIT = `%%{init: ${JSON.stringify({
  theme: "base", fontFamily: DIAGRAM_FONT,
  themeVariables: {
    primaryColor: BRAND.cream, primaryTextColor: BRAND.navy, primaryBorderColor: BRAND.navy, lineColor: BRAND.coral,
    secondaryColor: BRAND.white, tertiaryColor: BRAND.white, edgeLabelBackground: BRAND.white, fontFamily: DIAGRAM_FONT, fontSize: "20px",
  },
  flowchart: { nodeSpacing: 46, rankSpacing: 58, padding: 18 },
})}}%%`;

const diagrams = new Map<string, Promise<HTMLImageElement>>();
/** A flowchart as a picture that can be drawn on a canvas. Rejects with Mermaid's own message when the code does not parse. */
export function diagramImage(code: string): Promise<HTMLImageElement> {
  const key = code.trim();
  let p = diagrams.get(key);
  if (!p) {
    p = (async () => {
      const svg = await standaloneSvg({ code: `${DIAGRAM_INIT}\n${key}`, theme: "default", title: "", background: "transparent" });
      // Belt and braces: the labels use the font Mermaid measured them in, whatever the page's own styles say.
      const text = svg.text.replace(/<\/svg>\s*$/, `<style>text, tspan { font-family: ${DIAGRAM_FONT} !important; }</style></svg>`);
      const img = new Image();
      await new Promise<void>((resolve, reject) => { img.onload = () => resolve(); img.onerror = () => reject(new Error("The diagram could not be prepared")); img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(text)}`; });
      return img;
    })();
    diagrams.set(key, p);
    p.catch(() => diagrams.delete(key));
    if (diagrams.size > 40) diagrams.delete(diagrams.keys().next().value as string);
  }
  return p;
}

/**
 * A carousel as one PDF, each page drawn by the same code as the preview, which LinkedIn takes as a document post.
 * Pages are 4:5 or square at 1080 pixels across, placed on PDF pages of the same shape.
 */
export async function downloadCarouselPdf(d: PostImage, footer: string, fileName: string) {
  saveBlob(await carouselPdfBlob(d, footer), fileName);
}

/** The carousel as a PDF file in memory, page by page from the same drawing code (used by the download and by click-to-post). */
export async function carouselPdfBlob(d: PostImage, footer: string): Promise<Blob> {
  const { w, h } = imageSize(d.size);
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser cannot draw the slides");
  const [{ PDFDocument }, fonts] = await Promise.all([import("pdf-lib"), postFonts()]);
  const pdf = await PDFDocument.create();
  pdf.setTitle(d.title || "Carousel");
  const pw = 540, ph = (540 * h) / w;
  for (let i = 0; i < pageCount(d); i++) {
    drawPostImage(ctx, w, h, d, { fonts, diagram: null, footer }, i);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) throw new Error("This browser could not draw a slide");
    const png = await pdf.embedPng(new Uint8Array(await blob.arrayBuffer()));
    pdf.addPage([pw, ph]).drawImage(png, { x: 0, y: 0, width: pw, height: ph });
  }
  return new Blob([(await pdf.save()) as BlobPart], { type: "application/pdf" });
}

function saveBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob), a = document.createElement("a");
  a.href = url; a.download = fileName;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** What goes on LinkedIn for an image: a carousel as a PDF, anything else as a PNG. */
export const blobForLinkedIn = (d: PostImage, footer: string): Promise<Blob> => (d.kind === "carousel" ? carouselPdfBlob(d, footer) : postImageBlob(d, footer));

/** Downloads an image the way LinkedIn takes it: a carousel as a PDF, anything else as a PNG. */
export const downloadForLinkedIn = (d: PostImage, footer: string, fileName: string) =>
  d.kind === "carousel" ? downloadCarouselPdf(d, footer, fileName) : downloadPostImage(d, footer, fileName);

/** The full-size PNG of an image, drawn by the same code as the preview. Throws if the diagram cannot be drawn. */
export async function downloadPostImage(d: PostImage, footer: string, fileName: string) {
  saveBlob(await postImageBlob(d, footer), fileName);
}

/** The full-size PNG in memory. Throws if the diagram cannot be drawn. */
export async function postImageBlob(d: PostImage, footer: string): Promise<Blob> {
  const { w, h } = imageSize(d.size);
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser cannot draw the image");
  const [fonts, diagram] = await Promise.all([postFonts(), d.kind === "diagram" ? diagramImage(d.code) : Promise.resolve(null)]);
  drawPostImage(ctx, w, h, d, { fonts, diagram, footer });
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("This browser could not make the PNG");
  return blob;
}
