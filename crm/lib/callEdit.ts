import { MAX_CHARS, prepareTranscript } from "./transcript.ts";

// Rules for the kind of call and for editing notes after they are saved. Pure functions (no database, no AI).

export const CALL_KINDS = ["call", "video", "in_person"] as const;
export type CallKind = (typeof CALL_KINDS)[number];
export const KIND_LABEL: Record<CallKind, string> = { call: "Phone call", video: "Video call", in_person: "In-person meeting" };
export const isKind = (v: unknown): v is CallKind => typeof v === "string" && (CALL_KINDS as readonly string[]).includes(v);

/** A stored kind, or "call" for anything unexpected (rows made before kinds existed default to it anyway). */
export const kindOf = (v: unknown): CallKind => (isKind(v) ? v : "call");

/** Title suggested when logging, e.g. "Meeting with Acme Ltd". */
export function defaultTitle(kind: CallKind, company: string): string {
  return `${kind === "in_person" ? "Meeting" : kind === "video" ? "Video call" : "Call"} with ${company}`;
}

export type NotesEdit = { error: string } | { text: string; chars: number; masked: number; changed: boolean };

/** Prepares edited notes the same way new notes are prepared (emails and phone numbers masked), and says whether anything changed. */
export function prepareNotesEdit(raw: string, current: string | null): NotesEdit {
  const p = prepareTranscript(raw, { asNotes: true });
  if (p.text === "") return { error: "The notes can't be empty. To remove them, use Delete call at the bottom of the page." };
  if (p.tooLong) return { error: `That's over ${MAX_CHARS.toLocaleString("en-GB")} characters. Trim it first.` };
  return { text: p.text, chars: p.chars, masked: p.masked, changed: p.text !== (current ?? "") };
}

/** True when the notes were edited after the AI analysis ran, so the analysis may no longer match them. */
export function analysisIsStale(analysedAt: Date | string | null, notesEditedAt: Date | string | null): boolean {
  if (!analysedAt || !notesEditedAt) return false;
  return new Date(notesEditedAt).getTime() > new Date(analysedAt).getTime();
}

/** Only the owner's own notes can be edited. A transcript is a record of what was said, so it stays as saved. */
export const canEditNotes = (source: string, hasText: boolean) => source === "notes" && hasText;
