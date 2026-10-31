"use server";

import { revalidatePath } from "next/cache";
import { query, tx } from "./db";
import { requireLogin } from "./auth";
import { assertSendable } from "./complianceGate";
import { accessToken, MailboxAuthError, sendRaw } from "./gmail";
import { buildRaw, isEmail } from "./mime";
import { contentProblems, remainingToday, sequenceProblem } from "./sendRules";
import { markOutreachSent } from "./actions";

type Input = { companyId: number; contactId: number | null; kind: "first" | "followup"; subject: string; body: string; mailboxId: number };

// London's day, so "today's cap" resets at midnight UK time.
const DAY_START = `(date_trunc('day', now() AT TIME ZONE 'Europe/London') AT TIME ZONE 'Europe/London')`;

/** Sends ONE email, only when the owner clicks Send. Every check runs here, on the server, whatever the browser says. */
export async function sendEmailAction(input: Input): Promise<{ ok?: true; to?: string; mailbox?: string; warning?: string; error?: string }> {
  await requireLogin();
  const companyId = Number(input.companyId), mailboxId = Number(input.mailboxId);
  const kind = input.kind === "followup" ? "followup" : input.kind === "first" ? "first" : null;
  if (!kind || !companyId || !mailboxId) return { error: "Choose the email type and the mailbox to send from." };
  const subject = String(input.subject ?? "").trim(), body = String(input.body ?? "").trim();

  const sender = process.env.SENDER_NAME?.trim(), business = process.env.BUSINESS_NAME?.trim();
  if (!sender || !business) return { error: "Set SENDER_NAME and BUSINESS_NAME first. Every email carries your real name and business name." };
  const problems = contentProblems({ subject, body, senderName: sender, businessName: business });
  if (problems.length) return { error: problems[0] };

  // 1. Who it goes to, and whether they may be contacted: the company, the person, and the address itself.
  try { await assertSendable(companyId); } catch (e) { return { error: e instanceof Error ? e.message : "Blocked." }; }
  let to: string | null = null, contactId: number | null = null;
  if (input.contactId) {
    const [ct] = await query<{ id: number; name: string; email: string | null; sendable: boolean }>(
      `SELECT ct.id, ct.name, ct.email, cg.sendable FROM contacts ct JOIN contact_gate cg ON cg.contact_id = ct.id WHERE ct.id = $1 AND ct.company_id = $2`, [Number(input.contactId), companyId]);
    if (!ct) return { error: "That contact isn't at this company." };
    if (!ct.sendable) return { error: `Blocked: ${ct.name} has opted out, is suppressed, or has no email address.` };
    to = ct.email; contactId = Number(ct.id);
  } else {
    const [co] = await query<{ generic_email: string | null }>(`SELECT generic_email FROM companies WHERE id = $1`, [companyId]);
    to = co?.generic_email ?? null;
  }
  if (!to || !isEmail(to)) return { error: "There is no valid email address to send to." };
  to = to.trim().toLowerCase();
  const [blocked] = await query(`SELECT 1 FROM suppression WHERE lower(email) = $1 OR lower(domain) = $2 LIMIT 1`, [to, to.split("@")[1]]);
  if (blocked) return { error: "Blocked: this address or its domain is on the suppression list." };

  // 2. Reserve a place under the mailbox's daily cap. The lock makes two quick clicks unable to both squeeze under it.
  const reserved = await tx(async (c) => {
    await c.query(`SELECT pg_advisory_xact_lock(7001, $1)`, [mailboxId]);
    const { rows: [box] } = await c.query(`SELECT id, email, active, refresh_token_enc, daily_cap FROM mailboxes WHERE id = $1`, [mailboxId]);
    if (!box || !box.active || !box.refresh_token_enc) return { error: "That mailbox is not connected. Connect it on the Mailboxes page." };
    const { rows: [u] } = await c.query(`SELECT count(*)::int AS n FROM sent_emails WHERE mailbox_id = $1 AND status IN ('sent', 'sending') AND created_at >= ${DAY_START}`, [mailboxId]);
    if (remainingToday(box.daily_cap, u.n) === 0) return { error: `${box.email} has reached today's limit of ${box.daily_cap}. Raise it on the Mailboxes page only if the mailbox is warmed up.` };
    const { rows: prior } = await c.query(`SELECT kind, count(*)::int AS n FROM sent_emails WHERE lower(to_email) = $1 AND status IN ('sent', 'sending') GROUP BY kind`, [to]);
    const n = (k: string) => prior.find((p) => p.kind === k)?.n ?? 0;
    const seq = sequenceProblem(kind, { first: n("first"), followup: n("followup") });
    if (seq) return { error: seq };
    const { rows: [row] } = await c.query(
      `INSERT INTO sent_emails (mailbox_id, company_id, contact_id, kind, to_email, subject, body) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`, [mailboxId, companyId, contactId, kind, to, subject, body]);
    return { id: Number(row.id), box: { id: Number(box.id), email: String(box.email), refresh_token_enc: String(box.refresh_token_enc) } };
  });
  if ("error" in reserved) return { error: reserved.error };

  // 3. Send it.
  let sent: { id: string; threadId: string };
  try {
    const token = await accessToken(reserved.box);
    sent = await sendRaw(token, buildRaw({ from: { name: sender, email: reserved.box.email }, to, subject, body }));
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Sending failed.";
    await query(`UPDATE sent_emails SET status = 'failed', error = $2 WHERE id = $1`, [reserved.id, msg.slice(0, 300)]);
    if (e instanceof MailboxAuthError) await query(`UPDATE mailboxes SET last_error = $2 WHERE id = $1`, [mailboxId, msg.slice(0, 300)]);
    return { error: `Not sent: ${msg}` };
  }
  await query(`UPDATE sent_emails SET status = 'sent', sent_at = now(), gmail_message_id = $2, gmail_thread_id = $3 WHERE id = $1`, [reserved.id, sent.id, sent.threadId]);

  // 4. Record it like any other logged send (activity, status Contacted, the one follow-up task). The email has gone either way.
  revalidatePath(`/companies/${companyId}`); revalidatePath("/mailboxes");
  try {
    const r = await markOutreachSent(companyId, kind, subject, contactId ?? undefined);
    if (r && r.error) return { ok: true, to, mailbox: reserved.box.email, warning: `Sent, but the activity could not be logged: ${r.error}` };
  } catch (e) {
    return { ok: true, to, mailbox: reserved.box.email, warning: `Sent, but the activity could not be logged: ${e instanceof Error ? e.message : "unknown error"}` };
  }
  return { ok: true, to, mailbox: reserved.box.email };
}
