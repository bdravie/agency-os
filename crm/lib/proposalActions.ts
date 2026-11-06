"use server";

import { revalidatePath } from "next/cache";
import { requireLogin } from "./auth";
import { logActivity } from "./activity";
import { query, tx } from "./db";
import { proposalName } from "./proposalName";
import { cleanDetails } from "./proposalEdit";
import { archiveLabel, cannotDelete, deletionLabel, deletionProblem, isArchiveReason, isStatus, lostProblem, proposalLostLabel } from "./proposalStatus";

// The proposal pipeline: move, archive, restore, delete and edit. Everything here is a click by the owner; nothing is ever sent to Upwork.
// The status rules live in proposalStatus.ts so the screen and the actions read the same thing.

const MAX_BULK = 100;

function refresh(id?: number) {
  for (const path of ["/proposals", "/proposals/deleted", "/"]) revalidatePath(path);
  if (id) revalidatePath(`/proposals/${id}`);
}

/** Ids from the browser are checked again here: whole, positive, no repeats, and not more than a screenful. */
function cleanIds(ids: unknown): number[] | null {
  if (!Array.isArray(ids)) return null;
  const out = [...new Set(ids.map(Number))];
  if (out.length === 0 || out.length > MAX_BULK || out.some((n) => !Number.isInteger(n) || n <= 0)) return null;
  return out;
}

/** Move one proposal to another status. Lost needs a reason; leaving Lost clears it. Throws a readable message, like moveDeal. */
export async function moveProposal(id: number, status: string, lostReason?: string, lostNote?: string): Promise<void> {
  await requireLogin();
  if (!Number.isInteger(id) || !isStatus(status)) throw new Error("Unknown status");
  const isLost = status === "Lost";
  if (isLost) { const problem = lostProblem(lostReason); if (problem) throw new Error(problem); }
  const note = isLost ? (lostNote ?? "").trim().slice(0, 500) || null : null;
  const rows = await query<{ old: string; job_title: string | null; company_name: string | null }>(
    `UPDATE proposals p SET status = $2::text,
            status_changed_at = CASE WHEN prev.old <> $2::text THEN now() ELSE p.status_changed_at END,
            sent_at = CASE WHEN $2::text <> 'Draft' AND p.sent_at IS NULL THEN now() ELSE p.sent_at END,
            lost_reason = CASE WHEN $2::text = 'Lost' THEN $3::text ELSE NULL END,
            lost_note   = CASE WHEN $2::text = 'Lost' THEN $4::text ELSE NULL END
       FROM (SELECT id, status AS old FROM proposals WHERE id = $1) prev
      WHERE p.id = prev.id RETURNING prev.old, p.job_title, p.company_name`,
    [id, status, isLost ? lostReason : null, note],
  );
  if (!rows[0]) throw new Error("This proposal no longer exists.");
  if (rows[0].old === status) return;
  await logActivity("proposal_status", {
    channel: "upwork",
    body: `${proposalName({ id, ...rows[0] })}: ${rows[0].old} → ${status}${isLost ? ` (${proposalLostLabel(lostReason)}${note ? `: ${note}` : ""})` : ""}`,
  });
  refresh(id);
}

/** Set proposals aside as "not pursuing". Reversible; the reason is optional. Returns how many were archived. */
export async function archiveProposals(ids: number[], reason?: string): Promise<{ done: number } | { error: string }> {
  await requireLogin();
  const list = cleanIds(ids);
  if (!list) return { error: `Choose between 1 and ${MAX_BULK} proposals.` };
  if (reason && !isArchiveReason(reason)) return { error: "Unknown reason." };
  const rows = await query<{ id: number }>(
    `UPDATE proposals SET archived_at = now(), archive_reason = $2::text WHERE id = ANY($1::bigint[]) AND archived_at IS NULL RETURNING id`, [list, reason || null]);
  if (rows.length) await logActivity("proposal_archived", { channel: "upwork", body: `${rows.length} proposal${rows.length === 1 ? "" : "s"} archived (${archiveLabel(reason)}): #${rows.map((r) => r.id).join(", #")}` });
  refresh(list.length === 1 ? list[0] : undefined);
  return { done: rows.length };
}

