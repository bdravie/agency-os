"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import AssistantPanel from "@/components/assistant/AssistantPanel";

// The centre of the brain. It is a real link to /assistant, so it works with JavaScript off (and with Cmd-click, a new tab);
// a plain click opens the assistant in a panel over the dashboard instead.
export default function BrainCore({ topics }: { topics: { key: string; label: string; description: string }[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <a
        href="/assistant"
        className="brain-core"
        aria-label="Ask the brain: your knowledge-base assistant"
        aria-haspopup="dialog"
        onClick={(e) => {
          if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
          e.preventDefault();
          setOpen(true);
        }}
      >
        <span className="core-ring" aria-hidden />
        <span className="core-ring core-ring-2" aria-hidden />
        <span className="core-face" aria-hidden>
          <Sparkles className="core-icon" size={20} />
          <span className="core-text">Ask</span>
        </span>
      </a>
      {open && <AssistantPanel topics={topics} onClose={() => setOpen(false)} />}
    </>
  );
}
