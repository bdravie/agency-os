"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { cleanMermaidError, RENDER_DEBOUNCE_MS, type EngineTheme } from "@/lib/flowchartMath";
import { fitView, zoomAt, zoomPercent, ZOOM_STEP, type View } from "@/lib/flowchartViewMath";
import { renderDiagram } from "@/lib/mermaidClient";
import PreviewControls from "./PreviewControls";

export type RenderResult = { code: string; theme: EngineTheme; error: null } | { code: string; theme: EngineTheme; error: string };

// Draws the diagram as the code changes. A failed draw leaves the last good picture on screen and reports the error upwards.
export default function Preview({ code, theme, onResult, canvasRef, failed }: {
  code: string; theme: EngineTheme; onResult: (r: RenderResult) => void; canvasRef: RefObject<HTMLDivElement | null>; failed: boolean;
}) {
  const stage = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View>({ x: 0, y: 0, k: 1 });
  const [drawn, setDrawn] = useState(false);
  const moved = useRef(false);      // once the owner has panned or zoomed, leave their view alone
  const size = useRef({ w: 0, h: 0 });
  const request = useRef(0);
  const first = useRef(true);
  const report = useRef(onResult);
  report.current = onResult;

  const fit = useCallback(() => {
    const c = canvasRef.current;
    if (c) setView(fitView(size.current.w, size.current.h, c.clientWidth, c.clientHeight));
  }, [canvasRef]);

  const fitNow = useCallback(() => { moved.current = false; fit(); }, [fit]);

  useEffect(() => {
    const delay = first.current ? 0 : RENDER_DEBOUNCE_MS;
    first.current = false;
    const timer = setTimeout(async () => {
      const mine = ++request.current;
      if (!code.trim()) { report.current({ code, theme, error: "Type some Mermaid code to draw a diagram." }); return; }
      try {
        const svg = await renderDiagram(code, theme);
        if (mine !== request.current || !stage.current) return;
        stage.current.innerHTML = svg;
        const el = stage.current.querySelector("svg");
        if (el) {
          // Mermaid draws to fit its container; give it a real size so zoom has something steady to scale.
          const box = el.viewBox.baseVal;
          size.current = { w: box?.width || el.getBoundingClientRect().width, h: box?.height || el.getBoundingClientRect().height };
          el.setAttribute("width", String(size.current.w));
          el.setAttribute("height", String(size.current.h));
          el.style.maxWidth = "none";
        }
        setDrawn(true);
        if (!moved.current) fit();
        report.current({ code, theme, error: null });
      } catch (e) {
        if (mine === request.current) report.current({ code, theme, error: cleanMermaidError(e) });
      }
    }, delay);
    return () => clearTimeout(timer);
  }, [code, theme, fit]);

  // Keep it fitted as the pane is dragged or the window resized, until the owner takes over.
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ro = new ResizeObserver(() => { if (!moved.current) fit(); });
    ro.observe(c);
    return () => ro.disconnect();
  }, [canvasRef, fit]);

  // A wheel listener has to be added by hand: React's is passive, so it could not stop the page scrolling.
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      moved.current = true;
      const r = c.getBoundingClientRect();
      setView((v) => zoomAt(v, e.deltaY < 0 ? 1.1 : 1 / 1.1, e.clientX - r.left, e.clientY - r.top));
    };
    c.addEventListener("wheel", onWheel, { passive: false });
    return () => c.removeEventListener("wheel", onWheel);
  }, [canvasRef]);

  const zoomCentre = (factor: number) => {
    const c = canvasRef.current;
    if (!c) return;
    moved.current = true;
    setView((v) => zoomAt(v, factor, c.clientWidth / 2, c.clientHeight / 2));
  };
  const pan = (dx: number, dy: number) => { moved.current = true; setView((v) => ({ ...v, x: v.x + dx, y: v.y + dy })); };

  const drag = useRef<{ x: number; y: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  return (
    <div
      ref={canvasRef}
      className={`fc-canvas${dragging ? " dragging" : ""}`}
      data-theme={theme === "dark" ? "dark" : "light"}   // the tokens follow the diagram, so a dark diagram is never drawn on white, or the other way round
      tabIndex={0}
      role="group"
      aria-label="Diagram preview. Drag or use the arrow keys to pan; plus, minus and 0 to zoom and fit."
      onPointerDown={(e) => {
        if (e.button !== 0 || (e.target as HTMLElement).closest("button")) return;
        drag.current = { x: e.clientX, y: e.clientY };
        setDragging(true);
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (!drag.current) return;
        pan(e.clientX - drag.current.x, e.clientY - drag.current.y);
        drag.current = { x: e.clientX, y: e.clientY };
      }}
      onPointerUp={() => { drag.current = null; setDragging(false); }}
      onPointerCancel={() => { drag.current = null; setDragging(false); }}
      onKeyDown={(e) => {
        const step = e.shiftKey ? 80 : 30;
        const actions: Record<string, () => void> = {
          "+": () => zoomCentre(ZOOM_STEP), "=": () => zoomCentre(ZOOM_STEP), "-": () => zoomCentre(1 / ZOOM_STEP), "0": fitNow,
          ArrowLeft: () => pan(step, 0), ArrowRight: () => pan(-step, 0), ArrowUp: () => pan(0, step), ArrowDown: () => pan(0, -step),
        };
        if (actions[e.key] && (e.target as HTMLElement) === e.currentTarget) { e.preventDefault(); actions[e.key](); }
      }}
    >
      <div ref={stage} className="fc-stage" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})` }} />
      {!drawn && !failed && <p className="fc-canvas-note muted">Drawing…</p>}
      {!drawn && failed && <p className="fc-canvas-note muted">Your diagram will appear here once the code is valid.</p>}
      {drawn && failed && <span className="badge tone-warn fc-stale">Showing the last valid diagram</span>}
      <PreviewControls percent={zoomPercent(view)} onIn={() => zoomCentre(ZOOM_STEP)} onOut={() => zoomCentre(1 / ZOOM_STEP)} onFit={fitNow} />
    </div>
  );
}
