import Link from "next/link";
import { Inbox as InboxIcon } from "lucide-react";
import { query } from "@/lib/db";
import { checkRepliesNow } from "@/lib/mailboxActions";
import { markAllRead } from "@/lib/inboxActions";
import { ago } from "@/lib/format";
import ToastForm from "@/components/ToastForm";
import EnableNotifications from "@/components/EnableNotifications";
import { EmptyState, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Inbox" };

export default async function InboxPage({ searchParams }: { searchParams: Promise<{ box?: string; show?: string; auto?: string }> }) {
  const sp = await searchParams;
  const box = Number(sp.box) || null;
  const all = sp.show === "all", withAuto = sp.auto === "1";
  const link = (o: { box?: number | null; show?: string; auto?: string }) => {
    const q = new URLSearchParams();
    const b = o.box === undefined ? box : o.box, s = o.show ?? (all ? "all" : ""), a = o.auto ?? (withAuto ? "1" : "");
    if (b) q.set("box", String(b)); if (s) q.set("show", s); if (a) q.set("auto", a);
    return `/inbox${q.size ? `?${q}` : ""}`;
  };
  const [boxes, replies] = await Promise.all([
    query<any>(`SELECT m.id, m.email, (SELECT count(*)::int FROM email_replies r WHERE r.mailbox_id = m.id AND r.read_at IS NULL AND NOT r.is_auto) AS unread FROM mailboxes m ORDER BY m.id`),
    query<any>(
      `SELECT r.id, r.from_name, r.from_email, r.subject, left(regexp_replace(r.body, '\\s+', ' ', 'g'), 220) AS snippet, r.received_at, r.read_at, r.is_auto, r.looks_like_optout,
              m.email AS mailbox, COALESCE(c.display_name, c.name) AS company, r.company_id
         FROM email_replies r JOIN mailboxes m ON m.id = r.mailbox_id JOIN companies c ON c.id = r.company_id
        WHERE ($1::bigint IS NULL OR r.mailbox_id = $1) AND ($2::boolean OR r.read_at IS NULL) AND ($3::boolean OR NOT r.is_auto)
        ORDER BY r.received_at DESC LIMIT 100`, [box, all, withAuto]),
  ]);
  const totalUnread = boxes.reduce((n: number, b: any) => n + b.unread, 0);

  return (
    <>
      <PageHeader title="Inbox" description="Replies to the emails you sent from the CRM. Only conversations the CRM started are read." actions={
        <span className="row">
          <ToastForm action={checkRepliesNow} success="Checked for replies" className="row">
            <button className="secondary">Check now</button>
          </ToastForm>
          {totalUnread > 0 && <ToastForm action={markAllRead} success="Marked read"><input type="hidden" name="box" value={box ?? ""} /><button className="secondary">Mark {box ? "this inbox" : "all"} read</button></ToastForm>}
        </span>} />

      <div className="row" style={{ marginBottom: 12, flexWrap: "wrap", gap: 8 }} aria-label="Filter by inbox">
        <Link href={link({ box: null })} className={`badge ${!box ? "tone-blue" : "tone-neutral"}`}>All inboxes{totalUnread > 0 && ` · ${totalUnread}`}</Link>
        {boxes.map((b: any) => <Link key={b.id} href={link({ box: b.id })} className={`badge ${box === Number(b.id) ? "tone-blue" : "tone-neutral"}`}>{b.email}{b.unread > 0 && ` · ${b.unread}`}</Link>)}
        <span className="muted">|</span>
        <Link href={link({ show: all ? "" : "all" })} className="muted">{all ? "Showing all: show unread only" : "Showing unread: show all"}</Link>
        <Link href={link({ auto: withAuto ? "" : "1" })} className="muted">{withAuto ? "Hide automatic replies" : "Show automatic replies"}</Link>
      </div>
      <div style={{ marginBottom: 14 }}><EnableNotifications /></div>

      {boxes.length === 0 ? (
        <div className="card"><EmptyState title="No mailbox connected" icon={<InboxIcon size={22} />}>Connect a Google mailbox on the <Link href="/mailboxes">Mailboxes</Link> page, then send emails from a company page. Replies will appear here.</EmptyState></div>
      ) : replies.length === 0 ? (
        <div className="card"><EmptyState title={all ? "No replies yet" : "No unread replies"} icon={<InboxIcon size={22} />}>New replies appear here and as a notification while the CRM is open.</EmptyState></div>
      ) : (
        <ul className="stack" style={{ gap: 8 }}>
          {replies.map((r: any) => (
            <li key={r.id}>
              <Link href={`/inbox/${r.id}`} className="card stack" style={{ gap: 4, display: "flex", borderLeft: r.read_at ? undefined : "3px solid var(--accent)" }}>
                <span className="row-between">
                  <b style={{ fontWeight: r.read_at ? 500 : 700 }}>{r.from_name ?? r.from_email} <span className="muted" style={{ fontWeight: 400 }}>· {r.company}</span></b>
                  <span className="muted">{ago(r.received_at)}</span>
                </span>
                <span>{r.subject}</span>
                <span className="muted">{r.snippet}</span>
                <span className="row" style={{ gap: 6 }}>
                  <span className="badge tone-neutral">{r.mailbox}</span>
                  {r.looks_like_optout && <span className="badge tone-bad">Looks like an opt-out</span>}
                  {r.is_auto && <span className="badge tone-neutral">Automatic reply</span>}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
