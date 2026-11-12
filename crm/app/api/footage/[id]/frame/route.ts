import fs from "node:fs";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return new Response("Not found", { status: 404 });

  const [clip] = await query<{ frame_path: string | null }>(
    `SELECT frame_path FROM footage_clips WHERE id = $1`,
    [id]
  );

  if (!clip?.frame_path || !fs.existsSync(clip.frame_path)) {
    return new Response("Frame not found", { status: 404 });
  }

  try {
    const data = fs.readFileSync(clip.frame_path);
    return new Response(data, {
      headers: {
        "content-type": "image/jpeg",
        "cache-control": "private, max-age=86400",
        "x-content-type-options": "nosniff",
      },
    });
  } catch {
    return new Response("Error reading frame", { status: 500 });
  }
}
