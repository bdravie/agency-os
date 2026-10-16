import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

// Everything the content quick-view panel needs. Login is enforced by middleware.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return Response.json({ error: "Not found" }, { status: 404 });
  const [item] = await query<any>(
    `SELECT id, idea, hook, format, platforms, script, caption, keyword, status, posted_at, created_at, scheduled_for::text AS day
       FROM content_items WHERE id = $1`, [id]);
  if (!item) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json({ item });
}
