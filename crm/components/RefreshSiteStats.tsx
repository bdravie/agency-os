"use client";

import { useState, useTransition } from "react";
import { RefreshCw } from "lucide-react";
import { refreshSiteStatsAction } from "@/lib/siteTestActions";

export default function RefreshSiteStats() {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="row" style={{ gap: 10 }}>
      <button disabled={pending} onClick={() => start(async () => { const r = await refreshSiteStatsAction(); setError(r.ok ? null : r.error); })}>
        <RefreshCw size={15} aria-hidden /> {pending ? "Fetching…" : "Refresh from site"}
      </button>
      {error && <span className="error" role="alert">{error}</span>}
    </div>
  );
}
