// Pure logic for the owner's research notes on a company. Each line becomes one citable note (N1, N2...) for the AI offer suggestions.
import { containsContactDetails } from "./audit.ts";

export const NOTES_MAX_CHARS = 2000, NOTES_MAX_LINES = 20;

export type OwnerNote = { id: string; text: string };

const tidy = (raw: unknown) => String(raw ?? "").replace(/\r/g, "").replace(/<[^>]*>/g, " ").split("\n")
  .map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, "").replace(/\s+/g, " ").trim()).filter(Boolean);

/** Cleans what the owner typed, or says why it can't be saved. Empty is allowed: it clears the notes. */
export function checkResearchNotes(raw: unknown): { notes: string; error?: string } {
  const lines = tidy(raw), notes = lines.join("\n");
  if (notes.length > NOTES_MAX_CHARS) return { notes, error: `Keep notes to ${NOTES_MAX_CHARS} characters.` };
  if (lines.length > NOTES_MAX_LINES) return { notes, error: `Keep notes to ${NOTES_MAX_LINES} lines.` };
  if (containsContactDetails(notes)) return { notes, error: "Leave email addresses and phone numbers out of your notes." };
  return { notes };
}

export const toOwnerNotes = (notes: string | null | undefined): OwnerNote[] =>
  tidy(notes).slice(0, NOTES_MAX_LINES).map((text, i) => ({ id: `N${i + 1}`, text }));

export const ownerNotesFacts = (notes: OwnerNote[]) =>
  notes.length ? `THE CONSULTANT'S OWN NOTES (things they noticed themselves while researching; cite these ids too):\n${notes.map((n) => `${n.id} ${n.text}`).join("\n")}` : "";

/** The notes a result actually cited, kept with it so "Based on" still reads correctly after the notes change. */
export function citedNotes(notes: OwnerNote[], cited: string[]): OwnerNote[] {
  const used = new Set(cited);
  return notes.filter((n) => used.has(n.id));
}
