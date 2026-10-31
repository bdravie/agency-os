// Finds replies to emails the CRM sent. It lists message ids received recently, then opens ONLY the messages that sit in a thread
// the CRM started (matched by thread id). Every other message is never opened, stored or logged.
import { query } from "./db";
import { accessToken, getMessage, listReceived } from "./gmail";
import { parseMessage } from "./replyMath";
import { logActivity } from "./activity";

export type NewReply = { id: number; mailbox: string; from: string; company: string; subject: string | null; snippet: string; optOut: boolean };

const MIN_GAP_SECONDS = 75;      // Google is asked at most this often per mailbox, however many tabs are open
const LOOKBACK_DAYS = 60;        // replies to emails older than this are not looked for

/** Checks every connected mailbox. `force` skips the minimum gap (the Check now button). */
export async function checkReplies(force = false): Promise<{ added: NewReply[]; errors: string[] }> {
  const boxes = await query<{ id: number; email: string; refresh_token_enc: string }>(`SELECT id, email, refresh_token_enc FROM mailboxes WHERE active AND refresh_token_enc IS NOT NULL ORDER BY id`);
  const added: NewReply[] = [], errors: string[] = [];
  for (const box of boxes) {
    // Claim this check in the database so two tabs (or the poller and a button) never read the same mailbox at once.
    const [claim] = await query<{ prev: Date | null }>(
      `UPDATE mailboxes m SET last_checked_at = now() FROM (SELECT last_checked_at AS prev FROM mailboxes WHERE id = $1 FOR UPDATE) p
        WHERE m.id = $1 AND ($2::boolean OR p.prev IS NULL OR p.prev < now() - make_interval(secs => $3)) RETURNING p.prev`, [box.id, force, MIN_GAP_SECONDS]);
    if (!claim) continue;
    try {
      const known = await query<{ id: number; thread: string; company_id: number; contact_id: number | null; message: string | null }>(
        `SELECT id, gmail_thread_id AS thread, company_id, contact_id, gmail_message_id AS message FROM sent_emails
          WHERE mailbox_id = $1 AND status = 'sent' AND gmail_thread_id IS NOT NULL AND sent_at > now() - make_interval(days => $2) ORDER BY sent_at`, [box.id, LOOKBACK_DAYS]);
      if (known.length === 0) { await query(`UPDATE mailboxes SET last_error = NULL WHERE id = $1`, [box.id]); continue; }   // nothing sent yet: Gmail is not even contacted
      const byThread = new Map(known.map((k) => [k.thread, k]));
      const floor = Date.now() - LOOKBACK_DAYS * 86_400_000;
      const since = claim.prev ? new Date(claim.prev).getTime() - 2 * 3_600_000 : Date.now() - 7 * 86_400_000;   // two hours of overlap; duplicates are ignored by id
      const token = await accessToken(box);
      const candidates = (await listReceived(token, Math.floor(Math.max(since, floor) / 1000))).filter((m) => byThread.has(m.threadId));
      const have = candidates.length ? new Set((await query<{ id: string }>(`SELECT gmail_message_id AS id FROM email_replies WHERE gmail_message_id = ANY($1::text[])`, [candidates.map((c) => c.id)])).map((r) => r.id)) : new Set<string>();
      for (const c of candidates) {
        if (have.has(c.id) || known.some((k) => k.message === c.id)) continue;
        const parsed = parseMessage(await getMessage(token, c.id));
        if (!parsed || parsed.fromEmail === box.email.toLowerCase()) continue;
        const sent = byThread.get(c.threadId)!;
        const [row] = await query<{ id: number }>(
          `INSERT INTO email_replies (sent_email_id, mailbox_id, company_id, contact_id, gmail_message_id, gmail_thread_id, from_email, from_name, subject, body, received_at, is_auto, looks_like_optout)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) ON CONFLICT (gmail_message_id) DO NOTHING RETURNING id`,
          [sent.id, box.id, sent.company_id, sent.contact_id, parsed.id, parsed.threadId, parsed.fromEmail, parsed.fromName, parsed.subject?.slice(0, 300) ?? null, parsed.text, parsed.receivedAt, parsed.auto, parsed.optOut]);
        if (!row || parsed.auto) continue;
        const [co] = await query<{ name: string }>(`SELECT COALESCE(display_name, name) AS name FROM companies WHERE id = $1`, [sent.company_id]);
        await logActivity("email_reply", { company_id: sent.company_id, contact_id: sent.contact_id, channel: "email", body: `Reply from ${parsed.fromName ?? parsed.fromEmail}: ${parsed.text.replace(/\s+/g, " ").slice(0, 200)}` });
        await query(`UPDATE companies SET status = 'Replied' WHERE id = $1 AND status IN ('New', 'Contacted')`, [sent.company_id]);
        added.push({ id: Number(row.id), mailbox: box.email, from: parsed.fromName ?? parsed.fromEmail, company: co?.name ?? "", subject: parsed.subject, snippet: parsed.text.replace(/\s+/g, " ").slice(0, 140), optOut: parsed.optOut });
      }
      await query(`UPDATE mailboxes SET last_error = NULL WHERE id = $1`, [box.id]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not check this mailbox.";
      errors.push(`${box.email}: ${msg}`);
      // Put the clock back so the next check covers the same window again.
      await query(`UPDATE mailboxes SET last_checked_at = $2, last_error = $3 WHERE id = $1`, [box.id, claim.prev, msg.slice(0, 300)]);
    }
  }
  return { added, errors };
}