export async function restoreProposals(ids: number[]): Promise<{ done: number } | { error: string }> {
  await requireLogin();
  const list = cleanIds(ids);
  if (!list) return { error: `Choose between 1 and ${MAX_BULK} proposals.` };
  const rows = await query<{ id: number }>(
    `UPDATE proposals SET archived_at = NULL, archive_reason = NULL WHERE id = ANY($1::bigint[]) AND archived_at IS NOT NULL RETURNING id`, [list]);
  if (rows.length) await logActivity("proposal_restored", { channel: "upwork", body: `${rows.length} proposal${rows.length === 1 ? "" : "s"} restored: #${rows.map((r) => r.id).join(", #")}` });
  refresh(list.length === 1 ? list[0] : undefined);
  return { done: rows.length };
}

/**
 * Delete for good. Needs a category and a written note, kept in proposal_deletions with a copy of the whole row.
 * Only drafts and archived proposals, never a won one. One that can't be deleted is skipped and named, not silently dropped.
 */
export async function deleteProposals(ids: number[], category: string, note: string): Promise<{ deleted: number; skipped: string[] } | { error: string }> {
  await requireLogin();
  const list = cleanIds(ids);
  if (!list) return { error: `Choose between 1 and ${MAX_BULK} proposals.` };
  const problem = deletionProblem(category, note);
  if (problem) return { error: problem };
  const reason = note.trim();
  const result = await tx(async (c) => {
    const { rows } = await c.query(`SELECT * FROM proposals WHERE id = ANY($1::bigint[]) ORDER BY id FOR UPDATE`, [list]);
    const gone: { id: number; name: string }[] = [];
    const skipped: string[] = [];
    for (const p of rows) {
      const name = proposalName(p);
      const why = cannotDelete(p);
      if (why) { skipped.push(`${name}: ${why}`); continue; }
      await c.query(
        `INSERT INTO proposal_deletions (proposal_id, job_title, company_name, status, category, note, snapshot) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [p.id, p.job_title, p.company_name, p.status, category, reason, JSON.stringify(p)]);
      await c.query(`DELETE FROM proposals WHERE id = $1`, [p.id]);
      gone.push({ id: p.id, name });
    }
    if (rows.length < list.length) skipped.push(`${list.length - rows.length} no longer exist${list.length - rows.length === 1 ? "s" : ""}.`);
    return { gone, skipped };
  });
  if (result.gone.length) {
    await logActivity("proposal_deleted", { channel: "upwork", body: `${result.gone.map((g) => g.name).join("; ").slice(0, 300)}: deleted (${deletionLabel(category)}): ${reason}` });
  }
  refresh();
  return { deleted: result.gone.length, skipped: result.skipped };
}

/** Edit the details of one proposal. Returns { error } for the form to show, nothing otherwise. */
export async function updateProposalDetails(form: FormData): Promise<{ error: string } | undefined> {
  await requireLogin();
  const id = Number(form.get("id"));
  if (!Number.isInteger(id) || id <= 0) return { error: "Unknown proposal." };
  const checked = cleanDetails({
    job_title: form.get("job_title"), company_name: form.get("company_name"), job_url: form.get("job_url"),
    job_text: form.get("job_text"),
  });
  if (!checked.ok) return { error: checked.error };
  const v = checked.value;
  const rows = await query<{ textChanged: boolean }>(
    `UPDATE proposals p SET job_title = $2, company_name = $3, job_url = $4, job_text = $5
       FROM (SELECT id, job_text AS old_text FROM proposals WHERE id = $1) prev
      WHERE p.id = prev.id RETURNING (prev.old_text IS DISTINCT FROM $5::text) AS "textChanged"`,
    [id, v.job_title, v.company_name, v.job_url, v.job_text]);
  if (!rows[0]) return { error: "This proposal no longer exists." };
  await logActivity("proposal_edited", { channel: "upwork", body: `${proposalName({ id, ...v })}: details edited${rows[0].textChanged ? " (job post changed)" : ""}` });
  refresh(id);
}
