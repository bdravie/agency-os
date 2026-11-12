"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Download, ImageIcon, Pencil, Save, Sparkles, Trash2, X } from "lucide-react";
import ToastForm from "./ToastForm";
import { useToast } from "./Toast";
import { addPostImageAction, deletePostImageAction, savePostImageAction, selectPostImageAction } from "@/lib/linkedinActions";
import {
  IMAGE_KINDS, IMAGE_SIZES, IMAGE_THEMES, LIMITS, cleanPostImage, diagramCodeProblem, imageFileName, imageProblems, imageSize, pageCount, slidesToText, textToSlides,
  type ImageKind, type ImageSize, type PostImage,
} from "@/lib/linkedinMath";
import { diagramImage, downloadForLinkedIn, drawPostImage, postFonts, type PostFonts } from "@/lib/linkedinDraw";
import { cleanMermaidError } from "@/lib/flowchartMath";

export type PostImageRow = { id: number; design: unknown; selected: boolean };

const kindLabel = (k: string) => IMAGE_KINDS.find((x) => x.code === k)?.label ?? k;

/** Draws an image into a canvas and keeps it up to date. Shared by the cards (read-only) and the editor. A diagram is drawn by Mermaid first, a moment after the code stops changing. */
export function PostImageCanvas({ design, footer, page = 0, onDiagramError, ...rest }: { design: PostImage; footer: string; page?: number; onDiagramError?: (message: string | null) => void } & React.CanvasHTMLAttributes<HTMLCanvasElement>) {
  const ref = useRef<HTMLCanvasElement>(null);
  const { w, h } = imageSize(design.size);
  const [fonts, setFonts] = useState<PostFonts | null>(null);
  const [diagram, setDiagram] = useState<{ code: string; img: HTMLImageElement | null; note?: string }>({ code: "", img: null });
  const report = useRef(onDiagramError);
  report.current = onDiagramError;

  useEffect(() => { let live = true; postFonts().then((f) => { if (live) setFonts(f); }); return () => { live = false; }; }, []);

  useEffect(() => {
    if (design.kind !== "diagram") return;
    let live = true;
    const code = design.code;
    const timer = setTimeout(() => {
      const problem = diagramCodeProblem(code);
      if (problem) { setDiagram({ code, img: null, note: "Fix the diagram code to see it" }); report.current?.(problem); return; }
      diagramImage(code).then(
        (img) => { if (live) { setDiagram({ code, img }); report.current?.(null); } },
        // Mermaid counts the colour line added in front of the code, so its line numbers are one too high.
        (err) => { if (live) { setDiagram((d) => ({ code, img: d.img, note: "The diagram code has a mistake" })); report.current?.(cleanMermaidError(err).replace(/\bline (\d+)/, (_, n) => `line ${Math.max(1, Number(n) - 1)}`)); } });
    }, 350);
    return () => { live = false; clearTimeout(timer); };
  }, [design.kind, design.code]);

  useEffect(() => {
    const ctx = ref.current?.getContext("2d");
    if (!ctx || !fonts) return;
    drawPostImage(ctx, w, h, design, { fonts, diagram: diagram.img, diagramNote: diagram.note, footer }, page);
  }, [fonts, design, diagram, footer, w, h, page]);

  return <canvas ref={ref} width={w} height={h} className="cover-canvas" {...rest} />;
}

const toLines = (text: string) => text.split("\n").map((l) => l.trim()).filter(Boolean);

