"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";

export default function SyncNowButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <span className="row" style={{ gap: 8 }}>
      <button type="button" className="secondary" disabled={busy} onClick={async () => {
        setBusy(true); setMsg(null);
        try {
          const r = await (await fetch("/api/calendar/sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ force: true }) })).json();
          setMsg(r.error ? r.error : "Up to date");
          router.refresh();
        } catch { setMsg("Could not reach the CRM."); }
        setBusy(false);
      }}><RefreshCw size={14} aria-hidden /> {busy ? "Syncing…" : "Sync now"}</button>
      {msg && <span className="muted" role="status">{msg}</span>}
    </span>
  );
}
