"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { TRACES } from "@/lib/brainArt";

// The brain's motion (GSAP core only), layered on top of markup that already works without it (BrainHub):
// - a slow breath on the art and its glow, a heartbeat and ripples on the core;
// - signals leaving the core along the real traces in the art, and the coral nodes sparking;
// - on hovering or focusing a lobe, a burst along that lobe's traces and its preview links sliding in;
// - on touch screens, the first tap on a lobe opens its preview and the second follows the link.
// All looping motion sits inside gsap.matchMedia("(prefers-reduced-motion: no-preference)"), so "reduce motion" leaves the
// still art, and it pauses while the brain is off screen (the browser already stops it in a hidden tab).
// This is the dashboard hero, the one place decorative looping motion is allowed (BRAND_SHEET.md, motion 7).
export default function BrainMotion() {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const root = ref.current?.closest<HTMLElement>("[data-brain]");
    if (!root) return;
    root.classList.add("is-live");
    const lobes = Array.from(root.querySelectorAll<HTMLElement>(".lobe"));
    const q = <T extends Element>(sel: string, scope: ParentNode = root) => Array.from(scope.querySelectorAll<T>(sel));

    // ---- Touch: first tap previews, second tap opens. Works whatever the motion setting. ----
    // Decided by the pointer that pressed (a touch laptop has hover and a touch screen), or a screen with no hover at all.
    const noHover = window.matchMedia("(hover: none)");
    let lastPointer = "";
    const close = (except?: HTMLElement) => {
      lobes.forEach((l) => { if (l !== except) l.classList.remove("is-open"); });
      // A lobe that still holds focus would stay open through :focus-within, so focus leaves it too.
      const active = document.activeElement as HTMLElement | null;
      if (active && active.closest(".lobe") && (!except || !except.contains(active))) active.blur();
    };
    const onHitDown = (e: PointerEvent) => { lastPointer = e.pointerType; };
    const onHitClick = (e: MouseEvent) => {
      const hit = e.currentTarget as HTMLElement;
      const lobe = hit.closest<HTMLElement>(".lobe");
      const touch = lastPointer === "touch" || lastPointer === "pen" || (lastPointer === "" && noHover.matches);
      lastPointer = "";
      if (!lobe || !touch || lobe.classList.contains("is-open")) return;
      e.preventDefault();
      close(lobe);
      lobe.classList.add("is-open");
      hit.focus({ preventScroll: true });
      lobe.dispatchEvent(new CustomEvent("brain:lobe", { bubbles: false }));
    };
    const onDocDown = (e: PointerEvent) => { if (!(e.target as Element).closest?.(".lobe")) close(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    const hits = q<HTMLElement>(".lobe-hit");
    hits.forEach((h) => { h.addEventListener("pointerdown", onHitDown); h.addEventListener("click", onHitClick); });
    document.addEventListener("pointerdown", onDocDown);
    document.addEventListener("keydown", onKey);

    // ---- Motion ----
    const loops: gsap.core.Animation[] = [];
    let visible = true;
    let nextSignal: gsap.core.Tween | null = null;
    const paths = new Map(TRACES.map((t) => [t.key, { el: root.querySelector<SVGPathElement>(`[data-trace="${t.key}"]`), length: t.length, lobes: t.lobes }]));

    const signal = (key: string, opts: { delay?: number; duration?: number; hot?: boolean } = {}) => {
      const p = paths.get(key);
      if (!p?.el) return;
      gsap.fromTo(p.el,
        { attr: { "stroke-dashoffset": 4 }, opacity: 1 },
        { attr: { "stroke-dashoffset": -(p.length + 4) }, duration: opts.duration ?? 1.15, delay: opts.delay ?? 0, ease: "power1.in", overwrite: "auto",
          onStart: () => p.el?.classList.toggle("is-hot", Boolean(opts.hot)) });
    };

    const mm = gsap.matchMedia();
    mm.add("(prefers-reduced-motion: no-preference)", () => {
      const img = root.querySelector(".brain-img");
      const aura = root.querySelector(".brain-aura");
      const face = root.querySelector(".core-face");
      const rings = q<HTMLElement>(".core-ring");

      loops.push(gsap.to(img, { scale: 1.014, duration: 2.8, ease: "sine.inOut", yoyo: true, repeat: -1, transformOrigin: "50% 50%" }));
      loops.push(gsap.fromTo(aura, { opacity: 0.55, scale: 0.97 }, { opacity: 0.95, scale: 1.04, duration: 2.8, ease: "sine.inOut", yoyo: true, repeat: -1 }));
      loops.push(gsap.timeline({ repeat: -1, repeatDelay: 1.5 })
        .to(face, { scale: 1.09, duration: 0.14, ease: "power2.out" })
        .to(face, { scale: 1, duration: 0.24, ease: "power2.in" })
        .to(face, { scale: 1.05, duration: 0.12, ease: "power2.out" })
        .to(face, { scale: 1, duration: 0.45, ease: "power2.out" }));
      rings.forEach((r, i) => loops.push(gsap.fromTo(r, { scale: 1, opacity: 0.75 }, { scale: 2.1, opacity: 0, duration: 2.6, ease: "power1.out", repeat: -1, delay: i * 1.3 })));
      q<SVGCircleElement>(".brain-spark").forEach((s) => loops.push(gsap.to(s, {
        opacity: 0.95, duration: 0.45, ease: "sine.inOut", yoyo: true, repeat: -1,
        repeatDelay: gsap.utils.random(1.6, 4.2), delay: gsap.utils.random(0, 3),
      })));

      // Signals leave the core at an uneven rhythm, so it reads as thinking rather than a metronome.
      const keys = TRACES.map((t) => t.key);
      const tick = () => {
        if (visible) signal(gsap.utils.random(keys));
        nextSignal = gsap.delayedCall(gsap.utils.random(0.45, 1.3), tick);
      };
      tick();

      // A hovered, focused or tapped lobe: a burst along its traces, its sparks flare, its links slide in.
      const burst = (lobe: HTMLElement) => {
        const key = lobe.dataset.lobe;
        TRACES.filter((t) => t.lobes.some((l) => l === key)).forEach((t, i) => signal(t.key, { delay: i * 0.08, duration: 0.7, hot: true }));
        gsap.fromTo(q(`.brain-spark[data-lobe="${key}"]`), { opacity: 1, scale: 1.8, transformOrigin: "50% 50%" }, { opacity: 0, scale: 1, duration: 0.9, ease: "power2.out", stagger: 0.08, overwrite: "auto" });
        const fromLeft = lobe.classList.contains("lobe-tl") || lobe.classList.contains("lobe-bl");
        // Opacity, not autoAlpha: a link hidden with visibility for even a moment cannot take focus, and Tab would skip it.
        gsap.fromTo(q(".peek-link", lobe), { x: fromLeft ? 10 : -10, opacity: 0 }, { x: 0, opacity: 1, duration: 0.32, ease: "power2.out", stagger: 0.04, overwrite: "auto", clearProps: "transform,opacity" });
      };
      const onEnter = (e: Event) => {
        if (e instanceof PointerEvent && e.pointerType !== "mouse") return;   // a touch goes through the tap path above
        const lobe = (e.currentTarget as HTMLElement).closest<HTMLElement>(".lobe");
        if (!lobe || (e.type === "focusin" && lobe.classList.contains("is-open"))) return;   // a tap already burst it
        burst(lobe);
      };
      const onTapOpen = (e: Event) => burst(e.currentTarget as HTMLElement);
      hits.forEach((h) => { h.addEventListener("pointerenter", onEnter); h.addEventListener("focusin", onEnter); });
      lobes.forEach((l) => l.addEventListener("brain:lobe", onTapOpen));

      return () => {
        nextSignal?.kill();
        loops.length = 0;
        hits.forEach((h) => { h.removeEventListener("pointerenter", onEnter); h.removeEventListener("focusin", onEnter); });
        lobes.forEach((l) => l.removeEventListener("brain:lobe", onTapOpen));
      };
    });

    // Off screen: pause the loops and stop new signals.
    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      loops.forEach((a) => (visible ? a.resume() : a.pause()));
    });
    io.observe(root);

    return () => {
      io.disconnect();
      mm.revert();
      hits.forEach((h) => { h.removeEventListener("pointerdown", onHitDown); h.removeEventListener("click", onHitClick); });
      document.removeEventListener("pointerdown", onDocDown);
      document.removeEventListener("keydown", onKey);
      root.classList.remove("is-live");
    };
  }, []);

  return <span ref={ref} hidden />;
}
