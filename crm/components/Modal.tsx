"use client";

import { useLayoutEffect, useRef } from "react";

// Every pop-up in the CRM: a native <dialog> opened with showModal() (Modern Web Guidance, ui-components/dialog).
// The browser keeps the keyboard inside it, makes the page behind inert, closes it on Escape or the phone's back
// gesture (as a request: `onClose` decides) and returns focus to whatever opened it. So no role, aria-modal, focus
// trap or Escape handler is written here or in the pop-ups that use it.
//
// The dialog fills the screen and is transparent: its ::backdrop is the scrim, and the card or drawer inside it is what
// you see (globals.css, `dialog.modal`). A press and release both outside that card closes it, done by hand because
// `closedby="any"` is not in Safari. Put `data-autofocus` on the element that should take focus when it opens
// (React's autoFocus fires before the dialog is open, so it is lost); without one the browser picks the first control.
export default function Modal({ label, onClose, drawer = false, dismissOnBackdrop = true, children }: {
  label: string;
  onClose: () => void;
  drawer?: boolean;             // a side panel (deal, content) rather than a centred card
  dismissOnBackdrop?: boolean;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const latest = useRef(onClose);
  const leaving = useRef(false);
  const pressedOutside = useRef(false);
  useLayoutEffect(() => { latest.current = onClose; });

  useLayoutEffect(() => {
    const d = ref.current;
    if (!d) return;
    leaving.current = false;
    if (!d.open) d.showModal();
    d.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    // Closing before React removes it runs the browser's closing steps, which hand focus back to the opener.
    return () => { leaving.current = true; if (d.open) d.close(); };
  }, []);

  return (
    <dialog
      ref={ref}
      className={drawer ? "modal modal-drawer" : "modal"}
      aria-label={label}
      // Escape or the back gesture: ask the pop-up instead of closing, so one with unsaved work can say no.
      onCancel={(e) => { e.preventDefault(); latest.current(); }}
      // Chrome lets a repeated Escape close the dialog anyway. Tell the pop-up; if it stays open, show it again.
      onClose={() => {
        if (leaving.current) return;
        latest.current();
        requestAnimationFrame(() => { const d = ref.current; if (d && !d.open && !leaving.current) d.showModal(); });
      }}
      onMouseDown={(e) => { pressedOutside.current = e.target === e.currentTarget; }}
      onClick={(e) => {
        const outside = pressedOutside.current && e.target === e.currentTarget;
        pressedOutside.current = false;
        if (outside && dismissOnBackdrop) latest.current();
      }}
    >
      {children}
    </dialog>
  );
}
