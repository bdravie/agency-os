"use client";

import { useRef } from "react";
import { useToast } from "./Toast";

// A normal form that runs a server action and then confirms with a toast ("Notes saved").
// Do not use it for actions that redirect: those navigate away on their own.
export default function ToastForm({ id, action, success, reset, onDone, confirm, children, className, style }: {
  id?: string;
  action: (form: FormData) => Promise<unknown>;
  success: string; reset?: boolean; onDone?: () => void; confirm?: string; children: React.ReactNode; className?: string; style?: React.CSSProperties;
}) {
  const toast = useToast();
  const ref = useRef<HTMLFormElement>(null);
  return (
    <form
      ref={ref} id={id} className={className} style={style}
      action={async (fd) => {
        if (confirm && !window.confirm(confirm)) return;
        try {
          const r = (await action(fd)) as { error?: string } | undefined;
          if (r && typeof r === "object" && typeof r.error === "string") { toast(r.error, "bad"); return; } // actions can return { error } instead of throwing
          toast(success); if (reset) ref.current?.reset(); onDone?.();
        }
        catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          const code = (err as { digest?: string })?.digest;
          // In the production build the server hides the real message; the code lets it be looked up in the CRM log.
          toast(/Server Components render/i.test(msg) ? `Something went wrong on the server${code ? ` (code ${code})` : ""}. Nothing was saved. Send me the code and I'll find the cause.` : `Could not save: ${msg}`, "bad");
        }
      }}
    >
      {children}
    </form>
  );
}
