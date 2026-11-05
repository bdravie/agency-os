"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import Sidebar from "./Sidebar";
import CommandPalette from "./CommandPalette";
import { ToastProvider } from "./Toast";
import { ReplyFeedProvider, useReplyFeed } from "./ReplyFeed";
import { NeedsYouProvider, useNeedsYou } from "./NeedsYouFeed";
import { badgeText } from "@/lib/needsYouMath";
import HashScroll from "./HashScroll";
import LiveCalendar from "./LiveCalendar";

// On a narrow screen the sidebar is hidden, so the menu button carries the total.
function MenuButton({ open, onClick }: { open: boolean; onClick: () => void }) {
  const { unread } = useReplyFeed();
  const total = unread + Object.values(useNeedsYou()).reduce((sum, c) => sum + c.n, 0);
  const waiting = total > 0 ? `, ${total} ${total === 1 ? "thing needs" : "things need"} you` : "";
  return (
    <button type="button" className="icon-btn menu-btn" aria-label={open ? "Close menu" : `Open menu${waiting}`} aria-expanded={open} onClick={onClick}>
      {open ? <X size={20} /> : <Menu size={20} />}
      {!open && total > 0 && <span key={total} className="badge nav-count menu-count" aria-hidden>{badgeText(total)}</span>}
    </button>
  );
}

// Sidebar on wide screens; a slide-in drawer with a top bar on narrow ones.
export default function AppShell({ children, demo, signOut, theme, collapsed, rendered }: { children: React.ReactNode; demo: boolean; signOut: () => Promise<void>; theme: "light" | "dark"; collapsed: boolean; rendered: number }) {
  const [open, setOpen] = useState(false);
  const [rail, setRail] = useState(collapsed);   // the menu shrunk to icons on a wide screen; kept in a cookie so the server draws it right first time
  const [palette, setPalette] = useState(false);
  const pathname = usePathname();

  const toggleRail = useCallback(() => {
    setRail(!rail);
    document.cookie = `sidebar=${rail ? "open" : "collapsed"}; path=/; max-age=31536000; samesite=lax`;
  }, [rail]);

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test((e.target as HTMLElement)?.tagName ?? "") || (e.target as HTMLElement)?.isContentEditable;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setPalette((p) => !p); }
      else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "b" && window.matchMedia("(min-width: 901px)").matches) { e.preventDefault(); toggleRail(); }
      else if (e.key === "/" && !typing && !palette) { e.preventDefault(); setPalette(true); }
      else if (e.key === "Escape") { setOpen(false); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [palette, toggleRail]);

  // The password page never shows the app. This layout stays mounted during in-app navigation (Sign out, an expired session), so check the path here too.
  if (pathname === "/login") return <>{children}</>;

  return (
    <ToastProvider>
    <ReplyFeedProvider>
    <NeedsYouProvider rendered={rendered}>
    <div className={`app${rail ? " rail" : ""}`}>
      <a href="#main" className="skip">Skip to content</a>
      <div className="topbar">
        <MenuButton open={open} onClick={() => setOpen(!open)} />
        <strong>Agency OS</strong>
      </div>
      <aside id="main-menu" className={`sidebar${open ? " open" : ""}`}>
        <Sidebar demo={demo} signOut={signOut} theme={theme} rail={rail} onToggleRail={toggleRail} onSearch={() => { setOpen(false); setPalette(true); }} />
      </aside>
      {open && <div className="scrim" onClick={() => setOpen(false)} aria-hidden />}
      <main id="main" className="main"><HashScroll /><LiveCalendar />{children}</main>
      <CommandPalette open={palette} onClose={() => setPalette(false)} />
    </div>
    </NeedsYouProvider>
    </ReplyFeedProvider>
    </ToastProvider>
  );
}
