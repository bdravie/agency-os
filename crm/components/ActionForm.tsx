"use client";

import { useActionState, useEffect, useRef } from "react";
import { useToast } from "./Toast";

// A form that runs a server action, shows a busy label while the AI works, and shows any error.
export default function ActionForm({
  action, label, busyLabel, children, style, secondary,
}: {
  action: (prev: string | null, form: FormData) => Promise<string | null>;
  label: string; busyLabel: string; children?: React.ReactNode; style?: React.CSSProperties; secondary?: boolean;
}) {
  const toast = useToast();
  const [message, formAction, pending] = useActionState(action, null);
  const was = useRef(false);
  useEffect(() => {
    // pending went true -> false: confirm success (null, or a message starting with the tick)
    if (was.current && !pending) {
      if (message === null) toast("Done");
      else if (message.startsWith("✓")) toast(message.replace(/^✓\s*/, ""));
    }
    was.current = pending;
  }, [pending, message, toast]);
  return (
    <form action={formAction} className="stack stack-tight" style={{ gap: 8, ...style }}>
      {children}
      <button disabled={pending} className={secondary ? "secondary" : undefined}>{pending ? busyLabel : label}</button>
      {message && !message.startsWith("✓") && <p className="error" role="alert">{message}</p>}
    </form>
  );
}
