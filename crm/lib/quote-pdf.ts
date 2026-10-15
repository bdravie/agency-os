import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";
import { TERMS, gbp, totals, type LineItem } from "./quote";

// Standard PDF fonts only cover Latin-1, so swap typographic characters for plain ones.
const clean = (s: string) =>
  s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, "-").replace(/…/g, "...")
    .replace(/[^\x20-\x7E\xA3\n]/g, "");

type Q = {
  id: number; company: string; title: string; items: LineItem[]; discount: number; scope: string | null; timeline: string | null;
  validUntil: string | null; brand: string; sender: string | null; deposit_link: string | null; subscription_link: string | null; created: string;
};

export async function quotePdf(q: Q): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const accent = rgb(0.18, 0.36, 0.92), grey = rgb(0.4, 0.42, 0.47), W = 595, H = 842, M = 50;
  let page = doc.addPage([W, H]);
  let y = H - M;

  const ensure = (need: number) => { if (y - need < M) { page = doc.addPage([W, H]); y = H - M; } };
  const wrap = (text: string, f: PDFFont, size: number, width: number) => {
    const lines: string[] = [];
    for (const para of clean(text).split("\n")) {
      let line = "";
      for (const word of para.split(/\s+/)) {
        const next = line ? `${line} ${word}` : word;
        if (f.widthOfTextAtSize(next, size) > width && line) { lines.push(line); line = word; } else line = next;
      }
      lines.push(line);
    }
    return lines;
  };
  const text = (s: string, o: { x?: number; size?: number; f?: PDFFont; color?: ReturnType<typeof rgb>; width?: number; gap?: number } = {}) => {
    const size = o.size ?? 10, f = o.f ?? font;
    for (const line of wrap(s, f, size, o.width ?? W - 2 * M)) {
      ensure(size + 4);
      page.drawText(line, { x: o.x ?? M, y: y - size, size, font: f, color: o.color ?? rgb(0.07, 0.09, 0.15) });
      y -= size + 4;
    }
    y -= o.gap ?? 0;
  };
  // Right-aligned text on the same line as text that started at `top`.
  const right = (s: string, top: number, size = 10, f = font) => {
    page.drawText(clean(s), { x: W - M - f.widthOfTextAtSize(clean(s), size), y: top - size, size, font: f });
  };

  page.drawRectangle({ x: 0, y: H - 90, width: W, height: 90, color: accent });
  page.drawText(clean(q.brand), { x: M, y: H - 38, size: 12, font, color: rgb(1, 1, 1) });
  page.drawText(clean(`Quote #${q.id}`), { x: M, y: H - 66, size: 22, font: bold, color: rgb(1, 1, 1) });
  y = H - 120;

  text(`Prepared for ${q.company}`, { size: 13, f: bold });
  text(`${q.title} | ${q.created}${q.validUntil ? ` | valid until ${q.validUntil}` : ""}`, { color: grey, gap: 12 });

  if (q.scope) { text("Scope", { f: bold, size: 12, color: accent }); text(q.scope, { gap: 10 }); }
  if (q.timeline) { text("Timeline", { f: bold, size: 12, color: accent }); text(q.timeline, { gap: 10 }); }

  text("What's included", { f: bold, size: 12, color: accent });
  for (const it of q.items) {
    ensure(40);
    const top = y;
    text(it.name, { f: bold, width: 300 });
    right(`Setup ${gbp(it.setup_gbp)}  |  Monthly ${gbp(it.monthly_gbp)}`, top, 9);
    if (it.outcome) text(it.outcome, { color: grey, size: 9 });
    y -= 6;
  }

  const t = totals(q.items, q.discount);
  ensure(110);
  page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.5, color: grey });
  y -= 16;
  const row = (label: string, value: string, b = false) => { const top = y; text(label, { f: b ? bold : font }); right(value, top, 10, b ? bold : font); };
  if (q.discount > 0) { row("Setup before discount", gbp(t.setupBefore)); row("Discount", `-${gbp(q.discount)}`); }
  row("Setup fee", gbp(t.setup), true);
  row("  due upfront (50%)", gbp(t.deposit));
  row("  due on go-live (50%)", gbp(t.balance));
  row("Monthly fee", `${gbp(t.monthly)} / month`, true);
  y -= 8;

  if (q.deposit_link || q.subscription_link) {
    text("Pay securely by card", { f: bold, size: 12, color: accent });
    if (q.deposit_link) text(`Upfront payment (${gbp(t.deposit)}): ${q.deposit_link}`, { size: 9 });
    if (q.subscription_link) text(`Monthly subscription (${gbp(t.monthly)}/month): ${q.subscription_link}`, { size: 9 });
    y -= 6;
  }

  text("Terms", { f: bold, size: 12, color: accent });
  for (const term of TERMS) text(`- ${term}`, { size: 9 });
  y -= 8;
  text(`Prepared by ${[q.sender, q.brand].filter(Boolean).join(", ")}.`, { color: grey, size: 9 });
  return doc.save();
}