function ImageEditor({ row, footer, onClose }: { row: PostImageRow; footer: string; onClose: () => void }) {
  const toast = useToast();
  const router = useRouter();
  const start = useMemo(() => cleanPostImage(row.design), [row.design]);
  const [f, setF] = useState({ title: start.title, power: start.power, theme: start.theme, size: start.size, footer: start.footer, items: start.items.join("\n"), before: start.before.join("\n"), after: start.after.join("\n"), code: start.code, slides: slidesToText(start.slides), cta: start.cta });
  const [page, setPage] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [diagramError, setDiagramError] = useState<string | null>(null);
  const set = (patch: Partial<typeof f>) => { setF((cur) => ({ ...cur, ...patch })); setDirty(true); };
  const design = useMemo(() => cleanPostImage({ kind: start.kind, ...f, items: toLines(f.items), before: toLines(f.before), after: toLines(f.after), slides: textToSlides(f.slides) }), [start.kind, f]);
  const pages = pageCount(design), shown = Math.min(page, pages - 1);
  const problems = imageProblems(design);
  const words = [...new Set(design.title.split(/\s+/).map((w) => w.toUpperCase().replace(/[^A-Z0-9'’-]/g, "")).filter((w) => w.length > 1))];

  const save = async () => {
    setSaving(true);
    try {
      const r = await savePostImageAction({ imageId: row.id, design });
      if (r.error) { toast(r.error, "bad"); return; }
      toast("Image saved"); setDirty(false); router.refresh();
    } catch (err) { toast(`Could not save: ${err instanceof Error ? err.message : String(err)}`, "bad"); }
    finally { setSaving(false); }
  };
  const close = () => { if (!dirty || window.confirm("Close without saving your changes to this image?")) onClose(); };

  return (
    <section className="card cover-editor" aria-label={`Edit the ${kindLabel(start.kind).toLowerCase()}`}>
      <div className="row-between">
        <h3 style={{ margin: 0 }}>Edit: {kindLabel(start.kind)}</h3>
        <button type="button" className="link" onClick={close} aria-label="Close the editor"><X size={16} aria-hidden /></button>
      </div>
      <div className="li-image-editor">
        <div className="cover-stage stack" style={{ gap: 8 }}>
          <PostImageCanvas design={design} footer={footer} page={shown} onDiagramError={setDiagramError} role="img" aria-label={pages > 1 ? `Preview, page ${shown + 1} of ${pages}` : `Preview: ${design.title}`} />
          {pages > 1 && (
            <div className="row-between" style={{ gap: 8 }}>
              <button type="button" className="icon-btn" onClick={() => setPage(Math.max(0, shown - 1))} disabled={shown === 0} aria-label="Previous page"><ChevronLeft size={16} aria-hidden /></button>
              <span className="muted" style={{ fontSize: 13 }} aria-live="polite">Page {shown + 1} of {pages}</span>
              <button type="button" className="icon-btn" onClick={() => setPage(Math.min(pages - 1, shown + 1))} disabled={shown >= pages - 1} aria-label="Next page"><ChevronRight size={16} aria-hidden /></button>
            </div>
          )}
        </div>
        <div className="stack" style={{ gap: 12 }}>
          <label className="stack" style={{ gap: 4 }}>
            <span className="field-label">{start.kind === "quote" ? `The line (up to ${LIMITS.quote} characters)` : start.kind === "carousel" ? `Cover title (up to ${LIMITS.title} characters)` : `Heading (up to ${LIMITS.title} characters)`}</span>
            <textarea rows={start.kind === "quote" ? 4 : 2} maxLength={start.kind === "quote" ? LIMITS.quote : LIMITS.title} value={f.title} onChange={(e) => set({ title: e.target.value })} />
          </label>
          {start.kind === "steps" && (
            <label className="stack" style={{ gap: 4 }}>
              <span className="field-label">Steps, one per line (2 to {LIMITS.steps})</span>
              <textarea rows={6} value={f.items} onChange={(e) => set({ items: e.target.value })} />
            </label>
          )}
          {start.kind === "compare" && (
            <>
              <label className="stack" style={{ gap: 4 }}>
                <span className="field-label">Before, one per line (up to {LIMITS.side})</span>
                <textarea rows={3} value={f.before} onChange={(e) => set({ before: e.target.value })} />
              </label>
              <label className="stack" style={{ gap: 4 }}>
                <span className="field-label">After, one per line (up to {LIMITS.side})</span>
                <textarea rows={3} value={f.after} onChange={(e) => set({ after: e.target.value })} />
              </label>
            </>
          )}
          {start.kind === "carousel" && (
            <>
              <label className="stack" style={{ gap: 4 }}>
                <span className="field-label">Slides: one block each, heading on the first line, text below, a blank line between slides (2 to {LIMITS.slides})</span>
                <textarea rows={12} value={f.slides} onChange={(e) => set({ slides: e.target.value })} />
              </label>
              <label className="stack" style={{ gap: 4 }}>
                <span className="field-label">Closing slide (a question or next step; leave empty for none)</span>
                <input value={f.cta} maxLength={LIMITS.cta} onChange={(e) => set({ cta: e.target.value })} />
              </label>
            </>
          )}
          {start.kind === "diagram" && (
            <label className="stack" style={{ gap: 4 }}>
              <span className="field-label">Diagram code (Mermaid flowchart; 4 to 6 steps reads best)</span>
              <textarea rows={9} className="li-code" spellCheck={false} maxLength={LIMITS.code} value={f.code} onChange={(e) => set({ code: e.target.value })} />
              {diagramError && <span className="error" role="alert">{diagramError}</span>}
            </label>
          )}
          <div className="cover-fields">
            <label>Word in Coral
              <select value={design.power} onChange={(e) => set({ power: e.target.value })}>
                <option value="">None</option>
                {words.map((w) => <option key={w} value={w}>{w}</option>)}
              </select>
            </label>
            <label>Background
              <select value={f.theme} onChange={(e) => set({ theme: e.target.value as PostImage["theme"] })}>{IMAGE_THEMES.map((t) => <option key={t.code} value={t.code}>{t.label}</option>)}</select>
            </label>
            <label>Shape
              <select value={f.size} onChange={(e) => set({ size: e.target.value as ImageSize })}>{IMAGE_SIZES.map((s) => <option key={s.code} value={s.code}>{s.label}</option>)}</select>
            </label>
            <label style={{ flexDirection: "row", alignItems: "center", gap: 8, gridColumn: "1 / -1" }}>
              <input type="checkbox" checked={f.footer} onChange={(e) => set({ footer: e.target.checked })} style={{ width: "auto" }} /> {footer ? `Show “${footer}” along the bottom` : "Business name along the bottom (set BUSINESS_NAME to use this)"}
            </label>
          </div>
          {problems.length > 0 && <p className="error" role="alert">{problems.join(" ")}</p>}
          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            <button type="button" className="secondary" onClick={save} disabled={saving || !dirty || problems.length > 0 || !!diagramError}><Save size={15} aria-hidden /> {saving ? "Saving…" : dirty ? "Save image" : "Saved"}</button>
            <span className="muted" style={{ fontSize: 13 }}>A plain count is the only number allowed: no money amounts, percentages or guarantees.</span>
          </div>
        </div>
      </div>
    </section>
  );
}

/** Images for one LinkedIn post, built from its words: suggested by AI on a click, or started by hand, then edited and downloaded as a PNG. */
export default function PostImageBuilder({ postId, hasText, images, footer, aiReady }: { postId: number; hasText: boolean; images: PostImageRow[]; footer: string; aiReady: boolean }) {
  const toast = useToast();
  const router = useRouter();
  const [kind, setKind] = useState<ImageKind | "auto">("auto");
  const [size, setSize] = useState<ImageSize>("4:5");
  const [busy, setBusy] = useState<"ai" | "blank" | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const editing = images.find((i) => i.id === editingId) ?? null;

  const add = async (ai: boolean) => {
    setBusy(ai ? "ai" : "blank");
    try {
      const r = await addPostImageAction({ postId, kind, size, ai });
      if (r.error) { toast(r.error, "bad"); return; }
      toast(ai ? "Image suggested: check the words, then edit or download" : "Image started: edit the words");
      if (r.imageId && !ai) setEditingId(r.imageId);
      router.refresh();
    } catch (err) { toast(`Could not add the image: ${err instanceof Error ? err.message : String(err)}`, "bad"); }
    finally { setBusy(null); }
  };
  const download = async (row: PostImageRow) => {
    const d = cleanPostImage(row.design);
    try { await downloadForLinkedIn(d, footer, imageFileName(d.title, d.kind, d.size)); }
    catch (err) { toast(`The image could not be made: ${cleanMermaidError(err)}`, "bad"); }
  };

  return (
    <div className="stack" style={{ gap: 16 }}>
      <section className="card">
        <div className="row" style={{ gap: 8, marginBottom: 6 }}><ImageIcon size={18} aria-hidden /><h2 style={{ margin: 0 }}>Image</h2></div>
        <p className="muted" style={{ margin: "0 0 12px" }}>
          Built from the saved post, in your brand colours: a quote card, numbered steps, a before / after or a workflow diagram. Download the PNG and attach it when you post.
        </p>
        <div className="row" style={{ gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
          <label className="stack" style={{ gap: 4, flex: 1, minWidth: 170 }}>
            <span className="field-label">Kind</span>
            <select value={kind} onChange={(e) => setKind(e.target.value as ImageKind | "auto")} disabled={busy !== null}>
              <option value="auto">Best fit for the post</option>
              {IMAGE_KINDS.map((k) => <option key={k.code} value={k.code}>{k.label}</option>)}
            </select>
          </label>
          <label className="stack" style={{ gap: 4, flex: 1, minWidth: 150 }}>
            <span className="field-label">Shape</span>
            <select value={size} onChange={(e) => setSize(e.target.value as ImageSize)} disabled={busy !== null}>{IMAGE_SIZES.map((s) => <option key={s.code} value={s.code}>{s.label}</option>)}</select>
          </label>
          <button type="button" className="secondary" onClick={() => add(true)} disabled={busy !== null || !hasText || !aiReady} title={!hasText ? "Save some post text first" : !aiReady ? "No AI key is set" : undefined}>
            <Sparkles size={15} className={busy === "ai" ? "spin-quick" : ""} aria-hidden /> {busy === "ai" ? "Reading the post… (5 to 10 seconds)" : "Suggest from the post"}
          </button>
          <button type="button" className="secondary" onClick={() => add(false)} disabled={busy !== null || kind === "auto"} title={kind === "auto" ? "Choose a kind first" : undefined}>{busy === "blank" ? "Starting…" : "Start one myself"}</button>
        </div>
        <p className="muted" style={{ margin: "10px 0 0", fontSize: 13 }}>
          {kind === "auto" ? "Suggest reads the saved post and picks the kind that fits. To start one yourself, choose a kind." : IMAGE_KINDS.find((k) => k.code === kind)?.hint}
          {!hasText && " Save the post text first: the image is built from it."}
        </p>
      </section>

      {editing && <ImageEditor key={editing.id} row={editing} footer={footer} onClose={() => setEditingId(null)} />}

      {images.length > 0 && (
        <div className="cover-grid tall">
          {images.map((row) => {
            const d = cleanPostImage(row.design);
            return (
              <div key={row.id} className={`card stack cover-card${row.selected ? " active" : ""}`}>
                <PostImageCanvas design={d} footer={footer} role="img" aria-label={`${kindLabel(d.kind)}: ${d.title}`} />
                <div className="row-between muted" style={{ fontSize: 13 }}>
                  <span>{kindLabel(d.kind)} · {imageSize(d.size).label}{d.kind === "carousel" ? ` · ${pageCount(d)} pages` : ""}</span>
                  {row.selected && <span className="badge tone-good">Chosen</span>}
                </div>
                <div className="row-between" style={{ paddingTop: 8, borderTop: "1px solid var(--line-soft)" }}>
                  <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                    <button type="button" className="secondary" onClick={() => setEditingId(row.id)}><Pencil size={13} aria-hidden /> Edit</button>
                    <button type="button" className="secondary" onClick={() => download(row)} title={d.kind === "carousel" ? "Download the slides as a PDF, to post as a LinkedIn document" : "Download the full-size PNG"}><Download size={13} aria-hidden /> {d.kind === "carousel" ? "PDF" : "PNG"}</button>
                    {!row.selected && (
                      <ToastForm action={selectPostImageAction} success="Image chosen" style={{ margin: 0 }}>
                        <input type="hidden" name="imageId" value={row.id} />
                        <button className="link">Use this one</button>
                      </ToastForm>
                    )}
                  </div>
                  <ToastForm action={deletePostImageAction} success="Image deleted" confirm="Delete this image?" onDone={() => { if (editingId === row.id) setEditingId(null); }} style={{ margin: 0 }}>
                    <input type="hidden" name="imageId" value={row.id} />
                    <button type="submit" className="link" aria-label={`Delete the ${kindLabel(d.kind).toLowerCase()}`}><Trash2 size={13} aria-hidden /></button>
                  </ToastForm>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
