"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Download, ImageIcon, Pencil, Ratio, ShieldCheck, Sparkles, Trash2 } from "lucide-react";
import ToastForm from "./ToastForm";
import ThumbnailEditor, { CoverCanvas, type CoverAsset } from "./ThumbnailEditor";
import { deleteThumbnailAction, generateThumbnailsAction, selectThumbnailAction } from "@/lib/thumbnailActions";
import type { ThumbnailFormat, PlatformRisk } from "@/lib/thumbnailMath";
import { cleanDesign } from "@/lib/thumbnailDesign";
import { coverFont, coverSize, drawThumbnail, loadCoverImages } from "@/lib/thumbnailDraw";

export type ThumbnailRecord = {
  id: number;
  content_item_id: number;
  clip_id: number | null;
  format: ThumbnailFormat;
  headline: string;
  subhead: string | null;
  frame_url: string | null;
  design: unknown;
  contrast_ratio: number | null;
  performance_score: number | null;
  platform_risk: PlatformRisk | null;
  risk_reasons: string[] | null;
  selected: boolean;
  created_at: string;
};

const RISK_TONE: Record<string, string> = { High: "bad", Medium: "warn", Low: "good" };

/** The full-size PNG of a saved cover, drawn by the same code as the preview. */
async function downloadCover(t: ThumbnailRecord) {
  const { w, h } = coverSize(t.format);
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const design = cleanDesign(t.design, t.headline);
  const [images, font] = await Promise.all([loadCoverImages(t.frame_url, design), coverFont()]);
  drawThumbnail(ctx, w, h, { headline: t.headline, subhead: t.subhead }, design, images, { font });
  const a = document.createElement("a");
  a.download = `cover_${t.format.replace(":", "-")}_${t.headline.slice(0, 24).replace(/[^A-Za-z0-9]+/g, "_")}.png`;
  a.href = canvas.toDataURL("image/png");
  a.click();
}

