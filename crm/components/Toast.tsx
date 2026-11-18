"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, X } from "lucide-react";

type Tone = "good" | "bad";
type Toast = { id: number; message: string; tone: Tone };
const Ctx = createContext<(message: string, tone?: Tone) => void>(() => {});

/** Brief confirmations ("Saved", "Moved to Contacted"). Errors stay a little longer. */
export const useToast = () => useContext(Ctx);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const next = useRef(1);
  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const push = useCallback((message: string, tone: Tone = "good") => {
    const id = next.current++;
    setToasts((t) => [...t.slice(-3), { id, message, tone }]);
    setTimeout(() => dismiss(id), tone === "bad" ? 7000 : 3500);
  }, [dismiss]);

  // The list is a manual popover, so it can show above an open pop-up (a <dialog> sits in the top layer, above any z-index).
  // A new toast re-shows it, which puts it back on top if a pop-up opened since. Browsers without popovers keep the fixed corner.
  const box = useRef<HTMLDivElement>(null);
  const shown = useRef(0);
  useEffect(() => {
    const el = box.current;
    if (!el || typeof el.showPopover !== "function") return;
    try {
      if (toasts.length === 0) { if (el.matches(":popover-open")) el.hidePopover(); }
      else if (toasts.length > shown.current || !el.matches(":popover-open")) {
        if (el.matches(":popover-open")) el.hidePopover();
        el.showPopover();
      }
    } catch { /* never let a toast break the page */ }
    shown.current = toasts.length;
  }, [toasts]);

  return (
    <Ctx.Provider value={push}>
      {children}
      <div ref={box} popover="manual" className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.tone}`}>
            {t.tone === "good" ? <CheckCircle2 size={17} aria-hidden /> : <AlertCircle size={17} aria-hidden />}
            <span>{t.message}</span>
            <button type="button" className="link" aria-label="Dismiss" onClick={() => dismiss(t.id)}><X size={14} /></button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
