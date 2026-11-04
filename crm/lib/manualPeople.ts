// Pure logic for decision-makers pasted in by hand for one company. Nothing here touches the database or the network.
// Same guardrails as the Apollo import: only a work email on the company's own domain, or a LinkedIn profile link, is kept.
import { linkedinProfile, workEmail } from "./apolloMath.ts";

export const MAX_PASTED_PEOPLE = 20;
export const MAX_PASTED_CHARS = 8000;

export type PastedPerson = { first: string; last: string; name: string; role: string | null; email: string | null; linkedin: string | null };
export type PastedParse = { people: PastedPerson[]; skipped: string[]; error?: string };

const clean = (v: unknown, max: number) => String(v ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
const NAME = /^[\p{L}][\p{L}'’.-]{0,39}$/u;

/** One line to four fields. Tabs (a spreadsheet paste) are used if present; otherwise commas, semicolons or bars. The first two fields are the first and last name and the last is the contact detail, so a position containing commas still works. */
export function splitLine(line: string): string[] {
  if (line.includes("\t")) return line.split("\t").map((x) => x.trim());
  const sep = line.includes("|") ? "|" : line.includes(";") ? ";" : ",";
  const parts = line.split(sep).map((x) => x.trim());
  if (parts.length <= 4) return parts;
  return [parts[0], parts[1], parts.slice(2, -1).join(", "), parts[parts.length - 1]];
}

export function parsePastedPeople(text: string, companyDomain: string | null): PastedParse {
  if (typeof text !== "string" || !text.trim()) return { people: [], skipped: [] };
  if (text.length > MAX_PASTED_CHARS) return { people: [], skipped: [], error: "That is too much text. Paste up to 20 people at a time." };
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length > MAX_PASTED_PEOPLE) return { people: [], skipped: [], error: `Too many lines (${lines.length}). Paste up to ${MAX_PASTED_PEOPLE} people at a time.` };

  const people: PastedPerson[] = [], skipped: string[] = [], seen = new Set<string>();
  for (const line of lines) {
    const f = splitLine(line);
    const first = clean(f[0], 40), last = clean(f[1], 40);
    const label = [first, last].filter(Boolean).join(" ") || "A line";
    if (f.length < 4) { skipped.push(`${label}: needs first name, last name, position and contact detail`); continue; }
    if (!NAME.test(first) || !NAME.test(last)) { skipped.push(`${label}: the first and last name should each be a single name`); continue; }
    const detail = clean(f[3], 200);
    const email = workEmail(detail, companyDomain);
    const linkedin = email ? null : linkedinProfile(detail);
    if (!email && !linkedin) {
      skipped.push(/@/.test(detail)
        ? `${label}: ${companyDomain ? `the address isn't a work address on ${companyDomain}` : "add the company's website first, so the address can be checked"}`
        : `${label}: the contact detail must be a work email on the company's own domain or a LinkedIn profile link (no phone numbers or personal addresses)`);
      continue;
    }
    const key = email ?? linkedin!;
    if (seen.has(key)) { skipped.push(`${label}: listed twice`); continue; }
    seen.add(key);
    people.push({ first, last, name: `${first} ${last}`, role: clean(f[2], 100) || null, email, linkedin });
  }
  return { people, skipped };
}

export const manualConsentText = (date: string, unverified = false) =>
  `B2B corporate subscriber + legitimate interest. Work details added by the owner by hand from a public source on ${date}.` +
  (unverified ? " Saved before the company was verified as a limited company: it stays blocked for outreach until it is." : "");

/** People may be saved for a company that has simply not been verified yet (never looked up, or its number not found). Never for one that was
 *  looked up and is not a limited company, that has opted out, or that is on the suppression list. The outreach gate itself is unchanged. */
export const canSaveUnverified = (g: { compliance_status: string; opted_out: boolean; suppressed: boolean }) =>
  g.compliance_status === "unchecked" && !g.opted_out && !g.suppressed;
