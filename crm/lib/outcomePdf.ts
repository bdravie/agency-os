import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { FLAT_PCT, fmtValue, type Better, type Verdict } from "./outcomeMath";

// One page: before vs now, wins, next improvement. All numbers arrive already calculated; this file only lays them out.
export type ReportRow = { name: string; unit: string; better: Better; baseline: number; now: number | null; moved: string | null; verdict: Verdict | null };
export type ReportDoc = {
  brand: string; sender: string | null; client: string; monthLabel: string; kickoffText: string; built: string | null;
  rows: ReportRow[]; wins: string[]; nextImprovement: string;
};

// The standard PDF fonts only cover Latin-1, so swap typographic characters for plain ones.
const clean = (s: string) =>
  s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, "-").replace(/…/g, "...").replace(/•/g, "-").replace(/[^\x20-\x7E\xA3\n]/g, "");

const W = 595, H = 842, M = 46, BOTTOM = 62;
const ACCENT = rgb(0.18, 0.36, 0.92), INK = rgb(0.07, 0.09, 0.15), GREY = rgb(0.4, 0.42, 0.47), SOFT = rgb(0.95, 0.96, 0.99), LINE = rgb(0.86, 0.88, 0.92);
const GOOD = rgb(0.09, 0.5, 0.3), BAD = rgb(0.74, 0.18, 0.18), FLAT = rgb(0.45, 0.47, 0.52), BAR_BEFORE = rgb(0.72, 0.75, 0.8);
const WORD: Record<Verdict, { text: string; color: ReturnType<typeof rgb> }> = { better: { text: "Better", color: GOOD }, flat: { text: "About the same", color: FLAT }, worse: { text: "Worse", color: BAD } };

export async function reportPdf(d: ReportDoc): Promise<{ bytes: Uint8Array; fontSize: number; overflow: boolean }> {
  const sizes = [10.5, 10, 9.5, 9, 8.5, 8];
  for (const fs of sizes) {
    if (!(await draw(d, fs, true)).overflow) return { bytes: (await draw(d, fs, false)).bytes!, fontSize: fs, overflow: false };
  }
  return { bytes: (await draw(d, sizes[sizes.length - 1], false)).bytes!, fontSize: sizes[sizes.length - 1], overflow: true };
}

