import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

// A two-page audit report. All numbers arrive already calculated; this file only lays them out.
export type AuditDoc = {
  brand: string; sender: string | null; client: string; date: string;
  summary: string;
  top: { rank: number; task: string; by: string | null; hoursWeek: number; hoursSavedWeek: number; annualGbp: number; frequency: string; errorRate: number; why: string; approach: string; flags: string[] }[];
  totals: { hoursWeek: number; annualGbp: number; taskHoursWeek: number };
  assumptions: string;
  held: { task: string; reason: string }[];
  build: { name: string; description: string; scope: string[]; timelineWeeks: number; investment: string | null; credit: string | null };
  training: string[]; risks: { risk: string; mitigation: string }[]; nextSteps: string[];
};

// The standard PDF fonts only cover Latin-1, so swap typographic characters for plain ones.
const clean = (s: string) =>
  s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, "-").replace(/…/g, "...").replace(/•/g, "-")
    .replace(/[^\x20-\x7E\xA3\n]/g, "");

const W = 595, H = 842, M = 46, BOTTOM = 54;
const ACCENT = rgb(0.18, 0.36, 0.92), INK = rgb(0.07, 0.09, 0.15), GREY = rgb(0.4, 0.42, 0.47), SOFT = rgb(0.95, 0.96, 0.99);

export async function auditPdf(d: AuditDoc): Promise<{ bytes: Uint8Array; pages: number; fontSize: number; overflow: boolean }> {
  const sizes = [11, 10.5, 10, 9.5, 9, 8.5, 8, 7.5];
  for (const fs of sizes) {
    const probe = await draw(d, fs, true);
    if (!probe.overflow) { const real = await draw(d, fs, false); return { bytes: real.bytes!, pages: 2, fontSize: fs, overflow: false }; }
  }
  const last = await draw(d, sizes[sizes.length - 1], false);   // smallest size still overflows: draw anyway, flagged
  return { bytes: last.bytes!, pages: 2, fontSize: sizes[sizes.length - 1], overflow: true };
}

