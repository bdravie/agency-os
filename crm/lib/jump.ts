// Scroll to a section of the page, open any collapsed section it sits in, and flash it so the eye finds it.
// Client-side only. Returns false when the element isn't on the page.

const COMPANY_TAB: Record<string, string> = {
  website: "overview", filings: "overview", compliance: "overview", notes: "overview", tasks: "overview",
  offer: "research",
  contacts: "people", "decision-makers": "people", "paste-decision-makers": "people",
  outreach: "outreach", "log-activity": "outreach",
  deals: "deals", calls: "deals", meetings: "deals", audit: "deals",
  activity: "activity",
};

const DEAL_TAB: Record<string, string> = {
  details: "overview", company: "overview", tasks: "overview", note: "overview",
  offers: "offers", quotes: "offers",
  calls: "calls", audit: "calls",
  activity: "activity", history: "activity",
};

export function tabForSection(pathname: string, id: string, fallback?: string): string | null {
  const key = id.startsWith("contact-") ? "contacts" : id.startsWith("deal-") ? "deals" : id;
  if (/^\/companies\/\d+$/.test(pathname)) return COMPANY_TAB[key] ?? (fallback ? COMPANY_TAB[fallback] : null) ?? null;
  if (/^\/deals\/\d+$/.test(pathname)) return DEAL_TAB[key] ?? (fallback ? DEAL_TAB[fallback] : null) ?? null;
  return null;
}

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
