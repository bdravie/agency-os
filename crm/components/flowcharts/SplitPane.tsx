"use client";

import { useRef, useState } from "react";

const MIN = 20, MAX = 80, KEY = "flowchart-split";
const clamp = (n: number) => Math.min(MAX, Math.max(MIN, n));

// Two panes with a divider that drags (or moves with the arrow keys). Stacked on a narrow screen by the CSS, where the divider is hidden.
export default function SplitPane({ left, right }: { left: React.ReactNode; right: React.ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  // This only ever runs in the browser (the workspace is not rendered on the server), so the saved width is there on the first draw.
  const [percent, setPercent] = useState(() => clamp(Number(localStorage.getItem(KEY)) || 42));
  const [dragging, setDragging] = useState(false);
  const move = (p: number) => {
    const next = clamp(p);
    setPercent(next);
    localStorage.setItem(KEY, String(Math.round(next)));
  };

  return (
    <div ref={box} className={`fc-split${dragging ? " dragging" : ""}`} style={{ "--fc-left": `${percent}%` } as React.CSSProperties}>
      <div className="fc-pane fc-pane-left">{left}</div>
      <div
        className="fc-divider"
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize the code and diagram panes"
        aria-valuenow={Math.round(percent)}
        aria-valuemin={MIN}
        aria-valuemax={MAX}
        tabIndex={0}
        onPointerDown={(e) => { setDragging(true); e.currentTarget.setPointerCapture(e.pointerId); }}
        onPointerMove={(e) => {
          if (!dragging || !box.current) return;
          const r = box.current.getBoundingClientRect();
          move(((e.clientX - r.left) / r.width) * 100);
        }}
        onPointerUp={() => setDragging(false)}
        onPointerCancel={() => setDragging(false)}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft") { e.preventDefault(); move(percent - 3); }
          if (e.key === "ArrowRight") { e.preventDefault(); move(percent + 3); }
        }}
      />
      <div className="fc-pane fc-pane-right">{right}</div>
    </div>
  );
}
