// Pure logic for importing people from a CSV exported from Apollo's website, for one company. Nothing here touches the database.
import { parseCsv } from "./csv.ts";
import { linkedinProfile, workEmail } from "./apolloMath.ts";

export const MAX_IMPORT_ROWS = 50;
export const MAX_IMPORT_BYTES = 200_000;

export type ImportPerson = { name: string; role: string | null; email: string; linkedin: string | null; emailStatus: string | null };
export type ImportParse = { people: ImportPerson[]; skipped: string[]; error?: string };

const clean = (v: unknown, max: number) => String(v ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
const norm = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, "");
// Apollo's export headers vary a little, so each field accepts a few names.
const HEADS: Record<string, string[]> = {
  first: ["firstname"], last: ["lastname"], full: ["name", "fullname"], title: ["title", "jobtitle"],
  email: ["email", "workemail", "emailaddress"], status: ["emailstatus"], linkedin: ["personlinkedinurl", "linkedinurl", "linkedin"],
};
const col = (header: string[], key: string) => header.findIndex((h) => HEADS[key].includes(norm(h)));

/** Reads the CSV and keeps only people with a work address on this company's own website domain. Everything else is listed in `skipped` with the reason. */
export function parseApolloCsv(text: string, companyDomain: string): ImportParse {
  if (typeof text !== "string" || !text.trim()) return { people: [], skipped: [], error: "The file is empty." };
  if (text.length > MAX_IMPORT_BYTES) return { people: [], skipped: [], error: "That file is too big. Export a smaller list from Apollo." };
  const rows = parseCsv(text);
  const header = rows[0] ?? [];
  const ci = { first: col(header, "first"), last: col(header, "last"), full: col(header, "full"), title: col(header, "title"), email: col(header, "email"), status: col(header, "status"), linkedin: col(header, "linkedin") };
  if (ci.email < 0 || (ci.full < 0 && ci.first < 0)) return { people: [], skipped: [], error: "I couldn't find the Email and Name (or First Name) columns. Export from Apollo with those columns included." };
  const body = rows.slice(1);
  if (body.length > MAX_IMPORT_ROWS) return { people: [], skipped: [], error: `Too many rows (${body.length}). Import up to ${MAX_IMPORT_ROWS} at a time.` };

  const people: ImportPerson[] = [], skipped: string[] = [], seen = new Set<string>();
  for (const r of body) {
    const name = clean(ci.full >= 0 && r[ci.full]?.trim() ? r[ci.full] : `${r[ci.first] ?? ""} ${ci.last >= 0 ? r[ci.last] ?? "" : ""}`, 80);
    const rawEmail = clean(r[ci.email], 120);
    const label = name || "A row";
    if (!name) { skipped.push("A row had no name"); continue; }
    if (!rawEmail) { skipped.push(`${label}: no email in the file`); continue; }
    const email = workEmail(rawEmail, companyDomain);
    if (!email) { skipped.push(`${label}: the address isn't a work address on ${companyDomain}`); continue; }
    if (seen.has(email)) { skipped.push(`${label}: listed twice`); continue; }
    seen.add(email);
    people.push({ name, role: (ci.title >= 0 ? clean(r[ci.title], 100) : "") || null, email, linkedin: ci.linkedin >= 0 ? linkedinProfile(r[ci.linkedin]) : null, emailStatus: (ci.status >= 0 ? clean(r[ci.status], 30) : "") || null });
  }
  return { people, skipped };
}

export const importConsentText = (date: string) => `B2B corporate subscriber + legitimate interest. Work details from a manual Apollo export on ${date}.`;
