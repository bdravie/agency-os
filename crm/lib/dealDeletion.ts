// Removing a deal from the pipeline always needs a category and a written note, so the owner can later tell
// wasted leads from admin mistakes. The database enforces the same two rules.

export const DELETION_CATEGORIES = [
  { code: "admin_mistake", label: "Admin mistake", hint: "Duplicate, test entry or created by error" },
  { code: "wasted_lead", label: "Wasted lead", hint: "A real lead that went nowhere" },
] as const;

export const NOTE_MIN = 10;
export const NOTE_MAX = 500;

export const deletionLabel = (code: string) => DELETION_CATEGORIES.find((c) => c.code === code)?.label ?? code;

/** An error message, or null when the category and note are acceptable. */
export function deletionProblem(category: string | null | undefined, note: string | null | undefined): string | null {
  if (!DELETION_CATEGORIES.some((c) => c.code === category)) return "Choose why this deal is being removed.";
  const n = (note ?? "").trim();
  if (n.length < NOTE_MIN) return `Write a short note (at least ${NOTE_MIN} characters) explaining what happened.`;
  if (n.length > NOTE_MAX) return `Keep the note under ${NOTE_MAX} characters.`;
  return null;
}
