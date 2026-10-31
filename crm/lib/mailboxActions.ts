"use server";

import { revalidatePath } from "next/cache";
import { query } from "./db";
import { requireLogin } from "./auth";
import { decryptToken } from "./mailCrypto";
import { revokeToken } from "./gmail";
import { checkReplies } from "./replies";

export async function saveMailbox(form: FormData): Promise<{ error?: string } | void> {
  await requireLogin();
  const id = Number(form.get("id")) || 0;
  const cap = Math.round(Number(form.get("daily_cap")));
  if (!Number.isFinite(cap) || cap < 0 || cap > 500) return { error: "The daily limit must be between 0 and 500." };
  const name = String(form.get("display_name") ?? "").trim().slice(0, 80) || null;
  const [row] = await query(`UPDATE mailboxes SET daily_cap = $2, active = $3, display_name = $4 WHERE id = $1 RETURNING id`, [id, cap, form.get("active") === "on", name]);
  if (!row) return { error: "Mailbox not found." };
  revalidatePath("/mailboxes");
}

/** Forgets the token (and tells Google to cancel it). The mailbox and its sent history stay. */
export async function disconnectMailbox(form: FormData): Promise<{ error?: string } | void> {
  await requireLogin();
  const id = Number(form.get("id")) || 0;
  const [box] = await query<{ refresh_token_enc: string | null }>(`SELECT refresh_token_enc FROM mailboxes WHERE id = $1`, [id]);
  if (!box) return { error: "Mailbox not found." };
  if (box.refresh_token_enc) { try { await revokeToken(decryptToken(box.refresh_token_enc, process.env.SESSION_SECRET ?? "")); } catch { /* already unreadable: nothing to revoke */ } }
  await query(`UPDATE mailboxes SET refresh_token_enc = NULL, active = false, last_error = NULL WHERE id = $1`, [id]);
  revalidatePath("/mailboxes"); revalidatePath("/inbox");
}

/** The Check now button: looks for replies straight away. */
export async function checkRepliesNow(): Promise<{ message?: string; error?: string }> {
  await requireLogin();
  const r = await checkReplies(true);
  revalidatePath("/inbox"); revalidatePath("/mailboxes");
  if (r.errors.length) return { error: r.errors[0] };
  return { message: r.added.length ? `${r.added.length} new repl${r.added.length === 1 ? "y" : "ies"}` : "No new replies" };
}
