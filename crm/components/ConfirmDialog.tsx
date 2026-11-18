"use client";

import { useCallback, useRef, useState } from "react";
import Modal from "./Modal";

// A confirmation in the CRM's own style, in place of the browser's confirm() box for actions that reach someone outside
// the CRM (sending an email, posting to LinkedIn, sending an invitation). It names who and what before anything goes.
// Cancel has the focus, so Enter or a double click never sends by accident.
//
//   const [confirm, confirmDialog] = useConfirm();
//   if (!(await confirm({ title: "Send this email now?", details: [["To", email]], confirmLabel: "Send" }))) return;
//   ...render {confirmDialog} somewhere in the component.
export type ConfirmOptions = {
  title: string;
  details?: [label: string, value: string][];
  body?: string;               // a closing line, e.g. "It cannot be recalled." Line breaks are kept.
  confirmLabel: string;
  cancelLabel?: string;        // when "Cancel" would be ambiguous, e.g. cancelling a meeting ("Keep it")
};

export function useConfirm(): [(options: ConfirmOptions) => Promise<boolean>, React.ReactNode] {
  const [asking, setAsking] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((yes: boolean) => void) | null>(null);

  const confirm = useCallback((options: ConfirmOptions) => new Promise<boolean>((resolve) => {
    resolver.current?.(false);   // a second question replaces an unanswered first one
    resolver.current = resolve;
    setAsking(options);
  }), []);

  const answer = (yes: boolean) => { resolver.current?.(yes); resolver.current = null; setAsking(null); };

  const dialog = asking && (
    <Modal label={asking.title} onClose={() => answer(false)}>
      <form className="card stack dialog" style={{ width: "min(500px, calc(100vw - 32px))" }} onSubmit={(e) => { e.preventDefault(); answer(true); }}>
        <h2 style={{ margin: 0 }}>{asking.title}</h2>
        {asking.details && asking.details.length > 0 && (
          <dl className="confirm-details">
            {asking.details.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
          </dl>
        )}
        {asking.body && <p className="muted" style={{ margin: 0, whiteSpace: "pre-line" }}>{asking.body}</p>}
        <div className="row">
          <button>{asking.confirmLabel}</button>
          <button type="button" className="secondary" data-autofocus onClick={() => answer(false)}>{asking.cancelLabel ?? "Cancel"}</button>
        </div>
      </form>
    </Modal>
  );
  return [confirm, dialog];
}
