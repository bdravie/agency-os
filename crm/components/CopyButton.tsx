"use client";

import { useState } from "react";

export default function CopyButton({ targetId }: { targetId: string }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" className="secondary" onClick={async () => {
      const el = document.getElementById(targetId) as HTMLTextAreaElement | null;
      if (!el) return;
      await navigator.clipboard.writeText(el.value);
      setDone(true);
      setTimeout(() => setDone(false), 1500);
    }}>{done ? "Copied ✓" : "Copy draft"}</button>
  );
}
