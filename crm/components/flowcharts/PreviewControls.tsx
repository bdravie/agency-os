"use client";

import { Maximize, Minus, Plus } from "lucide-react";

export default function PreviewControls({ percent, onIn, onOut, onFit }: { percent: string; onIn: () => void; onOut: () => void; onFit: () => void }) {
  return (
    <div className="fc-controls" role="group" aria-label="Zoom">
      <button type="button" className="icon-btn" aria-label="Zoom out" title="Zoom out (-)" onClick={onOut}><Minus size={16} aria-hidden /></button>
      <span className="fc-zoom" aria-live="polite">{percent}</span>
      <button type="button" className="icon-btn" aria-label="Zoom in" title="Zoom in (+)" onClick={onIn}><Plus size={16} aria-hidden /></button>
      <button type="button" className="icon-btn" aria-label="Fit to screen" title="Fit to screen (0)" onClick={onFit}><Maximize size={15} aria-hidden /></button>
    </div>
  );
}
