// The Brad Reels colours (brand sheet approved 3 Nov 2026; tokens.json in AI Video Editor/Brand Sheet). They are the look of the videos,
// not of the CRM, so they live here in one constant and reach the previews as CSS variables on the frame (components/styles/ReelFrame.tsx).
// Nothing else in the CRM may use them: the CRM's own screens use the tokens in app/globals.css.
export const REELS = {
  chalk: "#F4F1EA",      // warm plaster white: plates, pills, screen cards
  site: "#111214",       // near-black: tickets, dark cards
  raised: "#1B1D20",
  hivis: "#FF5A1F",      // the one accent, under 5% of any frame
  hivisInk: "#B83D0B",   // hi-vis as small text on chalk
  go: "#1F9D5C",         // ticks only
  stop: "#D93A3F",       // the payoff strike only
  inkMuted: "#5A636D",
  line: "#E0DACE",
  caption: "#FFFFFF",
} as const;

// Stand-in footage. There is no real video in a preview, so a face, a desk and a sky are drawn in these flat tones.
export const FOOTAGE = { dark: "#23272D", mid: "#3A4049", light: "#5B6470", skin: "#C7A48C", top: "#2F3A48", desk: "#6E5A4B", sky: "#7C8FA6" } as const;

const kebab = (k: string) => k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
/** The colours as CSS variables (--r-chalk, --r-hivis-ink, --f-skin ...), set once on each frame. */
export const reelVars = (): Record<string, string> => ({
  ...Object.fromEntries(Object.entries(REELS).map(([k, v]) => [`--r-${kebab(k)}`, v])),
  ...Object.fromEntries(Object.entries(FOOTAGE).map(([k, v]) => [`--f-${k}`, v])),
});
