import { query } from "@/lib/db";
import { fileInfo } from "@/lib/enablementMath";

export const dynamic = "force-dynamic";

// Training files handed to clients. Login is enforced by middleware. Files are only ever offered as downloads, never shown in the page,
// the content type comes from the allow-listed extension (not the upload), and the sandbox policy stops anything running even if opened directly.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return new Response("Not found", { status: 404 });
  const [f] = await query<{ filename: string; data: Buffer }>(`SELECT filename, data FROM enablement_files WHERE id = $1`, [id]);
  const info = f && fileInfo(f.filename);
  if (!f || !info) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(f.data), { headers: {
    "content-type": info.contentType, "content-disposition": `attachment; filename="${f.filename.replace(/["\\\r\n]/g, "")}"`,
    "x-content-type-options": "nosniff", "content-security-policy": "sandbox; default-src 'none'", "cache-control": "private, no-store",
  } });
}
