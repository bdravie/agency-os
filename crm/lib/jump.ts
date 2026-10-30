// Scroll to a section of the page, open any collapsed section it sits in, and flash it so the eye finds it.
// Client-side only. Returns false when the element isn't on the page.

export function jumpTo(id: string, fallback?: string): boolean {
  if (id === "top") { window.scrollTo({ top: 0, behavior: "smooth" }); return true; }
  const el = document.getElementById(id) ?? (fallback ? document.getElementById(fallback) : null);
  if (!el) return false;
  for (let p: HTMLElement | null = el; p; p = p.parentElement) if (p instanceof HTMLDetailsElement) p.open = true;
  el.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" });
  el.classList.remove("flash"); void el.offsetWidth;   // restart the animation if it is already running
  el.classList.add("flash");
  window.setTimeout(() => el.classList.remove("flash"), 2200);
  return true;
}
