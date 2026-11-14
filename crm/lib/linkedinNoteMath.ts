// LinkedIn connection notes (docs/NICHE_FOCUS_PLAN.md, N2). Pure, so it is tested without a database or the AI.
// The AI writes only the middle; the greeting, your real name, business name and the opt-out line are added here, so they cannot be missed.
// Drafting only: the app never sends a LinkedIn note. You send it yourself on LinkedIn, then log it.

/** LinkedIn's limit for a connection note. Every note is kept under it, sign-off included. */
export const NOTE_MAX = 300;
/** Free LinkedIn accounts get a shorter limit; a note over it gets a warning, not a refusal. */
export const NOTE_FREE_MAX = 200;
export const NOTE_OPT_OUT = `Reply "no" and I won't message again.`;

export type NoteWho = { firstName: string | null; sender: string; business: string };

const greeting = (first: string | null) => `Hi ${first?.trim() || "there"},`;
const signOff = (w: NoteWho) => `${w.sender}, ${w.business}. ${NOTE_OPT_OUT}`;

/** The whole note: greeting, the middle, then the sign-off with the opt-out line. */
export const assembleNote = (body: string, w: NoteWho): string => `${greeting(w.firstName)} ${body.trim()}\n${signOff(w)}`;

/** How many characters the AI may use for the middle, so the whole note fits under NOTE_MAX. */
export const bodyBudget = (w: NoteWho): number => NOTE_MAX - assembleNote("", w).length - 1;

/** Takes out any greeting, sign-off or opt-out line the model added despite being told not to, and tidies the spaces. */
export function stripFrame(raw: string): string {
  return raw.split("\n")
    .filter((l) => !/reply\s+["“'‘]?no\b/i.test(l) && !/^\s*[-–—]\s*\S/.test(l))
    .join(" ")
    .replace(/^\s*(hi|hello|hey|dear)\b[^,]{0,40},\s*/i, "")
    .replace(/\s{2,}/g, " ").trim();
}

/**
 * Hard checks on the AI's middle: no figures (a count in words is fine), links, email addresses, phone numbers or @ names, and it must fit the budget.
 * Your own edits are not refused; the panel only counts characters.
 */
export function noteProblems(body: string, budget: number): string[] {
  const p: string[] = [];
  if (!body.trim()) p.push("The note is empty.");
  if (/\d|[£$€%]/.test(body)) p.push("It states a figure. Use no numbers, money amounts or percentages.");
  if (/https?:\/\/|www\.|\b[\w-]+\.(?:com|co\.uk|uk|io|ai)\b/i.test(body)) p.push("It contains a link. Leave links out of a connection note.");
  if (/[\w.+-]+@[\w-]+\.[\w.-]+/.test(body)) p.push("It contains an email address.");
  else if (/(^|\s)@\w/.test(body)) p.push("It @-mentions someone.");
  if (body.length > budget) p.push(`It is ${body.length} characters; the most that fits is ${budget}.`);
  return p;
}

/** Warnings for the finished note as it stands (including your edits). */
export function noteWarnings(note: string): string[] {
  const w: string[] = [];
  if (note.length > NOTE_MAX) w.push(`This note is ${note.length} characters. LinkedIn allows ${NOTE_MAX}, so trim it.`);
  else if (note.length > NOTE_FREE_MAX) w.push(`This note is ${note.length} characters. A free LinkedIn account allows ${NOTE_FREE_MAX}; Premium allows ${NOTE_MAX}.`);
  if (!note.includes(NOTE_OPT_OUT)) w.push("The opt-out line is missing. Keep it in.");
  return w;
}
