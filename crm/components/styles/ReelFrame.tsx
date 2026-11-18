import type { CSSProperties, ReactNode } from "react";
import { Inter_Tight, Instrument_Serif } from "next/font/google";
import { isDrawn, type DrawnKey, type Layout, type Safe } from "@/lib/editStylesMath";
import { reelVars } from "@/lib/reelsBrand";

// One function draws a 9:16 reel frame for the element cards, the template strips and the project page, so a template looks exactly like
// the elements it is made of. Everything is HTML and CSS (app/content/styles.css): no video, no images, nothing fetched.
// Sizes are the brand sheet's own pixels on a 1080-wide frame, scaled to whatever width the frame is given.
// The still state is the finished look; the motion plays only while a card is hovered, focused or "Play all" is on, and never under "reduce motion".

const sans = Inter_Tight({ subsets: ["latin"], weight: ["600", "700"], display: "swap", variable: "--font-reel" });
const serif = Instrument_Serif({ subsets: ["latin"], weight: "400", display: "swap", variable: "--font-reel-serif" });

const FX = ["slow_push", "hard_cut", "slide_blur", "speed_match"] as const;

function Screen({ spot, blur }: { spot?: boolean; blur?: boolean }) {
  return (
    <div className={`rf-ui${spot ? " spot" : ""}${blur ? " blur" : ""}`}>
      <i className="rf-ui-bar" />
      <b className="rf-ui-h" />
      {[0, 1, 2].map((n) => <span key={n} className={`rf-ui-row${n === 1 ? " mid" : ""}`}><i /><em /></span>)}
      <u className="rf-ui-btn" />
    </div>
  );
}

function Person() {
  return <div className="rf-person"><i className="rf-head" /><i className="rf-body" /></div>;
}

function Background({ layout, spot, blur }: { layout: Layout; spot: boolean; blur: boolean }) {
  if (layout === "face" || layout === "punch") return <div className="rf-bg"><Person /></div>;
  if (layout === "over_shoulder") return <div className="rf-bg"><div className="rf-laptop"><Screen spot={spot} blur={blur} /><i className="rf-base" /></div><i className="rf-hand" /></div>;
  if (layout === "screen_card") return <div className="rf-bg"><div className="rf-card"><Screen spot={spot} blur={blur} /></div></div>;
  if (layout === "broll") return <div className="rf-bg"><i className="rf-sun" /><i className="rf-roof" /><i className="rf-roof two" /></div>;
  return <div className="rf-bg" />;
}

const Words = ({ words, cls }: { words: [string, boolean?][]; cls: string }) => (
  <span className={cls}>{words.map(([w, key], i) => <span key={i} className={`rf-w${key ? " key" : ""}`} style={{ "--i": i } as CSSProperties}>{w}</span>)}</span>
);

// Bar heights (percent) for the four sounds: a steady bed, a swoosh that rises and falls, one thin tick, one low thud.
const METER: Record<string, { bars: number[]; db: string }> = {
  music_bed: { bars: [22, 30, 26, 34, 24, 30, 20, 28, 32, 24, 30, 26, 22, 30, 60, 74], db: "-18 dB" },
  swoosh: { bars: [6, 10, 18, 30, 46, 64, 78, 64, 46, 30, 18, 10, 6, 4, 4, 4], db: "-22 dB" },
  tick: { bars: [4, 4, 4, 4, 4, 4, 82, 16, 4, 4, 4, 4, 4, 4, 4, 4], db: "-20 dB" },
  thud: { bars: [4, 4, 4, 4, 90, 96, 70, 44, 24, 12, 6, 4, 4, 4, 4, 4], db: "-16 dB" },
};
const Meter = ({ kind }: { kind: string }) => (
  <div className={`rf-meter m-${kind}`}>
    <span className="rf-db">{METER[kind].db}</span>
    <span className="rf-bars">{METER[kind].bars.map((h, i) => <i key={i} style={{ height: `${h}%`, "--i": i } as CSSProperties} />)}</span>
  </div>
);