async function draw(d: ReportDoc, fs: number, dry: boolean): Promise<{ overflow: boolean; bytes?: Uint8Array }> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica), bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const page: PDFPage = doc.addPage([W, H]);
  let y = H - M, overflow = false;

  const wrap = (text: string, f: PDFFont, size: number, width: number) => {
    const lines: string[] = [];
    for (const para of clean(text).split("\n")) {
      let line = "";
      for (const word of para.split(/\s+/).filter(Boolean)) {
        const next = line ? `${line} ${word}` : word;
        if (f.widthOfTextAtSize(next, size) > width && line) { lines.push(line); line = word; } else line = next;
      }
      lines.push(line);
    }
    return lines;
  };
  const text = (s: string, o: { x?: number; size?: number; f?: PDFFont; color?: ReturnType<typeof rgb>; width?: number; gap?: number } = {}) => {
    const size = o.size ?? fs, f = o.f ?? font, lead = size * 1.35;
    for (const line of wrap(s, f, size, o.width ?? W - 2 * M)) {
      if (y - lead < BOTTOM) overflow = true;
      if (!dry) page.drawText(line, { x: o.x ?? M, y: y - size, size, font: f, color: o.color ?? INK });
      y -= lead;
    }
    y -= o.gap ?? 0;
  };
  const heading = (s: string) => { y -= fs * 0.6; text(s, { f: bold, size: fs + 2.5, color: ACCENT, gap: 3 }); };

  // banner
  if (!dry) {
    page.drawRectangle({ x: 0, y: H - 78, width: W, height: 78, color: ACCENT });
    page.drawText(clean(d.brand), { x: M, y: H - 28, size: 10, font, color: rgb(1, 1, 1) });
    page.drawText("Monthly results report", { x: M, y: H - 56, size: 21, font: bold, color: rgb(1, 1, 1) });
    const sub = clean(`${d.client} | ${d.monthLabel}`);
    page.drawText(sub, { x: W - M - font.widthOfTextAtSize(sub, 9), y: H - 56, size: 9, font, color: rgb(1, 1, 1) });
  }
  y = H - 78 - 18;
  text(`Working together since ${d.kickoffText}. The figures below are your own records, compared with the numbers we agreed at the start.`, { color: GREY, gap: 2 });
  if (d.built) { text(`What we set up: ${d.built}`, { gap: 2 }); }

  // before vs now
  heading("Before and now");
  const X = { name: M, before: 258, now: 326, change: 412, bars: 490 }, BAR_W = W - M - X.bars;
  if (!dry) for (const [label, x] of [["Measure", X.name], ["Before", X.before], ["Now", X.now], ["Change", X.change]] as const) page.drawText(label, { x, y: y - 9, size: 8, font: bold, color: GREY });
  y -= 15;
  for (const r of d.rows) {
    const rowH = 32;
    if (y - rowH < BOTTOM) overflow = true;
    if (!dry) {
      page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.6, color: LINE });
      const nameLines = wrap(r.name, bold, fs, X.before - X.name - 10).slice(0, 2);
      nameLines.forEach((l, i) => page.drawText(l, { x: X.name, y: y - 14 - i * (fs + 1.5), size: fs, font: bold, color: INK }));
      page.drawText(clean(fmtValue(r.baseline, r.unit)), { x: X.before, y: y - 14, size: fs, font, color: INK });
      page.drawText(r.now === null ? "-" : clean(fmtValue(r.now, r.unit)), { x: X.now, y: y - 14, size: fs, font: bold, color: INK });
      if (r.verdict) {
        const w = WORD[r.verdict];
        page.drawText(clean(r.moved ?? ""), { x: X.change, y: y - 12, size: fs, font: bold, color: w.color });
        page.drawText(w.text, { x: X.change, y: y - 12 - (fs + 1), size: fs - 1.5, font, color: w.color });
      }
      if (r.now !== null) {
        const top = Math.max(r.baseline, r.now, 0.0001);
        page.drawRectangle({ x: X.bars, y: y - 15, width: Math.max(1.5, (r.baseline / top) * BAR_W), height: 5, color: BAR_BEFORE });
        page.drawRectangle({ x: X.bars, y: y - 24, width: Math.max(1.5, (r.now / top) * BAR_W), height: 5, color: r.verdict ? WORD[r.verdict].color : ACCENT });
      }
    }
    y -= rowH;
  }
  if (!dry) page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.6, color: LINE });
  y -= 4;
  if (d.rows.length) text(`Grey bar: before. Coloured bar: now (green = ${FLAT_PCT}% or more better, red = ${FLAT_PCT}% or more worse, grey = about the same).`, { size: fs - 1.5, color: GREY });

  heading("Wins this month");
  for (const w of d.wins) text(`-  ${w}`, { x: M + 6, width: W - 2 * M - 6, gap: 2 });

  heading("Next improvement");
  const lines = wrap(d.nextImprovement, font, fs, W - 2 * M - 24), boxH = lines.length * fs * 1.35 + 18;
  if (y - boxH < BOTTOM) overflow = true;
  if (!dry) page.drawRectangle({ x: M, y: y - boxH, width: W - 2 * M, height: boxH, color: SOFT, borderColor: LINE, borderWidth: 0.6 });
  y -= 9;
  text(d.nextImprovement, { x: M + 12, width: W - 2 * M - 24 });
  y -= 9;

  if (!dry) page.drawText(clean([d.sender, d.brand].filter(Boolean).join(" | ")), { x: M, y: 34, size: 8.5, font, color: GREY });
  return { overflow, bytes: dry ? undefined : await doc.save() };
}
