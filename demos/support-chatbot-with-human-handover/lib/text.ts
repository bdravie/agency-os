// Pure text rules shared by the chat, the handover and the tests. No I/O here.

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
// UK-style phone numbers: 07700 900123, +44 7700 900123, 0113 496 0000, (0113) 4960000
const PHONE = /(?:\+44\s?\(?0?\)?\s?|\(?0)\d{2,4}\)?[\s-]?\d{3,4}[\s-]?\d{3,4}/g;

/**
 * Removes email addresses and phone numbers before anything is sent to Claude or saved.
 * The demo collects a first name and an order number only, so contact details never need to be kept.
 */
export function maskContactDetails(text: string): { text: string; masked: boolean } {
  let masked = false;
  const out = text
    .replace(EMAIL, () => { masked = true; return "[email removed]"; })
    .replace(PHONE, () => { masked = true; return "[phone removed]"; });
  return { text: out, masked };
}

const UNHAPPY = [
  "complaint", "complain", "useless", "ridiculous", "unacceptable", "disgusting", "furious", "angry",
  "fed up", "rubbish", "worst", "joke", "scam", "speak to someone", "speak to a person", "real person",
  "human", "talk to a person", "talk to someone", "manager",
];

/** A plain word check: if the customer sounds unhappy or asks for a person, offer one straight away. */
export function soundsUnhappy(text: string): boolean {
  const t = ` ${text.toLowerCase().replace(/[^a-z' ]+/g, " ")} `;
  return UNHAPPY.some((w) => t.includes(` ${w} `) || t.includes(` ${w}s `));
}

/** Every number in the text (1pm counts as 1, £4.95 as 4.95). */
export function numbersIn(text: string): string[] {
  return (text.match(/\d+(?:\.\d+)?/g) ?? []).map((n) => String(Number(n)));
}

/**
 * The grounding check on Claude's answer: every number it states must appear in the articles it was given.
 * An answer that invents a delivery time, price or day count is refused and becomes "not sure".
 */
export function unsupportedNumbers(answer: string, sourceText: string): string[] {
  const allowed = new Set(numbersIn(sourceText));
  return [...new Set(numbersIn(answer))].filter((n) => !allowed.has(n));
}

/** Order numbers in the demo look like TH-10482. Anything else is refused so the field cannot hold other details. */
export function cleanOrderNumber(raw: string): string | null {
  const s = raw.trim().toUpperCase();
  if (!s) return "";
  return /^TH-\d{4,6}$/.test(s) ? s : null;
}

/** First name only: letters, spaces, hyphens and apostrophes, up to 30 characters. */
export function cleanFirstName(raw: string): string | null {
  const s = raw.trim().replace(/\s+/g, " ");
  if (!s) return "";
  return /^[\p{L}][\p{L}' -]{0,29}$/u.test(s) && !s.includes("@") ? s.split(" ")[0] : null;
}

/** Google Sheets holds at most 50,000 characters in a cell; keep the transcript well inside that. */
export function clip(text: string, max = 45000): string {
  return text.length <= max ? text : `${text.slice(0, max)}\n[... transcript shortened]`;
}
