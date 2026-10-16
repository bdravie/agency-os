"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import Sidebar from "./Sidebar";
import CommandPalette from "./CommandPalette";
import { ToastProvider } from "./Toast";

// Sidebar on wide screens; a slide-in drawer with a top bar on narrow ones.
export default function AppShell({ children, demo, signOut }: { children: React.ReactNode; demo: boolean; signOut: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [palette, setPalette] = useState(false);
  const pathname = usePathname();

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test((e.target as HTMLElement)?.tagName ?? "");
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setPalette((p) => !p); }
      else if (e.key === "/" && !typing && !palette) { e.preventDefault(); setPalette(true); }
      else if (e.key === "Escape") { setOpen(false); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [palette]);

  return (
    <ToastProvider>
    <div className="app">
      <a href="#main" className="skip">Skip to content</a>
      <div className="topbar">
        <button type="button" className="icon-btn" aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? <X size={20} /> : <Menu size={20} />}
        </button>
        <strong>Agency OS</strong>
      </div>
      <aside className={`sidebar${open ? " open" : ""}`}>
        <Sidebar demo={demo} signOut={signOut} onSearch={() => { setOpen(false); setPalette(true); }} />
      </aside>
      {open && <div className="scrim" onClick={() => setOpen(false)} aria-hidden />}
      <main id="main" className="main">{children}</main>
      <CommandPalette open={palette} onClose={() => setPalette(false)} />
    </div>
    </ToastProvider>
  );
}
