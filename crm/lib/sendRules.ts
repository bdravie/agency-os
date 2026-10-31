// The rules a click-to-send email must pass before anything goes to Google. Pure, so it can be tested on its own.
export const MAX_SUBJECT = 120;
const OPT_OUT = /reply\s*["'“”‘’]?\s*no\s*["'“”‘’]?\s+and\s+i\s+won['’]t\s+(email|message)\s+(you\s+)?again/i;

/** Problems with the email itself, in words the owner can act on. Empty list = fine. */
export function contentProblems(o: { subject: string; body: string; senderName?: string | null; businessName?: string | null }): string[] {
  const bad: string[] = [];
  const subject = o.subject.trim(), body = o.body.trim();
  if (!subject) bad.push("The subject is empty.");
  if (subject.length > MAX_SUBJECT) bad.push(`The subject is over ${MAX_SUBJECT} characters.`);
  if (/[\r\n]/.test(o.subject)) bad.push("The subject has a line break.");
  if (!body) bad.push("The email is empty.");
  const holes = (subject + "\n" + body).match(/\{\{.*?\}\}/g);
  if (holes) bad.push(`Fill in the placeholder first: ${holes[0]}`);
  if (body && !OPT_OUT.test(body)) bad.push(`The email needs the opt-out line: Reply "no" and I won't email again.`);
  if (body && o.senderName && !body.toLowerCase().includes(o.senderName.toLowerCase())) bad.push(`The email must carry your name (${o.senderName}).`);
  if (body && o.businessName && !body.toLowerCase().includes(o.businessName.toLowerCase())) bad.push(`The email must carry your business name (${o.businessName}).`);
  return bad;
}

/** One first email and one follow-up per address, the follow-up only after a first. `prior` counts sent or sending emails to that address. */
export function sequenceProblem(kind: "first" | "followup", prior: { first: number; followup: number }): string | null {
  if (kind === "first") return prior.first > 0 ? "A first email has already gone to this address. Send the follow-up instead." : null;
  if (prior.first === 0) return "Send the first email before the follow-up.";
  return prior.followup > 0 ? "The one follow-up has already gone to this address." : null;
}

/** How many more emails a mailbox may send today. */
export const remainingToday = (cap: number, usedToday: number) => Math.max(0, cap - usedToday);
