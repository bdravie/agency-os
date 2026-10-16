import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

// Saved files (audit PDFs). Login is enforced by middleware.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return new Response("Not found", { status: 404 });
  const [d] = await query<{ filename: string; content_type: string; data: Buffer }>(`SELECT filename, content_type, data FROM company_documents WHERE id = $1`, [id]);
  if (!d) return new Response("Not found", { status: 404 });
  const download = new URL(req.url).searchParams.has("download");
  return new Response(new Uint8Array(d.data), { headers: { "content-type": d.content_type, "content-disposition": `${download ? "attachment" : "inline"}; filename="${d.filename.replace(/"/g, "")}"`, "cache-control": "private, no-store" } });
}
