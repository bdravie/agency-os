"use client";

import { useState } from "react";
import ToastForm from "./ToastForm";
import {
  scanFootageFolderAction,
  applyRenameAction,
  undoRenameAction,
  assignClipToProjectAction,
  browseFolderAction,
} from "@/lib/footageActions";
import {
  CLIP_TYPE_LABELS,
  formatDuration,
  type ClipType,
} from "@/lib/footageSafety";
import {
  Film,
  FolderOpen,
  Sparkles,
  Undo2,
  Lock,
  Check,
  PlaySquare,
  AlertCircle,
  Search,
} from "lucide-react";

export type FootageClipRecord = {
  id: number;
  folder_path: string;
  current_name: string;
  original_name: string;
  suggested_name: string | null;
  clip_type: ClipType | null;
  duration_s: number | null;
  resolution: string | null;
  fps: number | null;
  frame_path: string | null;
  ai_label: string | null;
  ai_confidence: number | null;
  used_in_project_id: number | null;
  renamed_at: string | null;
};

export type FootageRenameRecord = {
  id: number;
  clip_id: number;
  folder_path: string;
  old_name: string;
  new_name: string;
  undone_at: string | null;
  created_at: string;
};

export default function FootageManager({
  clips,
  renames,
  projects,
  lastFolder,
}: {
  clips: FootageClipRecord[];
  renames: FootageRenameRecord[];
  projects: { id: number; idea: string }[];
  lastFolder?: string;
}) {
  const [folderPath, setFolderPath] = useState(lastFolder || "");
  const [editingNames, setEditingNames] = useState<Record<number, string>>({});
  const [browsing, setBrowsing] = useState(false);

  const handleNameChange = (clipId: number, val: string) => {
    setEditingNames((prev) => ({ ...prev, [clipId]: val }));
  };

  const handleBrowseFolder = async () => {
    setBrowsing(true);
    try {
      const res = await browseFolderAction();
      if (res?.path) {
        setFolderPath(res.path);
      }
    } finally {
      setBrowsing(false);
    }
  };

  return (
    <div className="stack" style={{ gap: 20 }}>
      {/* Folder scan card */}
      <section className="card" style={{ padding: 18 }}>
        <div className="row-between" style={{ marginBottom: 12 }}>
          <div className="row" style={{ gap: 8 }}>
            <FolderOpen size={18} style={{ color: "var(--accent)" }} aria-hidden />
            <h2 style={{ margin: 0, fontSize: 16 }}>Scan local footage folder</h2>
          </div>
          <span className="badge tone-neutral" style={{ fontSize: 11 }}>
            Click-only · ~$0.002 / clip
          </span>
        </div>

        <p className="muted" style={{ margin: "0 0 14px", fontSize: 13.5 }}>
          Give a local folder path containing your camera cards, screen recordings, or B-roll clips.
          ffmpeg pulls metadata and preview frames; AI labels each clip as talking head, b-roll, or screen recording.
          Files are never moved or deleted.
        </p>

        <ToastForm
          action={scanFootageFolderAction}
          success="Footage folder scanned and classified"
          className="row"
          style={{ gap: 10, flexWrap: "wrap", alignItems: "center" }}
        >
          <div className="row" style={{ flex: 1, minWidth: 320, gap: 6 }}>
            <input
              name="folderPath"
              value={folderPath}
              onChange={(e) => setFolderPath(e.target.value)}
              placeholder="/Volumes/T7/Footage or /Users/brad/Movies/Clips"
              required
              aria-label="Footage folder path"
              style={{ flex: 1, minWidth: 180 }}
            />
            <button
              type="button"
              onClick={handleBrowseFolder}
              disabled={browsing}
              className="secondary"
              style={{
                whiteSpace: "nowrap",
                padding: "8px 12px",
                fontSize: 13,
                cursor: "pointer",
              }}
              title="Open macOS Finder to pick a folder visually"
            >
              <Search size={14} aria-hidden /> {browsing ? "Opening Finder…" : "Search folder…"}
            </button>
          </div>
          <button
            type="submit"
            disabled={!folderPath.trim() || browsing}
            style={{
              backgroundColor: "var(--accent)",
              color: "var(--on-accent)",
              fontWeight: 600,
              padding: "8px 16px",
            }}
          >
            <Sparkles size={15} aria-hidden /> Scan &amp; classify
          </button>
        </ToastForm>
      </section>

      {/* Clips Library & Renaming Grid */}
      <section className="card table-wrap" style={{ padding: 18 }}>
        <div className="row-between" style={{ marginBottom: 14 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 16 }}>Footage library ({clips.length} clips)</h2>
            <p className="muted" style={{ margin: "4px 0 0", fontSize: 13 }}>
              Review AI suggestions. Renaming happens only after your approval and is logged with instant Undo.
            </p>
          </div>
          {clips.length > 0 && (
            <span className="muted" style={{ fontSize: 12 }}>
              {clips.filter((c) => c.used_in_project_id).length} locked to projects
            </span>
          )}
        </div>

        {clips.length === 0 ? (
          <div className="card" style={{ padding: 30, textAlign: "center", background: "var(--bg)" }}>
            <Film size={28} style={{ color: "var(--muted)", margin: "0 auto 8px" }} aria-hidden />
            <h3 style={{ margin: 0, fontSize: 15 }}>No clips scanned yet</h3>
            <p className="muted" style={{ margin: "4px 0 0", fontSize: 13 }}>
              Enter a folder path above and click Scan &amp; classify to begin.
            </p>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th style={{ width: 100 }}>Preview</th>
                <th>Current name</th>
                <th>AI label &amp; suggested name</th>
                <th>Type</th>
                <th>Duration</th>
                <th>Project lock</th>
                <th style={{ textAlign: "right" }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {clips.map((clip) => {
                const typeInfo = clip.clip_type ? CLIP_TYPE_LABELS[clip.clip_type] : CLIP_TYPE_LABELS.unknown;
                const isLocked = clip.used_in_project_id !== null;
                const currentEdit = editingNames[clip.id] ?? clip.suggested_name ?? clip.current_name;
                const hasSuggestion = clip.suggested_name && clip.suggested_name !== clip.current_name;

                return (
                  <tr key={clip.id}>
                    {/* Thumbnail preview */}
                    <td>
                      <div
                        style={{
                          width: 88,
                          height: 52,
                          backgroundColor: "var(--surface-muted, #1a2233)",
                          borderRadius: 4,
                          overflow: "hidden",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          border: "1px solid var(--line-soft)",
                        }}
                      >
                        {clip.frame_path ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={`/api/footage/${clip.id}/frame`}
                            alt={clip.current_name}
                            style={{ width: "100%", height: "100%", objectFit: "cover" }}
                            loading="lazy"
                          />
                        ) : (
                          <PlaySquare size={20} style={{ color: "var(--muted)" }} />
                        )}
                      </div>
                    </td>

                    {/* Current filename */}
                    <td>
                      <span style={{ fontWeight: 600, fontSize: 13.5 }}>{clip.current_name}</span>
                      {clip.renamed_at && (
                        <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>
                          Renamed from {clip.original_name}
                        </div>
                      )}
                    </td>

                    {/* AI Label & Proposed rename input */}
                    <td>
                      {clip.ai_label && (
                        <div style={{ fontSize: 12, fontWeight: 500, color: "var(--fg)", marginBottom: 4 }}>
                          {clip.ai_label}
                        </div>
                      )}
                      {!isLocked ? (
                        <input
                          value={currentEdit}
                          onChange={(e) => handleNameChange(clip.id, e.target.value)}
                          aria-label={`Proposed name for ${clip.current_name}`}
                          style={{
                            fontSize: 12.5,
                            width: "100%",
                            maxWidth: 320,
                            padding: "4px 8px",
                            borderColor: hasSuggestion ? "var(--accent)" : "var(--line)",
                          }}
                        />
                      ) : (
                        <span className="muted" style={{ fontSize: 12 }}>
                          {clip.current_name}
                        </span>
                      )}
                    </td>

                    {/* Type badge */}
                    <td>
                      <span
                        className="badge"
                        style={{
                          backgroundColor: `color-mix(in srgb, ${typeInfo.colour} 15%, transparent)`,
                          color: typeInfo.colour,
                          borderColor: `color-mix(in srgb, ${typeInfo.colour} 40%, transparent)`,
                          fontSize: 11.5,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {typeInfo.label}
                      </span>
                    </td>

                    {/* Duration & Resolution */}
                    <td className="muted" style={{ fontSize: 12.5, whiteSpace: "nowrap" }}>
                      {formatDuration(clip.duration_s)}
                      {clip.resolution && <div style={{ fontSize: 11 }}>{clip.resolution}</div>}
                    </td>

                    {/* Project assignment & Lock */}
                    <td>
                      {isLocked ? (
                        <span
                          className="row"
                          style={{ gap: 4, color: "var(--warn)", fontSize: 12, fontWeight: 600 }}
                          title="Locked because it is assigned to an editing project"
                        >
                          <Lock size={12} /> Project #{clip.used_in_project_id}
                        </span>
                      ) : (
                        <ToastForm
                          action={assignClipToProjectAction}
                          success="Clip assigned to project"
                          style={{ margin: 0 }}
                        >
                          <input type="hidden" name="clipId" value={clip.id} />
                          <select
                            name="projectId"
                            defaultValue=""
                            aria-label="Assign to project"
                            onChange={(e) => {
                              if (e.target.value) e.currentTarget.form?.requestSubmit();
                            }}
                            style={{ fontSize: 12, padding: "2px 6px" }}
                          >
                            <option value="">Unassigned</option>
                            {projects.map((p) => (
                              <option key={p.id} value={p.id}>
                                #{p.id} {p.idea.slice(0, 24)}…
                              </option>
                            ))}
                          </select>
                        </ToastForm>
                      )}
                    </td>

                    {/* Approve Rename button */}
                    <td style={{ textAlign: "right" }}>
                      {!isLocked ? (
                        <ToastForm
                          action={applyRenameAction}
                          success={`Renamed to ${currentEdit}`}
                          style={{ display: "inline-block", margin: 0 }}
                        >
                          <input type="hidden" name="clipId" value={clip.id} />
                          <input type="hidden" name="newName" value={currentEdit} />
                          <button
                            className="secondary"
                            disabled={currentEdit === clip.current_name}
                            style={{
                              padding: "4px 10px",
                              fontSize: 12,
                              fontWeight: 600,
                            }}
                          >
                            <Check size={13} aria-hidden /> Approve
                          </button>
                        </ToastForm>
                      ) : (
                        <span className="muted" style={{ fontSize: 12 }} title="Cannot rename a project clip">
                          Locked
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      {/* Undo Log & Rename History */}
      {renames.length > 0 && (
        <section className="card" style={{ padding: 18 }}>
          <div className="row" style={{ gap: 8, marginBottom: 12 }}>
            <Undo2 size={16} style={{ color: "var(--accent)" }} aria-hidden />
            <h3 style={{ margin: 0, fontSize: 15 }}>Recent renames &amp; undo log</h3>
          </div>

          <div className="stack" style={{ gap: 8 }}>
            {renames.slice(0, 10).map((r) => (
              <div
                key={r.id}
                className="row-between card"
                style={{
                  padding: "8px 12px",
                  background: "var(--bg)",
                  fontSize: 13,
                  opacity: r.undone_at ? 0.6 : 1,
                }}
              >
                <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
                  <span className="muted">{new Date(r.created_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</span>
                  <span style={{ textDecoration: r.undone_at ? "line-through" : "none" }}>
                    <b>{r.old_name}</b> → <span style={{ color: "var(--accent)" }}>{r.new_name}</span>
                  </span>
                  {r.undone_at && <span className="badge tone-neutral">Undone</span>}
                </div>

                {!r.undone_at && (
                  <ToastForm action={undoRenameAction} success={`Reverted back to ${r.old_name}`} style={{ margin: 0 }}>
                    <input type="hidden" name="renameId" value={r.id} />
                    <button className="link" style={{ fontSize: 12, color: "var(--accent)" }}>
                      Undo rename
                    </button>
                  </ToastForm>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
