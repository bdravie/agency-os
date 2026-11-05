"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

type Counts = Record<string, { n: number; text: string }>;
const Ctx = createContext<Counts>({});
export const useNeedsYou = () => useContext(Ctx);

const EVERY_MS = 60_000;

// Keeps the sidebar's numbers current while the CRM is open:
// - `rendered` changes whenever the server renders the layout again, which every saved change and refresh does, so a number drops as soon as the thing is done.
// - A change of page covers actions that redirect.
// - A check once a minute, and on coming back to the tab, covers time passing (a post reaching 72 hours). A hidden tab does not ask, so the database can sleep.
export function NeedsYouProvider({ rendered, children }: { rendered: number; children: React.ReactNode }) {
  const pathname = usePathname();
  const [counts, setCounts] = useState<Counts>({});
  const latest = useRef(0);
  const loadedBuild = useRef<string | null>(null);
  const [outdated, setOutdated] = useState(false);

  const load = useCallback(async () => {
    const mine = ++latest.current;
    try {
      const r = await fetch("/api/needs-you", { cache: "no-store" });
      if (!r.ok || mine !== latest.current) return;
      const j: { counts: Counts; failed: string[]; build: string } = await r.json();
      loadedBuild.current ??= j.build;
      setOutdated(j.build !== loadedBuild.current);
      setCounts((old) => {
        const next = { ...j.counts };
        for (const href of j.failed) if (old[href]) next[href] = old[href];   // could not be checked: keep the last number rather than look all clear
        return next;
      });
    } catch { /* offline or the server restarting: the numbers stay as they are until the next check */ }
  }, []);

  useEffect(() => { void load(); }, [load, pathname, rendered]);
  useEffect(() => {
    const tick = () => { if (document.visibilityState === "visible") void load(); };
    const t = setInterval(tick, EVERY_MS);
    document.addEventListener("visibilitychange", tick);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", tick); };
  }, [load]);

  return (
    <Ctx.Provider value={counts}>
      {children}
      {/* A tab left open across an update runs old code against the new server, and that can throw errors. It never reloads by itself, in case something is half typed. */}
      {outdated && (
        <div className="update-bar noprint" role="status">
          <span>A new version of the CRM is ready.</span>
          <button type="button" className="secondary" onClick={() => window.location.reload()}>Refresh</button>
        </div>
      )}
    </Ctx.Provider>
  );
}
