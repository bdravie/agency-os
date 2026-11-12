"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Link2 } from "lucide-react";
import { useToast } from "./Toast";
import { disconnectLinkedInAction } from "@/lib/linkedinPublishActions";

export type AccountState = {
  configured: boolean;
  connected: { name: string; expiresAt: string | null; usable: boolean; lastError: string | null } | null;
  /** What the sign-in page sent back (?linkedin=connected|error|not-configured), shown once. */
  status: { kind: string; name?: string; reason?: string } | null;
  cap: number;
};

const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

/** The LinkedIn profile used for click-to-post: connect, see until when it works, disconnect. Posting itself is on each post's page. */
export default function LinkedInAccountCard({ a }: { a: AccountState }) {
  const toast = useToast();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const disconnect = async () => {
    if (!window.confirm("Disconnect LinkedIn? Posts will go back to being posted by hand. To remove the app's access on LinkedIn too, go to Settings > Data privacy > Permitted services.")) return;
    setBusy(true);
    try { await disconnectLinkedInAction(); toast("LinkedIn disconnected"); router.replace("/content?tab=linkedin"); router.refresh(); }
    finally { setBusy(false); }
  };

  return (
    <section className="card li-account">
      <div className="row" style={{ gap: 8 }}><Link2 size={16} aria-hidden /><b>Post from here</b></div>
      {a.status?.kind === "connected" && <p className="muted" role="status" style={{ margin: 0 }}>Connected as {a.status.name}.</p>}
      {a.status?.kind === "error" && <p className="error" role="alert">LinkedIn was not connected: {a.status.reason === "state" ? "the sign-in could not be matched to this browser. Try again." : a.status.reason}</p>}
      {!a.configured ? (
        <p className="muted" style={{ margin: 0 }}>
          Optional: to post with one click, create a LinkedIn developer app with the products <i>Sign In with LinkedIn using OpenID Connect</i> and <i>Share on LinkedIn</i>,
          add <code>http://127.0.0.1:3000/api/linkedin/callback</code> as its redirect URL, and put <code>LINKEDIN_CLIENT_ID</code> and <code>LINKEDIN_CLIENT_SECRET</code> in .env (steps in docs/SETUP.md). Until then, post by hand.
        </p>
      ) : a.connected ? (
        <div className="row-between" style={{ gap: 12 }}>
          <span className="muted">
            {a.connected.usable
              ? <>Posting as <b style={{ color: "var(--text)" }}>{a.connected.name}</b>{a.connected.expiresAt ? `, until ${day(a.connected.expiresAt)}` : ""}. One post at a time, only when you click, at most {a.cap} a day.</>
              : <>The connection for {a.connected.name} has expired (LinkedIn allows about 60 days). <a href="/api/linkedin/connect">Connect again</a>.</>}
            {a.connected.lastError && a.connected.usable && <> Last problem: {a.connected.lastError}</>}
          </span>
          <button type="button" className="link" onClick={disconnect} disabled={busy}>Disconnect</button>
        </div>
      ) : (
        <div className="row-between" style={{ gap: 12 }}>
          <span className="muted">Connect your own LinkedIn profile to post a finished post with one click (after a confirmation). Nothing is read from LinkedIn.</span>
          <a className="btn secondary" href="/api/linkedin/connect">Connect LinkedIn</a>
        </div>
      )}
    </section>
  );
}
