"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { jumpTo } from "@/lib/jump";

// When a page opens with #section in its address (from an activity on another page), scroll to that section.
export default function HashScroll() {
  const path = usePathname();
  useEffect(() => {
    const go = () => { const id = decodeURIComponent(window.location.hash.slice(1)); if (id) jumpTo(id); };
    const t = window.setTimeout(go, 120);   // let the new page render first
    window.addEventListener("hashchange", go);
    return () => { window.clearTimeout(t); window.removeEventListener("hashchange", go); };
  }, [path]);
  return null;
}
