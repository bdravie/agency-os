"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useToast } from "./Toast";

type Feed = { unread: number; connected: number };
const Ctx = createContext<Feed>({ unread: 0, connected: 0 });
export const useReplyFeed = () => useContext(Ctx);

const SEEN = "agency_reply_seen";   // highest reply id already announced, shared by every open tab
const EVERY_MS = 60_000;

type Latest = { id: number; from: string; company: string; mailbox: string; subject: string | null; snippet: string; optout: boolean };

// While the CRM is open in a browser tab this asks the server for new replies once a minute, keeps the unread count for the menu
// and announces each new reply once: a toast, and a desktop notification if the owner has allowed them (Inbox page).
export function ReplyFeedProvider({ children }: { children: React.ReactNode }) {
  const toast = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const [feed, setFeed] = useState<Feed>({ unread: 0, connected: 0 });

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const r = await fetch("/api/inbox/poll", { cache: "no-store" });
        if (!r.ok || !alive) return;
        const j: { connected: number; unread: number; latest: Latest[] } = await r.json();
        setFeed({ unread: j.unread, connected: j.connected });
        const stored = localStorage.getItem(SEEN);
        const top = j.latest.reduce((m, x) => Math.max(m, x.id), 0);
        if (stored === null) { localStorage.setItem(SEEN, String(top)); return; }   // first visit: do not announce old replies
        const fresh = j.latest.filter((x) => x.id > Number(stored)).sort((a, b) => a.id - b.id);
        if (fresh.length === 0) return;
        localStorage.setItem(SEEN, String(Math.max(top, Number(stored))));
        for (const x of fresh) {
          const title = `${x.optout ? "Reply (looks like an opt-out)" : "New reply"} from ${x.from}`;
          toast(`${title}${x.company ? ` · ${x.company}` : ""}`);
          if (typeof Notification !== "undefined" && Notification.permission === "granted") {
            const n = new Notification(title, { body: `${x.company}${x.subject ? ` · ${x.subject}` : ""}\n${x.snippet}`, tag: `reply-${x.id}` });
            n.onclick = () => { window.focus(); router.push(`/inbox/${x.id}`); n.close(); };
          }
        }
        if (pathname.startsWith("/inbox")) router.refresh();
      } catch { /* offline or the server restarting: try again next minute */ }
    };
    void tick();
    const t = setInterval(tick, EVERY_MS);
    return () => { alive = false; clearInterval(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <Ctx.Provider value={feed}>{children}</Ctx.Provider>;
}
