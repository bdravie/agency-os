"use client";

import { useState, useTransition } from "react";
import { Sparkles } from "lucide-react";
import { writeBriefAction } from "@/lib/contentBriefActions";

export default function WriteBrief({ has }: { has: boolean }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="stack" style={{ gap: 6 }}>
      <button disabled={pending} onClick={() => start(async () => { const r = await writeBriefAction(); setError(r.ok ? null : r.error); })}><Sparkles size={15} aria-hidden /> {pending ? "Writing… (about 20 seconds)" : has ? "Write it again" : "Write this week's brief"}</button>
      {error && <p className="error" role="alert">{error}</p>}
    </div>
  );
}
