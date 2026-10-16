// Pure helpers for adding niches: tidy the name into a key and read SIC codes.

/** "Dental Practices (UK)" -> "dental_practices_uk". Returns null if nothing usable is left. */
export function nicheKey(name: string): string | null {
  const k = name.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40).replace(/_+$/, "");
  return /^[a-z][a-z0-9_]{1,39}$/.test(k) ? k : null;
}

/** "43220, 43210 and 43290" -> ["43220","43210","43290"]. Only 5-digit UK SIC 2007 codes; duplicates dropped. */
export function parseSicCodes(text: string): { codes: string[]; bad: string[] } {
  const parts = text.split(/[^0-9A-Za-z]+/).filter((p) => p && p.toLowerCase() !== "and");
  const codes: string[] = [], bad: string[] = [];
  for (const p of parts) { if (/^\d{5}$/.test(p)) { if (!codes.includes(p)) codes.push(p); } else bad.push(p); }
  return { codes, bad };
}

/** "roofer, flat roofing\nroof repairs" -> up to 8 short search terms. */
export const parseTerms = (text: string): string[] =>
  [...new Set(text.split(/[,\n]/).map((t) => t.trim().toLowerCase()).filter((t) => t.length >= 2 && t.length <= 60))].slice(0, 8);
