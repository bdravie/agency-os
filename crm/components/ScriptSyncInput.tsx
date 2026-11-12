"use client";

import { useEffect, useRef } from "react";

// Automatically keeps a hidden form input synchronised with the live script/notes textarea,
// ensuring any unsaved text in the box is delivered to the server action upon submission.
export default function ScriptSyncInput({
  targetTextareaId = "script",
}: {
  targetTextareaId?: string;
}) {
  const hiddenRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const hidden = hiddenRef.current;
    if (!hidden) return;

    const sync = () => {
      const textarea = document.getElementById(targetTextareaId) as HTMLTextAreaElement | null;
      if (textarea && hidden) {
        hidden.value = textarea.value;
      }
    };

    // Synchronise immediately on mount
    sync();

    // Listen to changes on the target textarea
    const textarea = document.getElementById(targetTextareaId) as HTMLTextAreaElement | null;
    textarea?.addEventListener("input", sync);
    textarea?.addEventListener("change", sync);

    const form = hidden.closest("form");
    form?.addEventListener("submit", sync, { capture: true });

    return () => {
      textarea?.removeEventListener("input", sync);
      textarea?.removeEventListener("change", sync);
      form?.removeEventListener("submit", sync, { capture: true });
    };
  }, [targetTextareaId]);

  return <input ref={hiddenRef} type="hidden" name="script" />;
}
