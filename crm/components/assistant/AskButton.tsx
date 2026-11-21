"use client";

import { useFormStatus } from "react-dom";
import { Sparkles } from "lucide-react";

// A plain submit button (so the form posts with JavaScript off) that says it is thinking once React is running.
export default function AskButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} aria-live="polite">
      <Sparkles size={16} aria-hidden /> {pending ? "Thinking…" : "Ask"}
    </button>
  );
}
