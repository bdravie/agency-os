// Pure maths for the diagram preview: fitting, zooming at a point, and the percentage shown.
export type View = { x: number; y: number; k: number };
export const ZOOM_MIN = 0.1, ZOOM_MAX = 8, ZOOM_STEP = 1.25;
const FIT_MAX = 1.5;   // fitting never blows a three-box diagram up to fill the screen

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** Centres the content in the viewport at the biggest scale that shows all of it. */
export function fitView(contentW: number, contentH: number, viewW: number, viewH: number, pad = 24): View {
  if (contentW <= 0 || contentH <= 0 || viewW <= 0 || viewH <= 0) return { x: 0, y: 0, k: 1 };
  const k = clamp(Math.min((viewW - pad * 2) / contentW, (viewH - pad * 2) / contentH), ZOOM_MIN, FIT_MAX);
  return { x: (viewW - contentW * k) / 2, y: (viewH - contentH * k) / 2, k };
}

/** Zooms by `factor`, keeping the point (px, py) of the viewport where it is. */
export function zoomAt(view: View, factor: number, px: number, py: number): View {
  const k = clamp(view.k * factor, ZOOM_MIN, ZOOM_MAX);
  const ratio = k / view.k;
  return { x: px - (px - view.x) * ratio, y: py - (py - view.y) * ratio, k };
}

export const zoomPercent = (view: View) => `${Math.round(view.k * 100)}%`;
