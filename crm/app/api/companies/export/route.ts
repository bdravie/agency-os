import { query } from "@/lib/db";
import { toCsv } from "@/lib/csv";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await query(`SELECT c.name, c.domain, c.phone, c.address, c.postcode, c.niche, c.company_number, c.status, c.source, c.company_type, c.company_status, c.compliance_status, c.consent_basis, c.contact_source, c.opted_out, c.opted_out_at, g.sendable AS can_contact, su.score AS suitability, su.tier AS suitability_tier, c.maps_rating, c.maps_reviews, c.city, c.created_at FROM companies c JOIN lead_gate g ON g.company_id = c.id JOIN lead_suitability su ON su.company_id = c.id ORDER BY c.name`);
  const head = ["name", "domain", "phone", "address", "postcode", "niche", "company_number", "status", "source", "company_type", "company_status", "compliance_status", "consent_basis", "contact_source", "opted_out", "opted_out_at", "can_contact", "suitability", "suitability_tier", "maps_rating", "maps_reviews", "city", "created_at"];
  const csv = toCsv([head, ...rows.map((r) => head.map((h) => r[h]))]);
  return new Response(csv, { headers: { "content-type": "text/csv", "content-disposition": 'attachment; filename="companies.csv"' } });
}
