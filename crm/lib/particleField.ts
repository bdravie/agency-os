// The drifting dots behind the dashboard hero (BRAND_SHEET.md section 5). Plain canvas, no library.
// It is decoration only and scoped strictly to the dashboard hero.
// 15% more particles, moving 0.1x faster, with interactive orange accent response to mouse movement.

type Dot = {
  x: number;
  y: number;
  r: number;
  rise: number;
  sway: number;
  phase: number;
  alpha: number;
  coral: boolean;
  halo?: number;
};

const rand = (min: number, max: number) => min + Math.random() * (max - min);

/** How many dots suit an area: 15% more than default, bounded between 12 and 51. */
export function dotCount(width: number, height: number): number {
  return Math.max(12, Math.min(51, Math.round(((width * height) / 11_000) * 1.15)));
}

/** Starts the drift on a canvas and returns the function that stops it and removes every listener. */
export function startParticles(canvas: HTMLCanvasElement): () => void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return () => {};
  const still = window.matchMedia("(prefers-reduced-motion: reduce)");
  let width = 0, height = 0, dots: Dot[] = [], frame = 0, last = 0, seen = true;
  let cream = "", coral = "";

  // Mouse interaction state (strictly on the dashboard hero container)
  let pointerX: number | null = null;
  let pointerY: number | null = null;
  let pointerActive = false;

  const heroEl = canvas.parentElement;

  const onPointerMove = (e: PointerEvent) => {
    if (!heroEl) return;
    const rect = heroEl.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    pointerX = x;
    pointerY = y;
    pointerActive = true;
    heroEl.style.setProperty("--mouse-x", `${x}px`);
    heroEl.style.setProperty("--mouse-y", `${y}px`);
    heroEl.style.setProperty("--mouse-active", "1");
  };

  const onPointerLeave = () => {
    pointerX = null;
    pointerY = null;
    pointerActive = false;
    heroEl?.style.setProperty("--mouse-active", "0");
  };

  const readColours = () => {
    const s = getComputedStyle(canvas);
    cream = s.getPropertyValue("--text").trim() || "#f4ede0";
    coral = s.getPropertyValue("--accent").trim() || "#ff6b5b";
  };

  // Particles move 0.1x (10%) faster: rise between 5.5 and 14.3, sway between 4.4 and 13.2
  const makeDot = (anywhere: boolean): Dot => ({
    x: rand(0, width),
    y: anywhere ? rand(0, height) : height + rand(4, 30),
    r: rand(0.7, 2.2),
    rise: rand(5.5, 14.3),
    sway: rand(4.4, 13.2),
    phase: rand(0, Math.PI * 2),
    alpha: rand(0.16, 0.52),
    coral: Math.random() < 0.32,
    halo: 0,
  });

  const resize = () => {
    const box = canvas.getBoundingClientRect();
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    width = box.width;
    height = box.height;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    dots = Array.from({ length: dotCount(width, height) }, () => makeDot(true));
    readColours();
    draw(0);
  };

  const draw = (t: number) => {
    ctx.clearRect(0, 0, width, height);

    // Interactive orange accent spotlight following the mouse pointer
    if (pointerActive && pointerX !== null && pointerY !== null) {
      const glow = ctx.createRadialGradient(pointerX, pointerY, 0, pointerX, pointerY, 150);
      glow.addColorStop(0, coral);
      glow.addColorStop(0.35, "rgba(255, 107, 91, 0.18)");
      glow.addColorStop(1, "transparent");
      ctx.save();
      ctx.globalAlpha = 0.28;
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(pointerX, pointerY, 150, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    for (const d of dots) {
      const swayNow = Math.sin(t / 3090 + d.phase) * d.sway;
      const x = d.x + swayNow;
      const y = d.y;

      let alpha = d.alpha * (0.7 + 0.3 * Math.sin(t / 2360 + d.phase));
      if (d.coral && d.halo && d.halo > 0) {
        alpha = Math.min(1, alpha + d.halo * 0.6);
        ctx.save();
        ctx.beginPath();
        ctx.arc(x, y, d.r + d.halo * 5, 0, Math.PI * 2);
        ctx.fillStyle = coral;
        ctx.globalAlpha = d.halo * 0.35;
        ctx.fill();
        ctx.restore();
      }

      ctx.globalAlpha = alpha;
      ctx.fillStyle = d.coral ? coral : cream;
      ctx.beginPath();
      ctx.arc(x, y, d.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  };

  const tick = (t: number) => {
    frame = requestAnimationFrame(tick);
    const gap = t - last;
    if (gap < 33) return;
    last = t;
    const dt = Math.min(gap, 100) / 1000;

    dots = dots.map((d) => {
      let nextX = d.x;
      let nextY = d.y - d.rise * dt;
      let halo = d.halo ?? 0;

      // Mouse proximity: particles organically avoid the pointer
      if (pointerActive && pointerX !== null && pointerY !== null) {
        const curX = d.x + Math.sin(t / 3090 + d.phase) * d.sway;
        const curY = d.y;
        const dx = curX - pointerX;
        const dy = curY - pointerY;
        const dist = Math.hypot(dx, dy);
        const avoidRadius = 140;

        if (dist < avoidRadius && dist > 0.01) {
          const force = (1 - dist / avoidRadius);
          const push = force * force * 50;
          nextX += (dx / dist) * push * dt * 3.5;
          nextY += (dy / dist) * push * dt * 2.8;
          if (d.coral) halo = force;
        } else if (halo > 0) {
          halo = Math.max(0, halo - dt * 2.5);
        }
      } else if (halo > 0) {
        halo = Math.max(0, halo - dt * 2.5);
      }

      if (nextY < -6) return makeDot(false);
      return { ...d, x: nextX, y: nextY, halo };
    });

    draw(t);
  };

  const stop = () => {
    cancelAnimationFrame(frame);
    frame = 0;
  };

  const sync = () => {
    const run = seen && !document.hidden && !still.matches;
    if (run && !frame) {
      last = performance.now();
      frame = requestAnimationFrame(tick);
    }
    if (!run) stop();
  };

  const sizes = new ResizeObserver(resize);
  sizes.observe(canvas);
  const view = new IntersectionObserver(([e]) => {
    seen = e.isIntersecting;
    sync();
  });
  view.observe(canvas);
  const theme = new MutationObserver(() => {
    readColours();
    draw(last);
  });
  theme.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

  document.addEventListener("visibilitychange", sync);
  still.addEventListener("change", sync);

  if (heroEl) {
    heroEl.addEventListener("pointermove", onPointerMove, { passive: true });
    heroEl.addEventListener("pointerleave", onPointerLeave, { passive: true });
  }

  resize();
  sync();

  return () => {
    stop();
    sizes.disconnect();
    view.disconnect();
    theme.disconnect();
    document.removeEventListener("visibilitychange", sync);
    still.removeEventListener("change", sync);
    if (heroEl) {
      heroEl.removeEventListener("pointermove", onPointerMove);
      heroEl.removeEventListener("pointerleave", onPointerLeave);
    }
  };
}
