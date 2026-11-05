"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { AlertCircle, ArrowLeft, Check, ChevronDown, CircleDot, Loader } from "lucide-react";
import { FLOWCHART_THEMES, PNG_SCALES, THEME_LABELS, TITLE_MAX, type FlowchartTheme, type PngScale } from "@/lib/flowchartMath";
import type { SaveState } from "./useAutosave";

export function SaveStatus({ state }: { state: SaveState }) {
  const shown = {
    saved: { icon: <Check size={14} aria-hidden />, text: "Saved", tone: "good" },
    unsaved: { icon: <CircleDot size={14} aria-hidden />, text: "Unsaved changes", tone: "warn" },
    saving: { icon: <Loader size={14} aria-hidden />, text: "Saving…", tone: "quiet" },
    refused: { icon: <AlertCircle size={14} aria-hidden />, text: "Not saved", tone: "bad" },
    failed: { icon: <AlertCircle size={14} aria-hidden />, text: "Not saved, retrying", tone: "bad" },
    conflict: { icon: <AlertCircle size={14} aria-hidden />, text: "Not saved", tone: "bad" },
  }[state.status];
  return <span className={`fc-status fc-status-${shown.tone}`} role="status">{shown.icon}{shown.text}</span>;
}

function ExportMenu({ onSvg, onPng, onCopy }: { onSvg: () => void; onPng: (s: PngScale) => void; onCopy: () => void }) {
  const menu = useRef<HTMLDetailsElement>(null);
  const close = () => { if (menu.current) menu.current.open = false; };
  useEffect(() => {
    const onDown = (e: PointerEvent) => { if (!menu.current?.contains(e.target as Node)) close(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("pointerdown", onDown); document.removeEventListener("keydown", onKey); };
  }, []);
  const item = (label: string, run: () => void) => (
    <button key={label} type="button" role="menuitem" className="fc-menu-item" onClick={() => { close(); run(); }}>{label}</button>
  );
  return (
    <details ref={menu} className="fc-menu">
      <summary>Export <ChevronDown size={15} aria-hidden /></summary>
      <div className="fc-menu-list" role="menu">
        {item("Download SVG", onSvg)}
        {PNG_SCALES.map((s) => item(`Download PNG ${s}x`, () => onPng(s)))}
        {item("Copy Mermaid code", onCopy)}
      </div>
    </details>
  );
}

export default function Toolbar({ title, onTitle, theme, onTheme, state, onSvg, onPng, onCopy }: {
  title: string; onTitle: (t: string) => void; theme: FlowchartTheme; onTheme: (t: FlowchartTheme) => void; state: SaveState;
  onSvg: () => void; onPng: (s: PngScale) => void; onCopy: () => void;
}) {
  return (
    <div className="fc-toolbar">
      <Link href="/flowcharts" className="fc-back" aria-label="Back to Flowcharts" title="Back to Flowcharts"><ArrowLeft size={18} aria-hidden /></Link>
      <input className="fc-title" value={title} maxLength={TITLE_MAX} aria-label="Flowchart title" placeholder="Give it a title" onChange={(e) => onTitle(e.target.value)} />
      <SaveStatus state={state} />
      <div className="fc-toolbar-end">
        <label className="fc-theme"><span className="field-label">Theme</span>
          <select value={theme} onChange={(e) => onTheme(e.target.value as FlowchartTheme)}>
            {FLOWCHART_THEMES.map((t) => <option key={t} value={t}>{THEME_LABELS[t]}</option>)}
          </select>
        </label>
        <ExportMenu onSvg={onSvg} onPng={onPng} onCopy={onCopy} />
      </div>
    </div>
  );
}
