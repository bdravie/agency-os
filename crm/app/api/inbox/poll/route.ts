import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { checkReplies } from "@/lib/replies";

export const dynamic = "force-dynamic";

// Called by the open CRM tab every minute or so: checks for new replies (Google is asked at most every ~75 seconds per mailbox)
// and returns the unread count plus the newest unread replies so the tab can show a notification for any it has not announced yet.
export async function GET() {
  const [{ n: connected }] = await query<{ n: string }>(`SELECT count(*) AS n FROM mailboxes WHERE active AND refresh_token_enc IS NOT NULL`);
  if (Number(connected) > 0) await checkReplies().catch(() => {});   // an error here is shown on the Mailboxes page, not in every tab
  const [{ n }] = await query<{ n: string }>(`SELECT count(*) AS n FROM email_replies WHERE read_at IS NULL AND NOT is_auto`);
  const latest = await query<{ id: string; from: string; company: string; mailbox: string; subject: string | null; snippet: string; optout: boolean }>(
    `SELECT r.id, COALESCE(r.from_name, r.from_email) AS "from", COALESCE(c.display_name, c.name) AS company, m.email AS mailbox, r.subject,
            left(regexp_replace(r.body, '\\s+', ' ', 'g'), 140) AS snippet, r.looks_like_optout AS optout
       FROM email_replies r JOIN companies c ON c.id = r.company_id JOIN mailboxes m ON m.id = r.mailbox_id
      WHERE r.read_at IS NULL AND NOT r.is_auto ORDER BY r.id DESC LIMIT 5`);
  return NextResponse.json({ connected: Number(connected), unread: Number(n), latest: latest.map((r) => ({ ...r, id: Number(r.id) })) });
}
