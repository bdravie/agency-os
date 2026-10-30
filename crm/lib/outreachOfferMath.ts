// Pure rules for the offer-tailored outreach email. The AI only writes the offer wording; greeting, sign-off and opt-out line are added here.

export type OfferParts = { subject: string; body: string; follow_up: string; social: string };

const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;
const clean = (s: unknown) => String(s ?? "").replace(/<[^>]*>/g, " ").replace(/https?:\/\/\S+|www\.\S+/gi, " ").replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, " ").replace(/\s+/g, " ").trim();
/** The greeting is added by code, so a greeting the AI wrote anyway is dropped. */
const noGreeting = (s: string) => s.replace(/^(hi|hello|hey|dear)\b[^,.]*[,.]\s*/i, "");
/** Continues straight after "Hi Alex," so the first letter is lower case (but "I" and "I'd" stay as they are). */
const lowerFirst = (s: string) => { const w = s.split(/\s/)[0] ?? ""; return /^[A-Z]/.test(w) && !/^I(['’][a-z]+)?$/.test(w) && !/^[A-Z]{2,}/.test(w) ? s[0].toLowerCase() + s.slice(1) : s; };
const BOASTS = /\b(proven|guarantee[sd]?|revolutionis\w*|revolutioniz\w*|game[- ]chang\w*|we(?:'ve| have) (?:helped|built|worked)|case stud(?:y|ies)|clients like|best[- ]in[- ]class|cutting[- ]edge|per ?cent|[0-9]+%)\b|!/i;

/** Cleans what the AI returned and lists what is wrong with it. Links, addresses and tags are removed; anything else wrong is reported. */
export function checkOfferParts(raw: unknown, opts: { bodyMax?: number } = {}): { parts: OfferParts; problems: string[] } {
  const r = (raw ?? {}) as Record<string, unknown>;
  const parts: OfferParts = { subject: clean(r.subject), body: clean(r.body), follow_up: lowerFirst(noGreeting(clean(r.follow_up))), social: lowerFirst(noGreeting(clean(r.social))) };
  const bad: string[] = [];
  for (const k of ["subject", "body", "follow_up", "social"] as const) if (!parts[k]) bad.push(`${k} is empty`);
  if (parts.subject.length > 30) bad.push(`the subject is ${parts.subject.length} characters (30 or fewer)`);
  const bodyMax = opts.bodyMax ?? 70;
  if (words(parts.body) > bodyMax) bad.push(`the body is ${words(parts.body)} words (${bodyMax} or fewer)`);
  if (words(parts.follow_up) > 45) bad.push(`the follow-up is ${words(parts.follow_up)} words (45 or fewer)`);
  if (words(parts.social) > 60) bad.push(`the social message is ${words(parts.social)} words (60 or fewer)`);
  for (const k of ["subject", "body", "follow_up", "social"] as const) {
    const digits = (parts[k].replace(/\b15[- ]minutes?\b/gi, "").match(/\d/g) ?? []).length;
    if (digits) bad.push(`the ${k.replace("_", "-")} contains a number, which must come from you, not the AI`);
    if (BOASTS.test(parts[k])) bad.push(`the ${k.replace("_", "-")} uses a boast or an exclamation mark`);
    if (/\{\{|\}\}/.test(parts[k])) bad.push(`the ${k.replace("_", "-")} contains a placeholder`);
  }
  return { parts, problems: bad };
}

export type Assembled = { first: { subject: string; body: string }; followup: { subject: string; body: string }; social: { subject: string; body: string } };

/** Builds the three messages. Greeting, sign-off and the opt-out lines are always added here. A missing name or business stays as a placeholder so sending is blocked until filled. */
export function assembleOfferDrafts(parts: OfferParts, o: { firstName: string | null; company: string; opener: string | null; name: string | null; business: string | null }): Assembled {
  const you = o.name || "{{your name}}", biz = o.business || "{{your business}}";
  const hi = o.firstName ? `Hi ${o.firstName}` : `Hi ${o.company} team`;
  const open = (o.opener ?? "").trim() || "{{specific thing on their site}} caught my attention because {{genuine reason}}.";
  return {
    first: { subject: parts.subject, body: `${hi},\n\n${open} ${parts.body}\n\n${you}, ${biz}\nReply "no" and I won't email again.` },
    followup: { subject: `Re: ${parts.subject}`, body: `${hi}, ${parts.follow_up.replace(/[.\s]+$/, "")}. If it's not relevant, reply "no" and I won't email again.\n\n${you}, ${biz}` },
    social: { subject: "", body: `${hi}, I'm ${you} at ${biz}. ${parts.social} Reply "no" and I won't message again.` },
  };
}

/** Puts an icebreaker straight after the greeting. In an email it becomes the first paragraph; in a social message it follows "Hi Alex,". */
export function insertOpener(body: string, opener: string): string {
  const line = opener.trim();
  if (!line) return body;
  const parts = body.split("\n\n");
  if (parts.length > 1) { parts.splice(1, 0, line); return parts.join("\n\n"); }
  return body.replace(/^(Hi [^,]+,)\s*/, `$1 ${line} `);
}
