import Link from "next/link";
import { notFound } from "next/navigation";
import { query } from "@/lib/db";
import { markReplyUnread, recordReplyOptOut } from "@/lib/inboxActions";
import { when } from "@/lib/format";
import MarkRead from "@/components/MarkRead";
import ToastForm from "@/components/ToastForm";
import { PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Reply" };

export default async function ReplyPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const [r] = await query<any>(
    `SELECT r.*, m.email AS mailbox, COALESCE(c.display_name, c.name) AS company, c.opted_out AS company_opted_out, ct.name AS contact_name, ct.opted_out AS contact_opted_out,
            s.subject AS sent_subject, s.body AS sent_body, s.sent_at, s.to_email
       FROM email_replies r JOIN mailboxes m ON m.id = r.mailbox_id JOIN companies c ON c.id = r.company_id JOIN sent_emails s ON s.id = r.sent_email_id
       LEFT JOIN contacts ct ON ct.id = r.contact_id WHERE r.id = $1`, [id]);
  if (!r) notFound();
  const thread = await query<any>(`SELECT id, from_name, from_email, body, received_at, is_auto FROM email_replies WHERE gmail_thread_id = $1 ORDER BY received_at`, [r.gmail_thread_id]);
  const optedOut = r.contact_id ? r.contact_opted_out : r.company_opted_out;
  const gmail = `https://mail.google.com/mail/u/${encodeURIComponent(r.mailbox)}/#all/${r.gmail_thread_id}`;

  return (
    <>
      <MarkRead id={id} unread={!r.read_at} />
      <PageHeader back={{ href: "/inbox", label: "Inbox" }} title={r.subject ?? "(no subject)"}
        description={<span className="row" style={{ gap: 8 }}>From {r.from_name ?? r.from_email} · <Link href={`/companies/${r.company_id}#outreach`}>{r.company}</Link> · to {r.mailbox}</span>}
        actions={<a className="btn" href={gmail} target="_blank" rel="noreferrer">Reply in Gmail</a>} />

      {r.looks_like_optout && !optedOut && (
        <div className="card row-between" role="alert" style={{ marginBottom: 14, borderColor: "var(--bad)" }}>
          <span><b>This looks like a request not to be emailed again.</b> Record it so they are never contacted again{r.contact_id ? ` (${r.contact_name})` : ` (the company)`}. It is only recorded when you click.</span>
          <ToastForm action={recordReplyOptOut} success="Opt-out recorded" confirm="Record this opt-out? They will be blocked from all outreach. This is permanent.">
            <input type="hidden" name="id" value={id} /><button>Record opt-out</button>
          </ToastForm>
        </div>
      )}
      {optedOut && <p className="card muted" style={{ marginBottom: 14 }}>Already recorded as opted out.</p>}

      <div className="stack">
        {thread.map((m: any) => (
          <section key={m.id} className="card stack" style={{ gap: 6 }}>
            <div className="row-between"><b>{m.from_name ?? m.from_email}</b><span className="muted">{when(m.received_at)}{m.is_auto ? " · automatic reply" : ""}</span></div>
            <p style={{ whiteSpace: "pre-wrap", margin: 0 }}>{m.body || "(empty)"}</p>
          </section>
        ))}
        <details className="card"><summary>The email you sent ({r.sent_subject}, {when(r.sent_at)} to {r.to_email})</summary>
          <p style={{ whiteSpace: "pre-wrap", marginTop: 10 }} className="muted">{r.sent_body}</p>
        </details>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <span className="muted">If Gmail does not open the conversation, search for the subject in {r.mailbox}.</span>
          <ToastForm action={markReplyUnread} success="Marked unread"><input type="hidden" name="id" value={id} /><button className="link">Mark unread</button></ToastForm>
        </div>
      </div>
    </>
  );
}
