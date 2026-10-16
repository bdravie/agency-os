"use client";

import { useRef } from "react";
import { useToast } from "./Toast";

// A normal form that runs a server action and then confirms with a toast ("Notes saved").
// Do not use it for actions that redirect: those navigate away on their own.
export default function ToastForm({ action, success, reset, onDone, confirm, children, className, style }: {
  action: (form: FormData) => Promise<unknown>;
  success: string; reset?: boolean; onDone?: () => void; confirm?: string; children: React.ReactNode; className?: string; style?: React.CSSProperties;
}) {
  const toast = useToast();
  const ref = useRef<HTMLFormElement>(null);
  return (
    <form
      ref={ref} className={className} style={style}
      action={async (fd) => {
        if (confirm && !window.confirm(confirm)) return;
        try {
          const r = (await action(fd)) as { error?: string } | undefined;
          if (r && typeof r === "object" && typeof r.error === "string") { toast(r.error, "bad"); return; } // actions can return { error } instead of throwing
          toast(success); if (reset) ref.current?.reset(); onDone?.();
        }
        catch (err) { toast(`Could not save: ${err instanceof Error ? err.message : String(err)}`, "bad"); }
      }}
    >
      {children}
    </form>
  );
}