export default function ThumbnailBuilder({ thumbnails, projects, clips, assets }: {
  thumbnails: ThumbnailRecord[];
  projects: { id: number; idea: string }[];
  clips: { id: number; current_name: string; frame_path: string | null }[];
  assets: CoverAsset[];
}) {
  const [selectedProjectId, setSelectedProjectId] = useState<number>(projects[0]?.id || 0);
  const [format, setFormat] = useState<ThumbnailFormat>("16:9");
  const [selectedClipId, setSelectedClipId] = useState<string>("");
  const [generating, setGenerating] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  useEffect(() => {
    if ((selectedProjectId === 0 || !projects.some((p) => Number(p.id) === Number(selectedProjectId))) && projects.length > 0) setSelectedProjectId(Number(projects[0].id));
  }, [projects, selectedProjectId]);

  const handleGenerate = async (fd: FormData) => { setGenerating(true); try { return await generateThumbnailsAction(fd); } finally { setGenerating(false); } };
  const inProject = (t: ThumbnailRecord) => selectedProjectId === 0 || Number(t.content_item_id) === Number(selectedProjectId);
  const shown = thumbnails.filter((t) => inProject(t) && t.format === format);
  const count = (f: ThumbnailFormat) => thumbnails.filter((t) => inProject(t) && t.format === f).length;
  const editing = thumbnails.find((t) => t.id === editingId) ?? null;

  return (
    <div className="stack" style={{ gap: 20 }}>
      <section className="card">
        <div className="row-between" style={{ marginBottom: 12 }}>
          <div className="row" style={{ gap: 8 }}><ImageIcon size={18} aria-hidden /><h2 style={{ margin: 0 }}>Cover builder</h2></div>
          <span className="badge tone-neutral">Your frames · no figures · safe zones</span>
        </div>
        <p className="muted" style={{ margin: "0 0 14px" }}>
          Writes cover ideas for a video, each with a dramatic title, a layout and a sticker or two. Then edit any of them: change the words, drag stickers about, and add logos from your library.
          Titles never carry money amounts, percentages or guarantees.
        </p>

        <ToastForm action={handleGenerate} success="Cover ideas ready" className="row" style={{ gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
          <label className="stack" style={{ gap: 4, flex: 2, minWidth: 220 }}>
            <span className="field-label">Video project</span>
            <select name="contentItemId" value={selectedProjectId} onChange={(e) => setSelectedProjectId(Number(e.target.value))} required disabled={projects.length === 0 || generating}>
              {projects.length === 0 ? <option value="0">(No video projects yet)</option> : projects.map((p) => <option key={p.id} value={p.id}>#{p.id}: {p.idea.slice(0, 48)}</option>)}
            </select>
          </label>
          <label className="stack" style={{ gap: 4, flex: 1, minWidth: 150 }}>
            <span className="field-label">Format</span>
            <select name="format" value={format} onChange={(e) => setFormat(e.target.value as ThumbnailFormat)} disabled={generating}>
              <option value="16:9">16:9 YouTube</option>
              <option value="9:16">9:16 Reels and TikTok</option>
            </select>
          </label>
          <label className="stack" style={{ gap: 4, flex: 2, minWidth: 200 }}>
            <span className="field-label">Background frame (optional)</span>
            <select name="clipId" value={selectedClipId} onChange={(e) => setSelectedClipId(e.target.value)} disabled={generating}>
              <option value="">Navy background (no clip)</option>
              {clips.filter((c) => c.frame_path).map((c) => <option key={c.id} value={c.id}>Clip: {c.current_name}</option>)}
            </select>
          </label>
          <button type="submit" disabled={!selectedProjectId || generating || projects.length === 0}>
            <Sparkles size={15} className={generating ? "spin-quick" : ""} aria-hidden /> {generating ? "Writing cover ideas… (5 to 10 seconds)" : "Generate cover ideas"}
          </button>
        </ToastForm>
      </section>

      {editing && <ThumbnailEditor key={editing.id} cover={editing} assets={assets} onClose={() => setEditingId(null)} />}

      <div className="pills" role="group" aria-label="Format">
        {(["16:9", "9:16"] as const).map((f) => (
          <button key={f} type="button" className={`pill${format === f ? " on" : ""}`} aria-pressed={format === f} onClick={() => setFormat(f)}>
            <Ratio size={14} aria-hidden /> {f === "16:9" ? "16:9 YouTube" : "9:16 Reels and TikTok"} ({count(f)})
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <div className="card" style={{ textAlign: "center" }}>
          <ImageIcon size={32} style={{ color: "var(--muted)", margin: "0 auto 8px" }} aria-hidden />
          <h3 style={{ margin: 0 }}>No {format} covers yet</h3>
          <p className="muted" style={{ margin: "4px 0 0" }}>Choose a video project above and click Generate cover ideas.</p>
        </div>
      ) : (
        <div className={`cover-grid${format === "9:16" ? " tall" : ""}`}>
          {shown.map((t) => (
            <div key={t.id} className={`card stack cover-card${t.selected ? " active" : ""}`}>
              <div style={{ position: "relative" }}>
                <CoverCanvas cover={t} design={cleanDesign(t.design, t.headline)} role="img" aria-label={`Cover: ${t.headline}${t.subhead ? `, ${t.subhead}` : ""}`} />
                {t.selected && <span className="badge tone-good" style={{ position: "absolute", top: 8, right: 8 }}>Active cover</span>}
              </div>

              <div className="stack" style={{ gap: 6, fontSize: 13 }}>
                <div className="row-between"><span className="muted">Readability score</span><b>{t.performance_score ? `${t.performance_score}/10` : "–"}</b></div>
                <div className="row-between"><span className="muted">Title contrast</span><span className="row" style={{ gap: 4, color: "var(--good)", fontWeight: 600 }}><ShieldCheck size={14} aria-hidden /> {t.contrast_ratio ? `${t.contrast_ratio}:1` : "Pass"}</span></div>
                <div className="row-between"><span className="muted">Platform risk</span><span className={`badge tone-${RISK_TONE[t.platform_risk ?? "Low"] ?? "good"}`}>{t.platform_risk || "Low"} risk</span></div>
                {t.risk_reasons && t.risk_reasons.length > 0 && <div className="muted" style={{ fontSize: 12 }}><AlertTriangle size={12} style={{ display: "inline", marginRight: 4 }} aria-hidden />{t.risk_reasons.join(" · ")}</div>}
              </div>

              <div className="row-between" style={{ paddingTop: 8, borderTop: "1px solid var(--line-soft)" }}>
                <div className="row" style={{ gap: 8 }}>
                  <button type="button" className="secondary" onClick={() => { setEditingId(t.id); window.scrollTo({ top: 0, behavior: "smooth" }); }}><Pencil size={13} aria-hidden /> Edit</button>
                  <button type="button" className="secondary" onClick={() => downloadCover(t)} title="Download the full-size PNG"><Download size={13} aria-hidden /> PNG</button>
                  {!t.selected && (
                    <ToastForm action={selectThumbnailAction} success="Active cover set" style={{ margin: 0 }}>
                      <input type="hidden" name="thumbnailId" value={t.id} />
                      <button className="link">Set active</button>
                    </ToastForm>
                  )}
                </div>
                <ToastForm action={deleteThumbnailAction} success="Cover removed" confirm="Delete this cover?" style={{ margin: 0 }}>
                  <input type="hidden" name="thumbnailId" value={t.id} />
                  <button type="submit" className="link" style={{ color: "var(--muted)" }} aria-label={`Delete the cover ${t.headline}`}><Trash2 size={13} /></button>
                </ToastForm>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
