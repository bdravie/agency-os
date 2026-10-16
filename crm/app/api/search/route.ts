import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

// Quick-jump search for the command palette. Login is enforced by middleware.
export async function GET(req: Request) {
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim().slice(0, 80);
  if (q.length < 2) return Response.json({ companies: [] });
  const companies = await query<{ id: number; name: string; domain: string | null; status: string }>(
    `SELECT id, name, domain, status FROM companies
      WHERE name ILIKE '%' || $1 || '%' OR domain ILIKE '%' || $1 || '%'
      ORDER BY (lower(name) LIKE lower($1) || '%') DESC, name LIMIT 6`, [q]);
  return Response.json({ companies });
}
