import Link from "next/link";
import { Mail } from "lucide-react";
import { query } from "@/lib/db";
import { googleConfigured, redirectUri } from "@/lib/gmail";
import { disconnectMailbox, saveMailbox } from "@/lib/mailboxActions";
import { remainingToday } from "@/lib/sendRules";
import { ago } from "@/lib/format";
import ToastForm from "@/components/ToastForm";
import { EmptyState, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Mailboxes" };

export default async function Mailboxes({ searchParams }: { searchParams: Promise<{ connected?: string; error?: string }> }) {
  const sp = await searchParams;
  const boxes = await query<any>(
    `SELECT m.id, m.email, m.display_name, m.daily_cap, m.active, m.last_checked_at, m.last_error, (m.refresh_token_enc IS NOT NULL) AS connected,
            (SELECT count(*)::int FROM sent_emails s WHERE s.mailbox_id = m.id AND s.status IN ('sent','sending') AND s.created_at >= (date_trunc('day', now() AT TIME ZONE 'Europe/London') AT TIME ZONE 'Europe/London')) AS today,
            (SELECT count(*)::int FROM sent_emails s WHERE s.mailbox_id = m.id AND s.status = 'sent') AS total
       FROM mailboxes m ORDER BY m.id`);
  const configured = googleConfigured();
  const errorText = sp.error === "not-configured" ? "Google is not set up yet (see below)." : sp.error === "state" ? "That sign-in could not be checked. Please try connecting again." : sp.error ? `Google said: ${sp.error}` : null;

  return (
    <>
      <PageHeader title="Mailboxes" description="Your own Google mailboxes. The Send button on a company page sends one email at a time from the one you choose, and replies to those emails appear in the Inbox." />
      {sp.connected && <p className="card" role="status" style={{ marginBottom: 14 }}>Connected {sp.connected}. Its daily limit starts at 10: raise it only as the mailbox warms up.</p>}
      {errorText && <p className="card error" role="alert" style={{ marginBottom: 14 }}>{errorText}</p>}

      <div className="stack">
        {boxes.length === 0 && <div className="card"><EmptyState title="No mailbox connected" icon={<Mail size={22} />}>Connect a Google mailbox to send from the CRM and to see replies in the Inbox.</EmptyState></div>}
        {boxes.map((b: any) => (
          <div key={b.id} className="card stack" style={{ gap: 10 }}>
            <div className="row-between">
              <div><b style={{ fontSize: 16 }}>{b.email}</b>
                <div className="muted">
                  {b.connected ? (b.active ? "Connected" : "Connected, paused") : "Disconnected"}
                  {" · "}{b.today} of {b.daily_cap} sent today ({remainingToday(b.daily_cap, b.today)} left){" · "}{b.total} sent in all
                  {b.connected && <>{" · "}replies last checked {b.last_checked_at ? ago(b.last_checked_at) : "never"}</>}
                </div>
              </div>
              {!b.connected && configured && <a className="btn" href={`/api/google/connect?hint=${encodeURIComponent(b.email)}`}>Reconnect</a>}
            </div>
            {b.last_error && <p className="error" role="alert" style={{ margin: 0 }}>{b.last_error} {b.connected && <a href={`/api/google/connect?hint=${encodeURIComponent(b.email)}`}>Connect again</a>}</p>}
            <ToastForm action={saveMailbox} success="Mailbox saved" className="row" style={{ alignItems: "flex-end" }}>
              <input type="hidden" name="id" value={b.id} />
              <label>Name on emails<input name="display_name" defaultValue={b.display_name ?? ""} placeholder={process.env.SENDER_NAME ?? ""} style={{ width: 200 }} /></label>
              <label>Daily limit<input name="daily_cap" type="number" min="0" max="500" step="1" defaultValue={b.daily_cap} style={{ width: 90 }} /></label>
              <label className="row" style={{ flexDirection: "row", gap: 6 }}><input type="checkbox" name="active" defaultChecked={b.active} /> Active</label>
              <button className="secondary">Save</button>
            </ToastForm>
            {b.connected && (
              <ToastForm action={disconnectMailbox} success="Disconnected" confirm={`Disconnect ${b.email}? The CRM forgets its access and stops sending from it and checking for replies. Past emails and replies stay.`} className="row" style={{ justifyContent: "flex-end" }}>
                <input type="hidden" name="id" value={b.id} /><button className="link">Disconnect</button>
              </ToastForm>
            )}
          </div>
        ))}
        {configured
          ? <div><a className="btn" href="/api/google/connect">Connect a Google mailbox</a> <span className="muted">Sign in with the mailbox you want to add and tick every box on Google&apos;s screen.</span></div>
          : (
            <div className="card stack" style={{ gap: 8 }}>
              <b>One-off setup in Google Cloud (about 10 minutes)</b>
              <ol className="stack" style={{ gap: 4, paddingLeft: 20 }}>
                <li>At console.cloud.google.com create a project, then APIs &amp; Services &gt; Library &gt; enable the <b>Gmail API</b>.</li>
                <li>OAuth consent screen: choose <b>Internal</b> if every mailbox is in one Google Workspace, otherwise <b>External</b> and press <b>Publish app</b> (leave it in Testing and Google cancels access every 7 days). Add the scopes <code>gmail.send</code> and <code>gmail.readonly</code>.</li>
                <li>Credentials &gt; Create credentials &gt; OAuth client ID &gt; <b>Web application</b>. Add this authorised redirect URI exactly: <code>{redirectUri()}</code></li>
                <li>Put the client ID and secret in the CRM&apos;s settings file as <code>GOOGLE_CLIENT_ID</code> and <code>GOOGLE_CLIENT_SECRET</code>, then restart the CRM. The details are in docs/SETUP.md.</li>
              </ol>
            </div>
          )}
        <p className="muted">Replies are only read in conversations the CRM started: other mail in these mailboxes is never opened. <Link href="/inbox">Go to the Inbox</Link></p>
      </div>
    </>
  );
}
