// Reads a Gmail message into what the Inbox needs. Pure, so it can be tested on its own.
export type Header = { name: string; value: string };
export type Part = { mimeType?: string; body?: { data?: string }; parts?: Part[]; headers?: Header[] };
export type GmailMessage = { id: string; threadId: string; internalDate?: string; payload?: Part; snippet?: string };

export const header = (hs: Header[] | undefined, name: string): string | null => hs?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? null;

/** "Ada Lovelace <ada@example.com>" -> { name, email }. */
export function parseAddress(raw: string | null): { name: string | null; email: string } | null {
  if (!raw) return null;
  const m = raw.match(/^\s*(?:"?([^"<]*?)"?\s*)?<([^<>\s]+@[^<>\s]+)>\s*$/) ?? raw.match(/^\s*()([^<>\s,;]+@[^<>\s,;]+)\s*$/);
  if (!m) return null;
  return { name: m[1]?.trim() || null, email: m[2].toLowerCase() };
}

const decode = (data: string | undefined) => (data ? Buffer.from(data, "base64url").toString("utf8") : "");
const stripHtml = (h: string) => h.replace(/<(style|script)[\s\S]*?<\/\1>/gi, " ").replace(/<br\s*\/?>|<\/p>|<\/div>/gi, "\n").replace(/<[^>]+>/g, "")
  .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");

/** Plain text if the message has it, otherwise the HTML with tags removed. */
export function bodyText(p: Part | undefined): string {
  if (!p) return "";
  const walk = (x: Part, want: string): string => {
    if (x.mimeType === want && x.body?.data) return decode(x.body.data);
    for (const c of x.parts ?? []) { const t = walk(c, want); if (t) return t; }
    return "";
  };
  const plain = walk(p, "text/plain");
  if (plain.trim()) return plain;
  const html = walk(p, "text/html");
  if (html.trim()) return stripHtml(html);
  return p.body?.data ? decode(p.body.data) : "";
}

/** Keeps what the person wrote and drops the quoted copy of our own email below it. */
export function stripQuoted(text: string): string {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const two = `${l} ${lines[i + 1] ?? ""}`;
    if (/^\s*>/.test(l)) break;
    if (/^\s*on .{5,200}wrote:?\s*$/i.test(l) || (/^\s*on .{5,200}$/i.test(l) && /wrote:\s*$/i.test(two))) break;
    if (/^\s*-{2,}\s*(original message|forwarded message)\s*-{2,}\s*$/i.test(l)) break;
    if (/^\s*_{5,}\s*$/.test(l) || /^\s*from:\s.+/i.test(l) && /^\s*(sent|date):/i.test(lines[i + 1] ?? "")) break;
    out.push(l);
  }
  return out.join("\n").trim();
}

/** Out-of-office and other machine replies: stored, but they do not raise a notification. */
export function isAutoReply(o: { subject: string | null; autoSubmitted: string | null; precedence: string | null; autoResponseSuppress: string | null; fromEmail: string }): boolean {
  if (o.autoSubmitted && o.autoSubmitted.toLowerCase() !== "no") return true;
  if (o.autoResponseSuppress) return true;
  if (o.precedence && /^(bulk|junk|auto_reply)$/i.test(o.precedence.trim())) return true;
  if (/^(mailer-daemon|postmaster|no-?reply|donotreply)@/i.test(o.fromEmail)) return true;
  return /^\s*(automatic reply|auto(matic)?[- ]?reply|out of office|undeliverable|delivery status)/i.test(o.subject ?? "");
}

/** A reply that asks not to be emailed again. Only flagged: recording the opt-out is always the owner's click. */
export function looksLikeOptOut(reply: string): boolean {
  const t = reply.toLowerCase().replace(/\s+/g, " ").trim();
  if (!t) return false;
  if (/^(no|nope|stop|unsubscribe|remove|remove me|no thanks|no thank you|not interested)[\s.!,]*$/.test(t)) return true;
  if (/^(no|stop|unsubscribe)\b[\s.!,]/.test(t) && t.length < 80) return true;
  return /\b(unsubscribe|remove me|take me off|stop (emailing|contacting|messaging)|do(n't| not) (email|contact|message) me|not interested|opt me out|no more emails?)\b/.test(t);
}

export type Parsed = { id: string; threadId: string; fromEmail: string; fromName: string | null; subject: string | null; text: string; receivedAt: Date; auto: boolean; optOut: boolean };

export function parseMessage(m: GmailMessage): Parsed | null {
  const hs = m.payload?.headers;
  const from = parseAddress(header(hs, "From"));
  if (!from) return null;
  const subject = header(hs, "Subject");
  const text = stripQuoted(bodyText(m.payload)).slice(0, 5000);
  const auto = isAutoReply({ subject, autoSubmitted: header(hs, "Auto-Submitted"), precedence: header(hs, "Precedence"), autoResponseSuppress: header(hs, "X-Auto-Response-Suppress"), fromEmail: from.email });
  const when = Number(m.internalDate);
  return { id: m.id, threadId: m.threadId, fromEmail: from.email, fromName: from.name, subject, text, receivedAt: new Date(Number.isFinite(when) && when > 0 ? when : Date.now()), auto, optOut: !auto && looksLikeOptOut(text) };
}
