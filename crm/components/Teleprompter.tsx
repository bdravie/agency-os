"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { ArrowLeft, ArrowRight, Check, Maximize2, Minus, Pause, Play, Plus } from "lucide-react";
import { moveContent } from "@/lib/actions";
import { clampFont, clampSpeed, nextIndex, type ParsedScript } from "@/lib/filmMath";
import { useToast } from "./Toast";

export type FilmItem = { id: number; idea: string; hook: string | null; hookAlt: string | null; caption: string | null; keyword: string | null; parsed: ParsedScript };

// Film from here: large text that scrolls at your pace, with the shot list and hooks beside it.
// Space pauses, left and right arrows move between scripts, up and down change the speed, + and - change the size, R restarts.
export default function Teleprompter({ items: initial }: { items: FilmItem[] }) {
  const toast = useToast();
  const [items, setItems] = useState(initial);
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(40);
  const [font, setFont] = useState(52);
  const [pending, start] = useTransition();
  const box = useRef<HTMLDivElement>(null);
  const reader = useRef<HTMLDivElement>(null);
  const item = items[i];

  const restart = useCallback(() => { if (reader.current) reader.current.scrollTop = 0; }, []);
  const go = useCallback((dir: 1 | -1) => { setI((n) => nextIndex(n, dir, items.length)); setPlaying(false); }, [items.length]);
  useEffect(restart, [i, restart]);

  // the scroll: speed is pixels a second, so it feels the same on any screen
  useEffect(() => {
    if (!playing) return;
    let last = performance.now(), frame = 0, carry = 0;
    const tick = (now: number) => {
      const el = reader.current;
      if (el) {
        carry += (speed * (now - last)) / 1000;
        const whole = Math.floor(carry);
        if (whole > 0) { el.scrollTop += whole; carry -= whole; }
        if (el.scrollTop + el.clientHeight >= el.scrollHeight - 2) { setPlaying(false); return; }
      }
      last = now;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, speed]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, select")) return;
      if (e.key === " ") { e.preventDefault(); setPlaying((p) => !p); }
      else if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
      else if (e.key === "ArrowUp") { e.preventDefault(); setSpeed((s) => clampSpeed(s + 10)); }
      else if (e.key === "ArrowDown") { e.preventDefault(); setSpeed((s) => clampSpeed(s - 10)); }
      else if (e.key === "+" || e.key === "=") setFont((f) => clampFont(f + 4));
      else if (e.key === "-") setFont((f) => clampFont(f - 4));
      else if (e.key.toLowerCase() === "r") { restart(); setPlaying(false); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, restart]);

  function filmed() {
    if (!item) return;
    start(async () => {
      try {
        await moveContent(item.id, "Filmed");
        toast("Marked as filmed");
        setItems((list) => list.filter((x) => x.id !== item.id));
        setI((n) => Math.min(n, Math.max(0, items.length - 2)));
        setPlaying(false);
      } catch (e) { toast(e instanceof Error ? e.message : "Could not mark it filmed", "bad"); }
    });
  }

  if (!item) {
    return (
      <div className="card stack" style={{ textAlign: "center", padding: 40 }}>
        <h2>Everything scripted has been filmed</h2>
        <p className="muted">Select up to 5 ideas on the Content page and press Script to write the next batch.</p>
        <div><Link href="/content" className="btn">Back to Content</Link></div>
      </div>
    );
  }
  return (
    <div ref={box} className="film" style={{ background: "var(--bg)" }}>
      <div className="film-bar">
        <span><b>{i + 1}</b> of {items.length}: {item.idea}</span>
        <span className="row" style={{ gap: 6, flexWrap: "wrap" }}>
          <button className="secondary" onClick={() => go(-1)} disabled={i === 0} aria-label="Previous script"><ArrowLeft size={15} aria-hidden /></button>
          <button onClick={() => setPlaying((p) => !p)} aria-label={playing ? "Pause" : "Play"}>{playing ? <Pause size={15} aria-hidden /> : <Play size={15} aria-hidden />} {playing ? "Pause" : "Play"}</button>
          <button className="secondary" onClick={() => go(1)} disabled={i === items.length - 1} aria-label="Next script"><ArrowRight size={15} aria-hidden /></button>
          <span className="row" style={{ gap: 4 }} aria-label="Speed">Speed <button className="secondary" onClick={() => setSpeed((s) => clampSpeed(s - 10))} aria-label="Slower"><Minus size={14} aria-hidden /></button><b>{speed}</b><button className="secondary" onClick={() => setSpeed((s) => clampSpeed(s + 10))} aria-label="Faster"><Plus size={14} aria-hidden /></button></span>
          <span className="row" style={{ gap: 4 }} aria-label="Text size">Size <button className="secondary" onClick={() => setFont((f) => clampFont(f - 4))} aria-label="Smaller"><Minus size={14} aria-hidden /></button><b>{font}</b><button className="secondary" onClick={() => setFont((f) => clampFont(f + 4))} aria-label="Larger"><Plus size={14} aria-hidden /></button></span>
          <button className="secondary" onClick={() => box.current?.requestFullscreen?.()} aria-label="Full screen"><Maximize2 size={15} aria-hidden /></button>
          <button disabled={pending} onClick={filmed}><Check size={15} aria-hidden /> Mark filmed</button>
        </span>
      </div>
      <div className="film-body">
        <div ref={reader} className="film-reader" tabIndex={0} aria-label="Script">
          <div style={{ fontSize: font, lineHeight: 1.45, padding: "40vh 6% 60vh", whiteSpace: "pre-wrap", maxWidth: 1100, margin: "0 auto" }}>{item.parsed.script || "(This script is empty. Write it on the Content page.)"}</div>
        </div>
        <aside className="film-side" aria-label="Shot list and hooks">
          <h3>Say first</h3>
          <p><b>A:</b> {item.hook ?? "–"}</p>
          {item.hookAlt && <p><b>B:</b> {item.hookAlt}</p>}
          {item.hookAlt && <p className="muted">Post one version with hook A and another with hook B, then record which was used when you mark it posted.</p>}
          {item.parsed.onScreen.length > 0 && (<><h3>On screen and shot list</h3><ul className="fx-bullets">{item.parsed.onScreen.map((t, k) => <li key={k}>{t}</li>)}</ul></>)}
          {item.caption && (<><h3>Caption</h3><p style={{ whiteSpace: "pre-wrap" }}>{item.caption}</p></>)}
          {item.keyword && <p>Keyword: <b>{item.keyword}</b></p>}
          <p className="muted">Space: play or pause · ← →: previous or next · ↑ ↓: speed · + −: size · R: restart</p>
        </aside>
      </div>
    </div>
  );
}
