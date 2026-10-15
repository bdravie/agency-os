"use client";

import { useActionState } from "react";

// A form that runs a server action, shows a busy label while the AI works, and shows any error.
export default function ActionForm({
  action, label, busyLabel, children, style, secondary,
}: {
  action: (prev: string | null, form: FormData) => Promise<string | null>;
  label: string; busyLabel: string; children?: React.ReactNode; style?: React.CSSProperties; secondary?: boolean;
}) {
  const [message, formAction, pending] = useActionState(action, null);
  return (
    <form action={formAction} className="stack stack-tight" style={{ gap: 8, ...style }}>
      {children}
      <button disabled={pending} className={secondary ? "secondary" : undefined}>{pending ? busyLabel : label}</button>
      {message && <p className={message.startsWith("✓") ? "muted" : "error"}>{message}</p>}
    </form>
  );
}