async function draw(d: AuditDoc, fs: number, dry: boolean): Promise<{ overflow: boolean; bytes?: Uint8Array }> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  let page: PDFPage = doc.addPage([W, H]);
  let y = H - M;
  let overflow = false;

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
  const need = (h: number) => { if (y - h < BOTTOM) overflow = true; };
  const text = (s: string, o: { x?: number; size?: number; f?: PDFFont; color?: ReturnType<typeof rgb>; width?: number; gap?: number } = {}) => {
    const size = o.size ?? fs, f = o.f ?? font, lead = size * 1.32;
    for (const line of wrap(s, f, size, o.width ?? W - 2 * M)) {
      need(lead);
      if (!dry && y - lead >= BOTTOM - 20) page.drawText(line, { x: o.x ?? M, y: y - size, size, font: f, color: o.color ?? INK });
      y -= lead;
    }
    y -= o.gap ?? 0;
  };
  const heading = (s: string) => { y -= fs * 0.5; text(s, { f: bold, size: fs + 2.5, color: ACCENT, gap: 2 }); };
  const bullets = (items: string[]) => items.forEach((i) => { text(`-  ${i}`, { x: M + 6, width: W - 2 * M - 6 }); });
  const newPage = () => { page = doc.addPage([W, H]); y = H - M; };
  const banner = (title: string, sub: string, tall: boolean) => {
    const h = tall ? 78 : 40;
    if (!dry) page.drawRectangle({ x: 0, y: H - h, width: W, height: h, color: ACCENT });
    if (!dry) {
      page.drawText(clean(d.brand), { x: M, y: H - (tall ? 28 : 16), size: 10, font, color: rgb(1, 1, 1) });
      page.drawText(clean(title), { x: M, y: H - (tall ? 56 : 31), size: tall ? 21 : 13, font: bold, color: rgb(1, 1, 1) });
      page.drawText(clean(sub), { x: W - M - font.widthOfTextAtSize(clean(sub), 9), y: H - (tall ? 56 : 31), size: 9, font, color: rgb(1, 1, 1) });
    }
    y = H - h - 16;
  };

  // ---- Page 1: where the time goes and the three best opportunities ----
  banner("AI Opportunity Audit", `${d.client} | ${d.date}`, true);
  text(d.summary, { gap: 4 });
  heading("Top 3 opportunities");
  for (const t of d.top) {
    text(`${t.rank}.  ${t.task}`, { f: bold, size: fs + 1, gap: 0 });
    text(`About ${t.hoursSavedWeek} hours a week and £${t.annualGbp.toLocaleString("en-GB")} a year could be saved`, { x: M + 14, f: bold, color: ACCENT, width: W - 2 * M - 14 });
    text(`Today: ${t.hoursWeek} h/week${t.by ? `, done by ${t.by}` : ""}, ${t.frequency}${t.errorRate ? `, error rate ${t.errorRate}%` : ""}.`, { x: M + 14, size: fs - 0.5, color: GREY, width: W - 2 * M - 14 });
    text(`Why: ${t.why}`, { x: M + 14, width: W - 2 * M - 14 });
    text(`Approach: ${t.approach}`, { x: M + 14, width: W - 2 * M - 14 });
    for (const f of t.flags) text(f, { x: M + 14, size: fs - 1, color: GREY, width: W - 2 * M - 14 });
    y -= 6;
  }
  need(52);
  if (!dry) page.drawRectangle({ x: M, y: y - 44, width: W - 2 * M, height: 44, color: SOFT });
  text(`Together: about ${d.totals.hoursWeek} hours a week and £${d.totals.annualGbp.toLocaleString("en-GB")} a year`, { x: M + 10, f: bold, size: fs + 1.5, width: W - 2 * M - 20 });
  text(`out of ${d.totals.taskHoursWeek} hours a week of recurring tasks listed. ${d.assumptions}`, { x: M + 10, size: fs - 0.5, color: GREY, width: W - 2 * M - 20, gap: 8 });
  if (d.held.length) {
    text("Held back until data protection is sorted", { f: bold, size: fs });
    for (const h of d.held) text(`${h.task}: ${h.reason}`, { x: M + 6, size: fs - 0.5, color: GREY, width: W - 2 * M - 6 });
  }

  // ---- Page 2: the build, training and risks ----
  newPage();
  banner("AI Opportunity Audit", d.client, false);
  heading("Recommended build");
  text(d.build.name, { f: bold, size: fs + 1.5 });
  text(d.build.description, { gap: 2 });
  bullets(d.build.scope);
  text(`Timeline: about ${d.build.timelineWeeks} weeks from sign-off.${d.build.investment ? ` ${d.build.investment}` : ""}`, { f: bold, gap: 0 });
  if (d.build.credit) text(d.build.credit, { color: GREY });
  heading("Training needs");
  bullets(d.training);
  heading("Risks and how we would handle them");
  for (const r of d.risks) { text(r.risk, { f: bold, x: M + 6, width: W - 2 * M - 6 }); text(r.mitigation, { x: M + 14, color: GREY, width: W - 2 * M - 14 }); }
  heading("Next steps");
  bullets(d.nextSteps);
  y -= 6;
  text("These figures are planning estimates based on the information supplied and the assumptions stated on page 1. They are not guarantees.", { size: fs - 1, color: GREY });

  if (dry) return { overflow };
  const pages = doc.getPages();
  pages.forEach((p, i) => p.drawText(clean(`${d.brand}${d.sender ? ` | ${d.sender}` : ""}    ${i + 1} / ${pages.length}`), { x: M, y: 28, size: 8, font, color: GREY }));
  doc.setTitle(`AI Opportunity Audit: ${d.client}`); doc.setAuthor(d.brand);
  return { overflow, bytes: await doc.save() };
}
