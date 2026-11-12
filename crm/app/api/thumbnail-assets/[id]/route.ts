import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

// One logo from the cover library. Login is required by the middleware, like every other route. Only the three image
// types the upload accepts are ever served, with nosniff, so a stored file can never be run as a page or a script.
const SERVED = new Set(["image/png", "image/jpeg", "image/webp"]);

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) return new Response("Not found", { status: 404 });
  const [a] = await query<{ mime: string; data: Buffer }>(`SELECT mime, data FROM thumbnail_assets WHERE id = $1`, [id]);
  if (!a || !SERVED.has(a.mime)) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(a.data), {
    headers: { "content-type": a.mime, "cache-control": "private, max-age=86400", "x-content-type-options": "nosniff", "content-security-policy": "default-src 'none'" },
  });
}
