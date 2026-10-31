"use server";

import { revalidatePath } from "next/cache";
import { query } from "./db";
import { requireLogin } from "./auth";
import { contactOptOutAction } from "./apolloActions";
import { optOutAction } from "./complianceActions";

function refresh() { revalidatePath("/inbox"); revalidatePath("/"); }

export async function markReplyRead(id: number): Promise<void> {
  await requireLogin();
  await query(`UPDATE email_replies SET read_at = now() WHERE id = $1 AND read_at IS NULL`, [Number(id)]);
  refresh();
}

export async function markReplyUnread(form: FormData): Promise<void> {
  await requireLogin();
  await query(`UPDATE email_replies SET read_at = NULL WHERE id = $1`, [Number(form.get("id"))]);
  refresh();
}

/** `box` is a mailbox id, or empty for every inbox. */
export async function markAllRead(form: FormData): Promise<void> {
  await requireLogin();
  const box = Number(form.get("box")) || null;
  await query(`UPDATE email_replies SET read_at = now() WHERE read_at IS NULL AND ($1::bigint IS NULL OR mailbox_id = $1)`, [box]);
  refresh();
}

/** One click records the opt-out the reply asked for: the person if the reply came from a saved contact, otherwise the company. */
export async function recordReplyOptOut(form: FormData): Promise<{ error?: string } | void> {
  await requireLogin();
  const [r] = await query<{ id: number; company_id: number; contact_id: number | null }>(`SELECT id, company_id, contact_id FROM email_replies WHERE id = $1`, [Number(form.get("id"))]);
  if (!r) return { error: "Reply not found." };
  const f = new FormData();
  let res: { error?: string } | void;
  if (r.contact_id) { f.set("id", String(r.contact_id)); res = await contactOptOutAction(f); }
  else { f.set("id", String(r.company_id)); f.set("note", "Replied to say they do not want more emails"); res = await optOutAction(f); }
  if (res && res.error && !/already/i.test(res.error)) return res;   // "already opted out" is fine: the goal is met
  await query(`UPDATE email_replies SET read_at = COALESCE(read_at, now()) WHERE id = $1`, [r.id]);
  refresh();
}
