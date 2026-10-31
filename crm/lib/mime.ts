// Builds a plain-text email in the format Gmail's send call wants. Pure, so it can be tested on its own.
// Text only: no HTML, no images, no tracking.
const EMAIL = /^[^\s@<>",;:]+@[^\s@<>",;:]+\.[^\s@<>",;:]+$/;
const hasBreak = (s: string) => /[\r\n\0]/.test(s);
const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64");

export const isEmail = (s: string) => EMAIL.test(s) && !hasBreak(s);

/** RFC 2047: non-ASCII header text becomes encoded words of at most ~45 bytes each. */
export function encodeHeader(text: string): string {
  if (/^[\x20-\x7e]*$/.test(text)) return text;
  const words: string[] = [];
  let cur = "";
  for (const ch of text) {
    if (Buffer.byteLength(cur + ch, "utf8") > 45) { words.push(cur); cur = ""; }
    cur += ch;
  }
  if (cur) words.push(cur);
  return words.map((w) => `=?UTF-8?B?${b64(w)}?=`).join("\r\n ");
}

function displayName(name: string): string {
  const n = name.trim();
  if (!n) return "";
  if (!/^[\x20-\x7e]*$/.test(n)) return encodeHeader(n);
  return `"${n.replace(/(["\\])/g, "\\$1")}"`;
}

export type Message = { from: { name?: string | null; email: string }; to: string; subject: string; body: string; date?: Date };

/** Returns the base64url string Gmail expects in `raw`. Throws on anything that could inject a header. */
export function buildRaw(m: Message): string {
  if (!isEmail(m.from.email) || !isEmail(m.to)) throw new Error("That is not a valid email address.");
  if (hasBreak(m.subject) || hasBreak(m.from.name ?? "")) throw new Error("The subject or name contains a line break.");
  const name = displayName(m.from.name ?? "");
  const body = m.body.replace(/\r\n|\r|\n/g, "\r\n");
  const wrapped = (b64(body).match(/.{1,76}/g) ?? []).join("\r\n");
  const lines = [
    `From: ${name ? `${name} <${m.from.email}>` : m.from.email}`,
    `To: ${m.to}`,
    `Subject: ${encodeHeader(m.subject)}`,
    `Date: ${(m.date ?? new Date()).toUTCString().replace("GMT", "+0000")}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    wrapped,
  ];
  return Buffer.from(lines.join("\r\n"), "utf8").toString("base64url");
}
