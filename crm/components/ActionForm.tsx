"use client";

import { useActionState } from "react";

// A form that runs a server action, shows a busy label while the AI works, and shows any error.
export default function ActionForm({
  action, label, busyLabel, children, style,
}: {
  action: (prev: string | null, form: FormData) => Promise<string | null>;
  label: string; busyLabel: string; children?: React.ReactNode; style?: React.CSSProperties;
}) {
  const [message, formAction, pending] = useActionState(action, null);
  return (
    <form action={formAction} style={{ display: "flex", flexDirection: "column", gap: 8, ...style }}>
      {children}
      <button disabled={pending}>{pending ? busyLabel : label}</button>
      {message && <p className="error">{message}</p>}
    </form>
  );
}
