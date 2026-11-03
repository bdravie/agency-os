"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

// Keeps the calendar, meetings and tasks in step while the CRM is open: about once a minute (and the moment you come back to the tab) it asks the
// server to sync with Google, and refreshes the page you are looking at if anything changed. Does nothing until a calendar is connected.
const EVERY_MS = 60_000, IDLE_MS = 5 * 60_000;

export default function LiveCalendar() {
  const router = useRouter();
  const pending = useRef(false);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>, dead = false, delay = EVERY_MS;
    const typing = () => /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName ?? "");
    const tick = async () => {
      clearTimeout(timer);
      if (document.visibilityState === "visible") {
        try {
          const res = await fetch("/api/calendar/sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
          if (res.ok) {
            const r = await res.json();
            delay = r.connected ? EVERY_MS : IDLE_MS;
            if (r.changed) pending.current = true;
          }
        } catch { /* offline or the CRM restarted: try again next time */ }
        if (pending.current && !typing()) { pending.current = false; router.refresh(); }   // never refresh under someone who is typing
      }
      if (!dead) timer = setTimeout(tick, delay);
    };
    const onVisible = () => { if (document.visibilityState === "visible") { clearTimeout(timer); timer = setTimeout(tick, 400); } };
    timer = setTimeout(tick, 1500);
    document.addEventListener("visibilitychange", onVisible);
    return () => { dead = true; clearTimeout(timer); document.removeEventListener("visibilitychange", onVisible); };
  }, [router]);
  return null;
}
