export type ProjectChecklistItem = {
  key: string;
  label: string;
  done: boolean;
};

export const DEFAULT_CHECKLIST: ProjectChecklistItem[] = [
  { key: "concept", label: "Concept & hook", done: true },
  { key: "script", label: "Script / talking points", done: false },
  { key: "film", label: "A-roll filmed", done: false },
  { key: "broll", label: "B-roll gathered", done: false },
  { key: "edit", label: "Rough cut & sound", done: false },
  { key: "thumbs", label: "Thumbnails created", done: false },
  { key: "schedule", label: "Scheduled & captions", done: false },
];

const EMAIL_PATTERN = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;

// UK landline, mobile (07xxx), or international (+44), matching the CRM standard pattern
const PHONE_PATTERN = /(?:\+44\s?\(?0?\)?\s?|\b0)\d[\d\s-]{8,12}\d/;

/**
 * Checks whether text contains contact details (email addresses or phone numbers).
 * Strictly enforced across all CRM quick capture to preserve business-only focus.
 */
export function checkNoteSafety(text: string): { ok: true } | { ok: false; error: string } {
  if (!text || !text.trim()) {
    return { ok: false, error: "Please write or paste a note first." };
  }
  if (text.length > 10_000) {
    return { ok: false, error: "Notes are limited to 10,000 characters." };
  }
  if (EMAIL_PATTERN.test(text)) {
    return {
      ok: false,
      error: "Quick-capture notes are for video concepts and ideas only. Email addresses are refused per privacy rules.",
    };
  }
  if (PHONE_PATTERN.test(text)) {
    return {
      ok: false,
      error: "Quick-capture notes are for video concepts and ideas only. Phone numbers are refused per privacy rules.",
    };
  }
  return { ok: true };
}

/** Extracts a sensible fallback title (under 60 chars) from the first line of a raw note. */
export function fallbackTitleFromNote(note: string): string {
  const firstLine = note.trim().split("\n")[0].trim().replace(/^[-*#\s]+/, "");
  if (!firstLine) return "Untitled note";
  if (firstLine.length <= 60) return firstLine;
  return firstLine.slice(0, 57).trim() + "…";
}

/** Calculates done count, total count and percentage for a project checklist. */
export function calculateChecklistProgress(items: ProjectChecklistItem[] | null | undefined): {
  done: number;
  total: number;
  percent: number;
} {
  const list = items && Array.isArray(items) && items.length > 0 ? items : DEFAULT_CHECKLIST;
  const done = list.filter((item) => item.done).length;
  const total = list.length;
  const percent = total > 0 ? Math.round((done / total) * 100) : 0;
  return { done, total, percent };
}

/** Determines content_items status from checklist progress. */
export function statusFromChecklist(items: ProjectChecklistItem[]): string {
  const map = new Map(items.map((i) => [i.key, i.done]));
  if (map.get("schedule")) return "Posted";
  if (map.get("film") || map.get("edit")) return "Filmed";
  if (map.get("script")) return "Scripted";
  return "Idea";
}
