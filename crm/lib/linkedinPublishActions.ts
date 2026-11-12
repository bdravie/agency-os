"use server";

import { revalidatePath } from "next/cache";
import { query } from "./db";
import { requireLogin } from "./auth";
import { logActivity } from "./activity";
import { markPosted } from "./contentPostActions";
import { LINKEDIN_FORMAT, openingLine, postProblem } from "./linkedinMath";
import { dailyCap, documentTitle, mediaKind, postUrlFromUrn, toCommentary } from "./linkedinApiMath";
import { LinkedInAuthError, createPost, getLinkedInConnection, tokenOf, uploadMedia } from "./linkedinApi";

// Click-to-post (L6, approved by the owner 12 Nov 2026): one LinkedIn post at a time, only on the owner's click and after a confirmation
// that names the profile, to the owner's own profile. Never scheduled, never in batches, never read back from LinkedIn.

type Result = { ok: true; url: string; recorded: boolean; message: string } | { ok: false; error: string };

/**
 * Posts one LinkedIn post now. The form carries the post's id, the profile the owner saw in the confirmation (so a profile changed in another tab
 * is caught), and optionally the image (PNG) or carousel (PDF) the browser drew from the chosen image. On success it is recorded exactly as if the owner
 * had pasted the link into the Posted dialog: the post moves to Posted, its reminder is closed, and its numbers are asked for at 24 h, 72 h and 7 days.
 */
export async function publishLinkedInAction(form: FormData): Promise<Result> {
  await requireLogin();
  const id = Number(form.get("id"));
  const [post] = Number.isInteger(id) && id > 0 ? await query<any>(`SELECT id, idea, script, hook, status FROM content_items WHERE id = $1 AND format = $2`, [id, LINKEDIN_FORMAT]) : [];
  if (!post) return { ok: false, error: "That post no longer exists." };
  if (post.status === "Posted") return { ok: false, error: "This post has already gone out." };
  const text = String(post.script ?? "").trim();
  if (!text) return { ok: false, error: "Write and save the post first." };
  const problem = postProblem(post.idea, text);
  if (problem) return { ok: false, error: problem };

  const conn = await getLinkedInConnection();
  if (!conn) return { ok: false, error: "Connect LinkedIn first." };
  if (String(form.get("profile") ?? "") !== conn.person_sub) return { ok: false, error: "The connected LinkedIn profile changed since you opened this page. Reload and check who it posts as." };

  // The attachment, told by its own bytes: only a PNG image or a PDF carousel, within size.
  const file = form.get("media");
  let media: { kind: "image" | "document"; bytes: Uint8Array } | null = null;
  if (file instanceof File && file.size > 0) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const k = mediaKind(bytes);
    if ("error" in k) return { ok: false, error: k.error };
    media = { kind: k.kind, bytes };
  }

  const cap = dailyCap();
  const [{ n }] = await query<{ n: string }>(`SELECT count(*) AS n FROM linkedin_publishes WHERE status = 'posted' AND posted_at > now() - interval '24 hours'`);
  if (Number(n) >= cap) return { ok: false, error: `You have posted ${n} times to LinkedIn from here in the last 24 hours, the daily limit (LINKEDIN_DAILY_CAP). Post this one tomorrow, or by hand.` };

  // Claim the post first: the unique row means a double click or a second tab cannot post it twice. A failed attempt may be tried again.
  const claimed = await query<{ id: string }>(
    `INSERT INTO linkedin_publishes (content_item_id, connection_id, status, media_kind) VALUES ($1, $2, 'posting', $3)
     ON CONFLICT (content_item_id) DO UPDATE SET status = 'posting', connection_id = EXCLUDED.connection_id, media_kind = EXCLUDED.media_kind, error = NULL, created_at = now()
       WHERE linkedin_publishes.status = 'failed'
     RETURNING id`, [post.id, conn.id, media?.kind ?? null]);
  if (!claimed.length) {
    const [p] = await query<{ status: string; post_urn: string | null }>(`SELECT status, post_urn FROM linkedin_publishes WHERE content_item_id = $1`, [post.id]);
    return { ok: false, error: p?.status === "posted" ? `This post is already on LinkedIn${p.post_urn ? ` (${postUrlFromUrn(p.post_urn)})` : ""}.` : "This post is being sent already. Wait a moment, then reload." };
  }

  const author = `urn:li:person:${conn.person_sub}`;
  let urn: string;
  try {
    const token = tokenOf(conn);
    const asset = media ? await uploadMedia(token, author, media.kind, media.bytes) : null;
    urn = await createPost(token, author, toCommentary(text),
      asset ? (media!.kind === "document" ? { id: asset, title: documentTitle(post.idea) } : { id: asset, altText: post.idea.slice(0, 120) }) : null);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await query(`UPDATE linkedin_publishes SET status = 'failed', error = $2 WHERE content_item_id = $1`, [post.id, message.slice(0, 500)]);
    if (err instanceof LinkedInAuthError) await query(`UPDATE linkedin_connections SET last_error = $2 WHERE id = $1`, [conn.id, message.slice(0, 300)]);
    return { ok: false, error: `Nothing was posted: ${message}` };
  }

  // Saved straight away, so even if recording below fails the post is never sent twice.
  await query(`UPDATE linkedin_publishes SET status = 'posted', post_urn = $2, posted_at = now() WHERE content_item_id = $1`, [post.id, urn]);
  await logActivity("linkedin_published", { channel: "linkedin", body: `Posted "${post.idea}" to LinkedIn`, meta: { content_item_id: Number(post.id), post_urn: urn } });
  const url = postUrlFromUrn(urn);
  revalidatePath("/content"); revalidatePath(`/content/linkedin/${post.id}`);
  if (!url) return { ok: true, url: "https://www.linkedin.com/feed/", recorded: false, message: "Posted to LinkedIn. Its link could not be worked out, so record it from the post on your profile." };
  const r = await markPosted(Number(post.id), [{ platform: "linkedin", url }], openingLine(text) || post.hook || "", null);
  return r.ok
    ? { ok: true, url, recorded: true, message: "Posted to LinkedIn and recorded. Its numbers will be asked for at 24 hours, 72 hours and 7 days." }
    : { ok: true, url, recorded: false, message: `Posted to LinkedIn, but recording it here failed (${r.error}). Use I've posted it with the link.` };
}

/** Forgets the LinkedIn connection here. To remove the app's access on LinkedIn too: Settings > Data privacy > Permitted services. */
export async function disconnectLinkedInAction(): Promise<{ error?: string }> {
  await requireLogin();
  await query(`DELETE FROM linkedin_connections`);
  await logActivity("linkedin_disconnected", { channel: "linkedin", body: "Disconnected LinkedIn" });
  revalidatePath("/content");
  return {};
}
