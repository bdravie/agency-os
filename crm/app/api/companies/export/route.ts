import { query } from "@/lib/db";
import { toCsv } from "@/lib/csv";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await query(`SELECT name, domain, phone, address, postcode, niche, company_number, status, source FROM companies ORDER BY name`);
  const head = ["name", "domain", "phone", "address", "postcode", "niche", "company_number", "status", "source"];
  const csv = toCsv([head, ...rows.map((r) => head.map((h) => r[h]))]);
  return new Response(csv, { headers: { "content-type": "text/csv", "content-disposition": 'attachment; filename="companies.csv"' } });
}
