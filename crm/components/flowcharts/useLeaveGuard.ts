"use client";

import { useEffect, useRef } from "react";

const MESSAGE = "Your latest changes have not saved yet. Leave this page anyway?";

// Next has no way to block navigation, so this covers each way out: closing or reloading the tab, and clicking a link.
// Anything else (Back, the search palette) gets a last save attempt as the page goes.
export function useLeaveGuard(isUnsaved: () => boolean, saveNow: () => void) {
  const guard = useRef({ isUnsaved, saveNow });
  guard.current = { isUnsaved, saveNow };

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (guard.current.isUnsaved()) e.preventDefault();
    };
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;   // a new tab leaves this one open
      const a = (e.target as HTMLElement).closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      if (a.pathname === location.pathname && a.search === location.search) return;
      if (guard.current.isUnsaved() && !window.confirm(MESSAGE)) { e.preventDefault(); e.stopPropagation(); }
    };
    const onHide = () => { if (document.visibilityState === "hidden") guard.current.saveNow(); };
    window.addEventListener("beforeunload", onBeforeUnload);
    window.addEventListener("click", onClick, true);   // on the way down, ahead of the link's own handler
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      window.removeEventListener("click", onClick, true);
      document.removeEventListener("visibilitychange", onHide);
      guard.current.saveNow();
    };
  }, []);
}
