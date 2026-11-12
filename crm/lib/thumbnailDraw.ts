import { BRAND, isPower, wrapTitle, type Design, type Layout, type Sticker } from "./thumbnailDesign";

// Draws a cover onto a canvas. The card preview, the editor and the PNG download all call this one function, so what is
// on screen is what is downloaded. Sizes are worked out from the canvas, so the same design draws at any resolution.
// Browser only (it needs a 2D canvas); the rules about what may be drawn live in thumbnailDesign.ts.

export type CoverText = { headline: string; subhead: string | null };
export type CoverImages = { frame: CanvasImageSource | null; logos: Map<number, HTMLImageElement> };
export type Picked = { type: "sticker" | "logo"; index: number } | null;
export type DrawOptions = { font: string; selected?: Picked; safeZones?: boolean };

export const coverSize = (format: string) => (format === "9:16" ? { w: 1080, h: 1920 } : { w: 1280, h: 720 });
const rgba = (hex: string, a: number) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${a})`; };

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const q = Math.min(r, w / 2, h / 2);
  ctx.beginPath(); ctx.moveTo(x + q, y); ctx.arcTo(x + w, y, x + w, y + h, q); ctx.arcTo(x + w, y + h, x, y + h, q); ctx.arcTo(x, y + h, x, y, q); ctx.arcTo(x, y, x + w, y, q); ctx.closePath();
}

function drawCover(ctx: CanvasRenderingContext2D, img: CanvasImageSource, W: number, H: number) {
  const iw = (img as HTMLImageElement).naturalWidth || (img as HTMLCanvasElement).width, ih = (img as HTMLImageElement).naturalHeight || (img as HTMLCanvasElement).height;
  if (!iw || !ih) return;
  const k = Math.max(W / iw, H / ih), w = iw * k, h = ih * k;
  ctx.drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
}

function fade(ctx: CanvasRenderingContext2D, W: number, H: number, x0: number, y0: number, x1: number, y1: number, stops: [number, number][]) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  for (const [at, a] of stops) g.addColorStop(at, rgba(BRAND.navy, a));
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
}

// Where the title sits on each layout. x and y are fractions of the canvas; `y` is the top of the title block unless `anchor` says otherwise.
type Spot = { x: number; y: number; align: "left" | "center"; anchor: "top" | "middle" | "bottom"; chars: number; size: number; width: number };
function titleSpot(layout: Layout, tall: boolean): Spot {
  if (tall) {
    switch (layout) {
      case "face": return { x: 0.07, y: 0.2, align: "left", anchor: "top", chars: 9, size: 112, width: 0.8 };
      case "split": return { x: 0.5, y: 0.5, align: "center", anchor: "middle", chars: 12, size: 84, width: 0.86 };
      case "banner": return { x: 0.5, y: 0.25, align: "center", anchor: "middle", chars: 12, size: 80, width: 0.86 };
      case "title": return { x: 0.5, y: 0.44, align: "center", anchor: "middle", chars: 8, size: 128, width: 0.86 };
      default: return { x: 0.07, y: 0.69, align: "left", anchor: "bottom", chars: 10, size: 96, width: 0.8 };
    }
  }
  switch (layout) {
    case "face": return { x: 0.055, y: 0.5, align: "left", anchor: "middle", chars: 9, size: 122, width: 0.52 };
    case "split": return { x: 0.5, y: 0.855, align: "center", anchor: "middle", chars: 22, size: 84, width: 0.9 };
    case "banner": return { x: 0.5, y: 0.16, align: "center", anchor: "middle", chars: 22, size: 84, width: 0.9 };
    case "title": return { x: 0.5, y: 0.5, align: "center", anchor: "middle", chars: 11, size: 150, width: 0.88 };
    default: return { x: 0.055, y: 0.9, align: "left", anchor: "bottom", chars: 14, size: 100, width: 0.7 };
  }
}

function background(ctx: CanvasRenderingContext2D, W: number, H: number, layout: Layout, frame: CanvasImageSource | null, s: number) {
  const tall = H > W;
  ctx.fillStyle = BRAND.navy; ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W * 0.72, H * 0.3, 0, W * 0.72, H * 0.3, Math.max(W, H) * 0.7);
  glow.addColorStop(0, rgba(BRAND.coral, 0.42)); glow.addColorStop(1, rgba(BRAND.coral, 0));
  ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H);
  if (layout === "title") return;                                        // title only: no frame, just Navy and the glow
  if (frame) drawCover(ctx, frame, W, H);
  else if (layout === "side" || layout === "face") return;               // nothing to fade over

  if (layout === "side") fade(ctx, W, H, 0, H * (tall ? 0.25 : 0.15), 0, H * (tall ? 0.78 : 1), [[0, 0.05], [0.6, 0.72], [1, 0.96]]);
  else if (layout === "face") { if (tall) fade(ctx, W, H, 0, 0, 0, H * 0.62, [[0, 0.9], [0.55, 0.7], [1, 0]]); else fade(ctx, W, H, 0, 0, W * 0.68, 0, [[0, 0.95], [0.55, 0.78], [1, 0]]); }
  else if (layout === "split") {
    // "Before" half is dulled, "after" half is left bright; a Cream divider and two small labels.
    ctx.fillStyle = rgba(BRAND.navy, 0.58);
    if (tall) ctx.fillRect(0, 0, W, H / 2); else ctx.fillRect(0, 0, W / 2, H);
    ctx.fillStyle = BRAND.cream;
    if (tall) ctx.fillRect(0, H / 2 - 4 * s, W, 8 * s); else ctx.fillRect(W / 2 - 4 * s, 0, 8 * s, H);
    const label = (text: string, cx: number, cy: number, fill: string, ink: string) => {
      ctx.font = `800 ${26 * s}px ${fontOf(ctx)}`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      const w = ctx.measureText(text).width + 36 * s;
      ctx.fillStyle = fill; roundRect(ctx, cx - w / 2, cy - 24 * s, w, 48 * s, 24 * s); ctx.fill();
      ctx.fillStyle = ink; ctx.fillText(text, cx, cy + 1 * s);
    };
    if (tall) { label("BEFORE", W / 2, H * 0.2, BRAND.cream, BRAND.navy); label("AFTER", W / 2, H * 0.66, BRAND.coral, BRAND.navy); }
    else { label("BEFORE", W * 0.25, H * 0.1, BRAND.cream, BRAND.navy); label("AFTER", W * 0.75, H * 0.1, BRAND.coral, BRAND.navy); }
    ctx.fillStyle = rgba(BRAND.navy, 0.94);
    if (tall) ctx.fillRect(0, H * 0.39, W, H * 0.22); else ctx.fillRect(0, H * 0.72, W, H * 0.28);
  } else if (layout === "banner") {
    ctx.fillStyle = rgba(BRAND.navy, 0.16); ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = rgba(BRAND.navy, 0.95);
    if (tall) ctx.fillRect(0, H * 0.16, W, H * 0.18); else ctx.fillRect(0, 0, W, H * 0.32);
    ctx.fillStyle = BRAND.coral;
    if (tall) ctx.fillRect(0, H * 0.34, W, 8 * s); else ctx.fillRect(0, H * 0.32, W, 8 * s);
  }
}

// The font family is carried on the context between helpers.
const FONTS = new WeakMap<CanvasRenderingContext2D, string>();
const fontOf = (ctx: CanvasRenderingContext2D) => FONTS.get(ctx) ?? "sans-serif";

function title(ctx: CanvasRenderingContext2D, W: number, H: number, text: CoverText, d: Design, s: number) {
  const tall = H > W, spot = titleSpot(d.layout, tall), family = fontOf(ctx);
  const lines = wrapTitle(text.headline.toUpperCase(), spot.chars);
  if (!lines.length) return;
  const maxW = W * spot.width;
  let size = spot.size * s;
  const set = (px: number) => { ctx.font = `800 ${px}px ${family}`; };
  set(size);
  const widest = Math.max(...lines.map((l) => ctx.measureText(l).width));
  if (widest > maxW) size *= maxW / widest;
  if (lines.length > 3) size *= 3 / lines.length;
  set(size);
  const lh = size * (d.style === "block" ? 1.22 : 1.04);
  const sub = (text.subhead ?? "").trim().toUpperCase();
  const subSize = Math.max(30 * s, size * 0.27), subGap = sub ? subSize * 1.5 : 0;
  const blockH = lines.length * lh + subGap;
  const top = spot.anchor === "top" ? H * spot.y : spot.anchor === "bottom" ? H * spot.y - blockH : H * spot.y - blockH / 2;
  const x0 = W * spot.x;

  ctx.save();
  if (d.tilt) { const cx = spot.align === "center" ? x0 : x0 + maxW / 2, cy = top + blockH / 2; ctx.translate(cx, cy); ctx.rotate((-3.5 * Math.PI) / 180); ctx.translate(-cx, -cy); }
  ctx.textBaseline = "alphabetic"; ctx.textAlign = "left"; ctx.lineJoin = "round";

  if (sub) {
    ctx.font = `800 ${subSize}px ${family}`;
    const w = ctx.measureText(sub).width, sx = spot.align === "center" ? x0 - w / 2 : x0;
    ctx.shadowColor = "rgba(0,0,0,0.6)"; ctx.shadowBlur = 10 * s;
    ctx.fillStyle = BRAND.coral; ctx.fillText(sub, sx, top + subSize);
    ctx.shadowBlur = 0; ctx.shadowColor = "transparent";
  }

  set(size);
  const space = ctx.measureText(" ").width;
  lines.forEach((line, i) => {
    const words = line.split(" "), widths = words.map((w) => ctx.measureText(w).width);
    const lineW = widths.reduce((a, b) => a + b, 0) + space * (words.length - 1);
    const lx = spot.align === "center" ? x0 - lineW / 2 : x0;
    const base = top + subGap + i * lh + size * 0.82;
    if (d.style === "block") { ctx.fillStyle = BRAND.cream; roundRect(ctx, lx - size * 0.16, base - size * 0.86, lineW + size * 0.32, size * 1.1, size * 0.12); ctx.fill(); }
    let x = lx;
    words.forEach((w, j) => {
      const hot = isPower(w, d.power);
      if (d.style === "block") {
        if (hot) { ctx.fillStyle = BRAND.coral; roundRect(ctx, x - size * 0.1, base - size * 0.86, widths[j] + size * 0.2, size * 1.1, size * 0.12); ctx.fill(); }
        ctx.fillStyle = BRAND.navy; ctx.fillText(w, x, base);
      } else {
        if (hot) { ctx.fillStyle = BRAND.coral; ctx.save(); ctx.translate(x, base + size * 0.1); ctx.rotate(-0.012); ctx.fillRect(-size * 0.04, 0, widths[j] + size * 0.08, size * 0.1); ctx.restore(); }
        if (d.style === "outline") { ctx.strokeStyle = BRAND.navy; ctx.lineWidth = size * 0.17; ctx.strokeText(w, x, base); }
        else { ctx.shadowColor = "rgba(0,0,0,0.75)"; ctx.shadowBlur = 18 * s; ctx.shadowOffsetY = 3 * s; }
        ctx.fillStyle = hot ? BRAND.coral : BRAND.white; ctx.fillText(w, x, base);
        ctx.shadowBlur = 0; ctx.shadowOffsetY = 0; ctx.shadowColor = "transparent";
      }
      x += widths[j] + space;
    });
  });
  ctx.restore();
}

/** One sticker, drawn around (0,0) in a box of roughly 160 units, then placed, turned and sized by the caller. */
function stickerShape(ctx: CanvasRenderingContext2D, st: Sticker) {
  const fill = BRAND[st.colour], ink = st.colour === "navy" ? BRAND.cream : BRAND.navy, family = fontOf(ctx);
  const edge = st.colour === "cream" ? BRAND.navy : BRAND.cream;
  ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  const twice = (draw: () => void, width: number) => { ctx.strokeStyle = edge; ctx.lineWidth = width + 10; draw(); ctx.strokeStyle = fill; ctx.lineWidth = width; draw(); };
  switch (st.kind) {
    case "arrow": {
      twice(() => { ctx.beginPath(); ctx.moveTo(-70, 34); ctx.quadraticCurveTo(-8, -62, 52, 6); ctx.stroke(); ctx.beginPath(); ctx.moveTo(18, 2); ctx.lineTo(56, 10); ctx.lineTo(58, -30); ctx.stroke(); }, 16);
      break;
    }
    case "circle": twice(() => { ctx.beginPath(); ctx.ellipse(0, 0, 78, 54, -0.08, 0.35, Math.PI * 2 + 0.75); ctx.stroke(); }, 11); break;
    case "tape": ctx.save(); ctx.rotate(-0.03); ctx.fillStyle = fill; ctx.fillRect(-92, -11, 184, 22); ctx.restore(); break;
    case "pill": {
      ctx.font = `800 46px ${family}`;
      const w = Math.max(96, ctx.measureText(st.text ?? "").width + 56);
      ctx.fillStyle = edge; roundRect(ctx, -w / 2 - 5, -39, w + 10, 78, 39); ctx.fill();
      ctx.fillStyle = fill; roundRect(ctx, -w / 2, -34, w, 68, 34); ctx.fill();
      ctx.fillStyle = ink; ctx.fillText(st.text ?? "", 0, 3);
      break;
    }
    case "burst": {
      const star = (r1: number, r2: number) => { ctx.beginPath(); for (let i = 0; i < 28; i++) { const a = (i / 28) * Math.PI * 2, r = i % 2 ? r2 : r1; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); } ctx.closePath(); };
      ctx.fillStyle = edge; star(88, 72); ctx.fill();
      ctx.fillStyle = fill; star(82, 66); ctx.fill();
      let px = 40; ctx.font = `800 ${px}px ${family}`;
      const w = ctx.measureText(st.text ?? "").width; if (w > 112) { px *= 112 / w; ctx.font = `800 ${px}px ${family}`; }
      ctx.save(); ctx.rotate(-0.1); ctx.fillStyle = ink; ctx.fillText(st.text ?? "", 0, 2); ctx.restore();
      break;
    }
    case "number": {
      ctx.fillStyle = edge; ctx.beginPath(); ctx.arc(0, 0, 66, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = fill; ctx.beginPath(); ctx.arc(0, 0, 58, 0, Math.PI * 2); ctx.fill();
      let px = 76; ctx.font = `800 ${px}px ${family}`;
      const w = ctx.measureText(st.text ?? "").width; if (w > 86) { px *= 86 / w; ctx.font = `800 ${px}px ${family}`; }
      ctx.fillStyle = ink; ctx.fillText(st.text ?? "", 0, 4);
      break;
    }
    case "emoji": ctx.font = `120px ${family}, "Apple Color Emoji", "Segoe UI Emoji", sans-serif`; ctx.fillStyle = BRAND.white; ctx.fillText(st.text ?? "", 0, 8); break;
    case "tick": case "cross": {
      ctx.fillStyle = edge; ctx.beginPath(); ctx.arc(0, 0, 62, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = fill; ctx.beginPath(); ctx.arc(0, 0, 54, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = ink; ctx.lineWidth = 13; ctx.beginPath();
      if (st.kind === "tick") { ctx.moveTo(-24, 2); ctx.lineTo(-6, 20); ctx.lineTo(26, -18); }
      else { ctx.moveTo(-20, -20); ctx.lineTo(20, 20); ctx.moveTo(20, -20); ctx.lineTo(-20, 20); }
      ctx.stroke();
      break;
    }
  }
}

/** How far from its centre an element can be picked up, in canvas pixels. */
const reach = (scale: number, s: number) => 86 * scale * s;

/** The whole cover. `text` is drawn in capitals; a missing frame or logo is simply left out. */
export function drawThumbnail(ctx: CanvasRenderingContext2D, W: number, H: number, text: CoverText, d: Design, images: CoverImages, o: DrawOptions) {
  const s = Math.min(W, H) / 720;
  FONTS.set(ctx, o.font || "sans-serif");
  ctx.save(); ctx.clearRect(0, 0, W, H);
  background(ctx, W, H, d.layout, images.frame, s);
  title(ctx, W, H, text, d, s);
  d.logos.forEach((l) => {
    const img = images.logos.get(l.asset);
    if (!img || !img.naturalWidth) return;
    const h = 96 * s * l.scale, w = h * (img.naturalWidth / img.naturalHeight), pad = 16 * s * l.scale;
    ctx.save(); ctx.translate(l.x * W, l.y * H); ctx.rotate((l.rot * Math.PI) / 180);
    ctx.shadowColor = "rgba(0,0,0,0.35)"; ctx.shadowBlur = 16 * s; ctx.shadowOffsetY = 4 * s;
    ctx.fillStyle = BRAND.white; roundRect(ctx, -w / 2 - pad, -h / 2 - pad, w + pad * 2, h + pad * 2, 22 * s * l.scale); ctx.fill();
    ctx.shadowBlur = 0; ctx.shadowOffsetY = 0; ctx.shadowColor = "transparent";
    ctx.drawImage(img, -w / 2, -h / 2, w, h);
    ctx.restore();
  });
  d.stickers.forEach((st) => {
    ctx.save(); ctx.translate(st.x * W, st.y * H); ctx.rotate((st.rot * Math.PI) / 180); ctx.scale(st.scale * s, st.scale * s);
    ctx.shadowColor = "rgba(0,0,0,0.35)"; ctx.shadowBlur = 12; ctx.shadowOffsetY = 3;
    stickerShape(ctx, st);
    ctx.restore();
  });
  if (o.safeZones && H > W) {
    ctx.fillStyle = rgba(BRAND.coral, 0.28); ctx.fillRect(0, 0, W, H * 0.15); ctx.fillRect(0, H * 0.72, W, H * 0.28);
    ctx.fillStyle = BRAND.white; ctx.font = `600 ${22 * s}px ${fontOf(ctx)}`; ctx.textAlign = "left"; ctx.textBaseline = "top";
    ctx.fillText("Hidden by the app header", 16 * s, 12 * s); ctx.fillText("Hidden by captions and buttons", 16 * s, H * 0.72 + 12 * s);
  }
  const sel = o.selected ? (o.selected.type === "sticker" ? d.stickers[o.selected.index] : d.logos[o.selected.index]) : null;
  if (sel) {
    ctx.setLineDash([10 * s, 8 * s]); ctx.lineWidth = 3 * s; ctx.strokeStyle = BRAND.white;
    ctx.beginPath(); ctx.arc(sel.x * W, sel.y * H, reach(sel.scale, s) + 8 * s, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
  }
  ctx.restore();
}

/** The topmost sticker or logo under a point (canvas pixels), or null. Stickers sit above logos. */
export function pick(d: Design, px: number, py: number, W: number, H: number): Picked {
  const s = Math.min(W, H) / 720;
  const near = (e: { x: number; y: number; scale: number }) => Math.hypot(px - e.x * W, py - e.y * H) <= reach(e.scale, s);
  for (let i = d.stickers.length - 1; i >= 0; i--) if (near(d.stickers[i])) return { type: "sticker", index: i };
  for (let i = d.logos.length - 1; i >= 0; i--) if (near(d.logos[i])) return { type: "logo", index: i };
  return null;
}

const cache = new Map<string, Promise<HTMLImageElement | null>>();
/** A same-origin image, loaded once. A missing or broken one gives null, never an error. */
export function loadImage(src: string): Promise<HTMLImageElement | null> {
  let p = cache.get(src);
  if (!p) {
    p = new Promise((resolve) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = () => { cache.delete(src); resolve(null); }; img.src = src; });
    cache.set(src, p);
  }
  return p;
}

export const assetUrl = (id: number) => `/api/thumbnail-assets/${id}`;

/** Everything a design needs loaded before it can be drawn: the frame and each logo it uses. */
export async function loadCoverImages(frameUrl: string | null, d: Design): Promise<CoverImages> {
  const [frame, ...logos] = await Promise.all([frameUrl ? loadImage(frameUrl) : Promise.resolve(null), ...d.logos.map((l) => loadImage(assetUrl(l.asset)))]);
  const map = new Map<number, HTMLImageElement>();
  d.logos.forEach((l, i) => { const img = logos[i]; if (img) map.set(l.asset, img); });
  return { frame, logos: map };
}

/** The display font the CRM already loads (Bricolage Grotesque), ready for a canvas. */
export async function coverFont(): Promise<string> {
  const family = getComputedStyle(document.body).getPropertyValue("--font-display").trim() || "sans-serif";
  try { await document.fonts.load(`800 80px ${family}`); } catch { /* draw with whatever is there */ }
  return `${family}, sans-serif`;
}