// Typed against DrawnKey: adding a key to DRAWN without a drawing here is a type error. Layouts and the four shot effects are drawn by the background.
const OVERLAY: Record<DrawnKey, (() => ReactNode) | null> = {
  face: null, over_shoulder: null, screen_card: null, punch: null,
  slow_push: () => <span className="rf-chip low">Push in 4 to 8%</span>,
  hard_cut: () => <span className="rf-chip low">Cut every pause over 0.2s</span>,
  slide_blur: () => <div className="rf-next"><i className="rf-ui-h" /><i className="rf-ui-h short" /></div>,
  speed_match: () => (
    <div className="rf-tracks">
      <span><em>Voice</em><b className="rf-track voice">{[0, 1, 2, 3, 4, 5, 6, 7, 8].map((n) => <i key={n} />)}</b></span>
      <span><em>Footage</em><b className="rf-track foot"><i /><i /><i /></b></span>
      <u className="rf-speed">1.6x</u>
    </div>
  ),
  redaction: () => <span className="rf-chip low">Figures and emails blurred</span>,
  hook_title: () => <div className="rf-hook"><span>Copy this quote page</span><span>for your roofing company</span><i className="rf-tape" /></div>,
  spoken_hook: () => <div className="rf-spoken"><Words cls="rf-spoken-l" words={[["I"], ["Clauded"]]} /><Words cls="rf-spoken-l two" words={[["so"], ["hard", true]]} /></div>,
  site_captions: () => <div className="rf-cap"><Words cls="rf-cap-l" words={[["get"], ["your"], ["price", true]]} /></div>,
  chapter_title: () => <div className="rf-chapter"><b>1. Quote page</b><span>A price before they call</span></div>,
  progress_bar: () => <i className="rf-progress" />,
  step_plate: () => <div className="rf-step"><i className="rf-ruler" /><em><b>Step 02</b> · The price</em><strong>Three real prices</strong></div>,
  callout_pill: () => <div className="rf-pill"><i>✓</i>We cover SE9</div>,
  spotlight: null,
  tape_counter: () => <div className="rf-counter"><i className="rf-ruler" /><b className="rf-num" /><span>local reviews</span></div>,
  job_ticket: () => <div className="rf-ticket">{["Enquiry answered", "Details taken", "Visit booked"].map((t, i) => <span key={t} style={{ "--i": i } as CSSProperties}><i>✓</i>{t}</span>)}</div>,
  payoff_slam: () => <div className="rf-slam"><span className="rf-old">Not a lead<i /></span><strong>A booked job.</strong></div>,
  end_plate: () => <div className="rf-end"><span>DM me</span><b>ROOF</b></div>,
  music_bed: () => <Meter kind="music_bed" />,
  swoosh: () => <Meter kind="swoosh" />,
  tick: () => <Meter kind="tick" />,
  thud: () => <Meter kind="thud" />,
  broll: () => <span className="rf-chip low">Generated clip · 5s · sound off</span>,
  kinetic_type: () => <div className="rf-kinetic"><span>Hours back.</span><span className="key">Every week.</span><span>No extra staff.</span></div>,
  logo_sting: () => <div className="rf-logo"><i /><Words cls="rf-logo-w" words={[["Y"], ["o"], ["u"], ["r"], ["\u00a0"], ["l"], ["o"], ["g"], ["o"]]} /></div>,
  stat_card: () => <div className="rf-stat"><b className="rf-num" /><span>local reviews</span><i className="rf-statbar" /></div>,
};

export default function ReelFrame({ layout, elements, label }: { layout: Layout; elements: string[]; label?: string }) {
  const keys = elements.filter(isDrawn);
  const fx = keys.filter((k) => (FX as readonly string[]).includes(k)).map((k) => `fx-${k}`).join(" ");
  // Captions sit higher over a face than under a screen, and are ink on a chalk plate (the brand sheet's two caption lines).
  const cap = layout === "face" || layout === "punch" || layout === "broll" ? "cap-face" : "cap-screen";
  return (
    <div className={`rf ${sans.variable} ${serif.variable}`} style={reelVars() as CSSProperties} role="img" aria-label={label ?? "Preview of a reel frame"}>
      <div className={`rf-in rf-${layout} ${cap} ${fx}`}>
        <Background layout={layout} spot={keys.includes("spotlight")} blur={keys.includes("redaction")} />
        {keys.map((k) => { const draw = OVERLAY[k]; return draw ? <div key={k} className="rf-layer">{draw()}</div> : null; })}
      </div>
    </div>
  );
}

const u = (n: number) => `calc(var(--u) * ${n})`;

/** The safe zones on a 1080 x 1920 frame (Rules view): where Instagram's own buttons sit, and the two caption lines. Drawn from the yaml's numbers. */
export function SafeFrame({ safe }: { safe: Safe }) {
  return (
    <div className={`rf ${sans.variable} ${serif.variable}`} style={reelVars() as CSSProperties} role="img" aria-label={`Safe zones: keep clear of the top ${safe.top} pixels, the bottom ${safe.bottom} and the right ${safe.rail}`}>
      <div className="rf-in rf-face">
        <Background layout="face" spot={false} blur={false} />
        <i className="rf-zone" style={{ left: 0, right: 0, top: 0, height: u(safe.top) }} />
        <i className="rf-zone" style={{ left: 0, right: 0, bottom: 0, height: u(safe.bottom) }} />
        <i className="rf-zone" style={{ right: 0, width: u(safe.rail), top: u(safe.top), bottom: u(safe.bottom) }} />
        <i className="rf-zone side" style={{ left: 0, width: u(safe.side), top: u(safe.top), bottom: u(safe.bottom) }} />
        <span className="rf-okay" style={{ left: u(safe.side), right: u(safe.rail), top: u(safe.top), bottom: u(safe.bottom) }}>Safe</span>
        <i className="rf-line" style={{ top: u(safe.caption_face) }} />
        <i className="rf-line screen" style={{ top: u(safe.caption_screen) }} />
      </div>
    </div>
  );
}
