"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, Eye, Save, Trash2, Upload, X } from "lucide-react";
import ToastForm from "./ToastForm";
import { useToast } from "./Toast";
import { deleteThumbnailAssetAction, saveThumbnailDesignAction, uploadThumbnailAssetAction } from "@/lib/thumbnailActions";
import {
  LAYOUTS, MAX_LOGOS, MAX_STICKERS, MAX_STICKER_TEXT, STICKERS, STICKER_COLOURS, TITLE_STYLES,
  cleanDesign, coverTextProblem, isPower, type Design, type Sticker, type StickerKind,
} from "@/lib/thumbnailDesign";
import { assetUrl, coverFont, coverSize, drawThumbnail, loadCoverImages, pick, type CoverImages, type Picked } from "@/lib/thumbnailDraw";

export type CoverAsset = { id: number; name: string };
export type CoverRecord = { id: number; format: string; headline: string; subhead: string | null; frame_url: string | null; design: unknown };

/** Draws a cover into a canvas and keeps it up to date. Shared by the cards (read-only) and the editor. */
export function CoverCanvas({ cover, design, headline, subhead, selected, safeZones, canvasRef, ...rest }: {
  cover: CoverRecord; design: Design; headline?: string; subhead?: string | null; selected?: Picked; safeZones?: boolean;
  canvasRef?: React.RefObject<HTMLCanvasElement | null>;
} & React.CanvasHTMLAttributes<HTMLCanvasElement>) {
  const own = useRef<HTMLCanvasElement>(null);
  const ref = canvasRef ?? own;
  const { w, h } = coverSize(cover.format);
  const [assets, setAssets] = useState<{ images: CoverImages; font: string } | null>(null);
  const logoKey = design.logos.map((l) => l.asset).join(",");

  useEffect(() => {
    let live = true;
    Promise.all([loadCoverImages(cover.frame_url, design), coverFont()]).then(([images, font]) => { if (live) setAssets({ images, font }); });
    return () => { live = false; };
    // Reload only when the pictures change, not on every drag.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cover.frame_url, logoKey]);

  useEffect(() => {
    const ctx = ref.current?.getContext("2d");
    if (!ctx || !assets) return;
    drawThumbnail(ctx, w, h, { headline: headline ?? cover.headline, subhead: subhead === undefined ? cover.subhead : subhead }, design, assets.images, { font: assets.font, selected, safeZones });
  }, [assets, design, headline, subhead, selected, safeZones, cover.headline, cover.subhead, w, h, ref]);

  return <canvas ref={ref} width={w} height={h} className="cover-canvas" {...rest} />;
}

const nameOf = (k: StickerKind) => STICKERS.find((s) => s.code === k)?.label ?? k;
const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

export default function ThumbnailEditor({ cover, assets, onClose }: { cover: CoverRecord; assets: CoverAsset[]; onClose: () => void }) {
  const toast = useToast();
  const router = useRouter();
  const canvas = useRef<HTMLCanvasElement>(null);
  const [headline, setHeadline] = useState(cover.headline);
  const [subhead, setSubhead] = useState(cover.subhead ?? "");
  const [design, setDesign] = useState<Design>(() => cleanDesign(cover.design, cover.headline));
  const [sel, setSel] = useState<Picked>(null);
  const [zones, setZones] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const drag = useRef<{ dx: number; dy: number } | null>(null);
  const tall = cover.format === "9:16";
  const { w: W, h: H } = coverSize(cover.format);

  const change = (next: Design) => { setDesign(next); setDirty(true); };
  const current = sel ? (sel.type === "sticker" ? design.stickers[sel.index] : design.logos[sel.index]) : null;
  const patch = (p: Partial<Sticker>) => {
    if (!sel) return;
    change(sel.type === "sticker"
      ? { ...design, stickers: design.stickers.map((s, i) => (i === sel.index ? { ...s, ...p } : s)) }
      : { ...design, logos: design.logos.map((l, i) => (i === sel.index ? { ...l, ...p } as typeof l : l)) });
  };
  const remove = () => {
    if (!sel) return;
    change(sel.type === "sticker" ? { ...design, stickers: design.stickers.filter((_, i) => i !== sel.index) } : { ...design, logos: design.logos.filter((_, i) => i !== sel.index) });
    setSel(null);
  };
  const addSticker = (kind: StickerKind) => {
    if (design.stickers.length >= MAX_STICKERS) { toast(`A cover holds ${MAX_STICKERS} stickers at most.`, "bad"); return; }
    const def = STICKERS.find((s) => s.code === kind)!;
    change({ ...design, stickers: [...design.stickers, { kind, x: 0.5, y: tall ? 0.45 : 0.4, scale: 1, rot: 0, colour: "coral", ...(def.text ? { text: def.sample } : {}) }] });
    setSel({ type: "sticker", index: design.stickers.length });
  };
  const addLogo = (asset: number) => {
    if (design.logos.length >= MAX_LOGOS) { toast(`A cover holds ${MAX_LOGOS} logos at most.`, "bad"); return; }
    change({ ...design, logos: [...design.logos, { asset, x: 0.85, y: tall ? 0.22 : 0.18, scale: 1, rot: 0 }] });
    setSel({ type: "logo", index: design.logos.length });
  };

  // Pointer position in canvas pixels, whatever size the canvas is shown at.
  const at = (e: React.PointerEvent<HTMLCanvasElement>) => { const r = e.currentTarget.getBoundingClientRect(); return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H }; };
  const down = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const p = at(e), hit = pick(design, p.x, p.y, W, H);
    setSel(hit);
    if (!hit) return;
    const el = hit.type === "sticker" ? design.stickers[hit.index] : design.logos[hit.index];
    drag.current = { dx: p.x / W - el.x, dy: p.y / H - el.y };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drag.current || !sel) return;
    const p = at(e);
    patch({ x: clamp01(p.x / W - drag.current.dx), y: clamp01(p.y / H - drag.current.dy) });
  };
  const up = () => { drag.current = null; };
  const key = (e: React.KeyboardEvent<HTMLCanvasElement>) => {
    if (!current) return;
    const step = e.shiftKey ? 0.05 : 0.01;
    const moves: Record<string, Partial<Sticker>> = {
      ArrowLeft: { x: clamp01(current.x - step) }, ArrowRight: { x: clamp01(current.x + step) }, ArrowUp: { y: clamp01(current.y - step) }, ArrowDown: { y: clamp01(current.y + step) },
      "+": { scale: Math.min(3, current.scale + 0.1) }, "=": { scale: Math.min(3, current.scale + 0.1) }, "-": { scale: Math.max(0.3, current.scale - 0.1) },
    };
    if (moves[e.key]) { e.preventDefault(); patch(moves[e.key]); }
    else if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); remove(); }
    else if (e.key === "Escape") setSel(null);
  };

  const wordProblem = coverTextProblem(headline) ?? coverTextProblem(subhead);
  const save = async () => {
    setSaving(true);
    try {
      const r = await saveThumbnailDesignAction({ id: cover.id, headline, subhead, design });
      if (r?.error) { toast(r.error, "bad"); return; }
      toast("Cover saved"); setDirty(false); router.refresh();
    } catch (err) { toast(`Could not save: ${err instanceof Error ? err.message : String(err)}`, "bad"); }
    finally { setSaving(false); }
  };
  const download = () => {
    const c = canvas.current;
    if (!c) return;
    // Redraw without the selection ring and safe zones would need a second canvas; simpler to clear them for a moment.
    setSel(null); setZones(false);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const a = document.createElement("a");
      a.download = `cover_${cover.format.replace(":", "-")}_${headline.slice(0, 24).replace(/[^A-Za-z0-9]+/g, "_")}.png`;
      a.href = c.toDataURL("image/png"); a.click();
    }));
  };
  const close = () => { if (!dirty || window.confirm("Close without saving your changes to this cover?")) onClose(); };

  const words = headline.toUpperCase().split(/\s+/).filter(Boolean);
  const text = sel?.type === "sticker" ? design.stickers[sel.index] : null;
  const textDef = text ? STICKERS.find((s) => s.code === text.kind) : null;

  return (
    <section className="card cover-editor" aria-label="Edit this cover">
      <div className="row-between">
        <h2 style={{ margin: 0 }}>Edit cover</h2>
        <div className="row" style={{ gap: 8 }}>
          {tall && <button type="button" className="secondary" aria-pressed={zones} onClick={() => setZones((z) => !z)}><Eye size={14} aria-hidden /> {zones ? "Hide safe zones" : "Show safe zones"}</button>}
          <button type="button" className="secondary" onClick={download}><Download size={14} aria-hidden /> PNG</button>
          <button type="button" onClick={save} disabled={saving || !!wordProblem || !headline.trim()}><Save size={14} aria-hidden /> {saving ? "Saving…" : "Save cover"}</button>
          <button type="button" className="icon-btn" onClick={close} aria-label="Close the editor"><X size={16} /></button>
        </div>
      </div>

      <div className={`cover-editor-body${tall ? " tall" : ""}`}>
        <div className="cover-stage">
          <CoverCanvas cover={cover} design={design} headline={headline} subhead={subhead} selected={sel} safeZones={zones} canvasRef={canvas}
            tabIndex={0} aria-label="Cover preview. Click a sticker or logo to select it, drag to move it, arrow keys to nudge, plus and minus to resize, Delete to remove."
            onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onKeyDown={key} style={{ touchAction: "none", cursor: sel ? "grab" : "default" }} />
          <p className="muted" style={{ margin: "8px 0 0", fontSize: 13 }}>Drag a sticker or logo to move it. The downloaded PNG is exactly this picture.</p>
        </div>

        <div className="stack" style={{ gap: 16 }}>
          <div className="cover-fields">
            <label>Title (2 to 4 words reads best)<input value={headline} maxLength={60} onChange={(e) => { setHeadline(e.target.value.toUpperCase()); setDirty(true); }} /></label>
            <label>Supporting line<input value={subhead} maxLength={60} onChange={(e) => { setSubhead(e.target.value); setDirty(true); }} /></label>
          </div>
          {wordProblem && <p className="error" role="alert" style={{ margin: 0 }}>{wordProblem}</p>}

          <div>
            <div className="field-label">Power word (drawn in Coral)</div>
            <div className="pills">
              <button type="button" className={`pill${design.power ? "" : " on"}`} aria-pressed={!design.power} onClick={() => change({ ...design, power: "" })}>None</button>
              {words.map((wd, i) => { const on = isPower(wd, design.power); return (
                <button key={i} type="button" className={`pill${on ? " on" : ""}`} aria-pressed={on} onClick={() => change(cleanDesign({ ...design, power: wd }, headline))}>{wd}</button>
              ); })}
            </div>
          </div>

          <div>
            <div className="field-label">Layout</div>
            <div className="pills">{LAYOUTS.map((l) => (
              <button key={l.code} type="button" title={l.hint} className={`pill${design.layout === l.code ? " on" : ""}`} aria-pressed={design.layout === l.code} onClick={() => change({ ...design, layout: l.code })}>{l.label}</button>
            ))}</div>
          </div>

          <div>
            <div className="field-label">Title style</div>
            <div className="pills">
              {TITLE_STYLES.map((s) => (
                <button key={s.code} type="button" className={`pill${design.style === s.code ? " on" : ""}`} aria-pressed={design.style === s.code} onClick={() => change({ ...design, style: s.code })}>{s.label}</button>
              ))}
              <button type="button" className={`pill${design.tilt ? " on" : ""}`} aria-pressed={design.tilt} onClick={() => change({ ...design, tilt: !design.tilt })}>Tilted</button>
            </div>
          </div>

          <div>
            <div className="field-label">Add a sticker ({design.stickers.length} of {MAX_STICKERS})</div>
            <div className="pills">{STICKERS.map((s) => <button key={s.code} type="button" className="pill" onClick={() => addSticker(s.code)}>{s.label}</button>)}</div>
          </div>

          {(design.stickers.length > 0 || design.logos.length > 0) && (
            <div>
              <div className="field-label">On this cover</div>
              <div className="pills">
                {design.stickers.map((s, i) => { const on = sel?.type === "sticker" && sel.index === i; return (
                  <button key={`s${i}`} type="button" className={`pill${on ? " on" : ""}`} aria-pressed={on} onClick={() => setSel({ type: "sticker", index: i })}>{nameOf(s.kind)}{s.text ? ` “${s.text}”` : ""}</button>
                ); })}
                {design.logos.map((l, i) => { const on = sel?.type === "logo" && sel.index === i; return (
                  <button key={`l${i}`} type="button" className={`pill${on ? " on" : ""}`} aria-pressed={on} onClick={() => setSel({ type: "logo", index: i })}>Logo: {assets.find((a) => a.id === l.asset)?.name ?? "removed"}</button>
                ); })}
              </div>
            </div>
          )}

          {current && (
            <div className="chip-box cover-fields">
              {textDef?.text && text && (
                <label>Text<input value={text.text ?? ""} maxLength={MAX_STICKER_TEXT} onChange={(e) => { const v = e.target.value; if (!coverTextProblem(v)) patch({ text: v }); else toast(coverTextProblem(v)!, "bad"); }} /></label>
              )}
              {text && (
                <label>Colour<select value={text.colour} onChange={(e) => patch({ colour: e.target.value as Sticker["colour"] })}>{STICKER_COLOURS.map((c) => <option key={c} value={c}>{c[0].toUpperCase() + c.slice(1)}</option>)}</select></label>
              )}
              <label>Size<input type="range" min={0.3} max={3} step={0.05} value={current.scale} onChange={(e) => patch({ scale: Number(e.target.value) })} /></label>
              <label>Turn<input type="range" min={-180} max={180} step={1} value={current.rot} onChange={(e) => patch({ rot: Number(e.target.value) })} /></label>
              <button type="button" className="secondary" onClick={remove} style={{ alignSelf: "end" }}><Trash2 size={14} aria-hidden /> Remove</button>
            </div>
          )}

          <div>
            <div className="field-label">Logo library ({assets.length})</div>
            <p className="muted" style={{ margin: "0 0 8px", fontSize: 13 }}>Your own logo, and the logos of tools you really used in the video. Showing a tool is fine; never use another company’s logo to suggest it endorses you.</p>
            <div className="cover-logos">
              {assets.map((a) => (
                <div key={a.id} className="cover-logo">
                  <button type="button" className="cover-logo-add" onClick={() => addLogo(a.id)} title={`Add ${a.name} to the cover`}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={assetUrl(a.id)} alt="" /><span>{a.name}</span>
                  </button>
                  <ToastForm action={deleteThumbnailAssetAction} success="Logo removed" confirm={`Remove ${a.name} from the library? Covers that use it will draw without it.`}>
                    <input type="hidden" name="assetId" value={a.id} />
                    <button className="link" aria-label={`Remove ${a.name} from the library`}><Trash2 size={13} /></button>
                  </ToastForm>
                </div>
              ))}
            </div>
            <ToastForm action={uploadThumbnailAssetAction} success="Logo added" reset className="row" style={{ gap: 8, marginTop: 10 }}>
              <input type="file" name="file" accept="image/png,image/jpeg,image/webp" required aria-label="Logo image" />
              <input name="name" placeholder="Name (optional)" aria-label="Logo name" maxLength={40} style={{ width: 160 }} />
              <button className="secondary"><Upload size={14} aria-hidden /> Add logo</button>
            </ToastForm>
            <p className="muted" style={{ margin: "6px 0 0", fontSize: 12.5 }}>PNG, JPEG or WebP, up to 1 MB. A transparent PNG looks best.</p>
          </div>
        </div>
      </div>
    </section>
  );
}
