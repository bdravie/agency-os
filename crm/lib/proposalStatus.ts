// The statuses an application moves through. Kept in one place so the plain draft and the Loom pitch are tracked alike and can be compared. "Won" is hired.
// Pure rules only (no database, no files), so the pipeline, the actions and the tests all read the same thing.
export const PROPOSAL_STATUSES = ["Draft", "Sent", "Viewed", "Replied", "Interview", "Won", "Lost"] as const;
export type ProposalStatus = (typeof PROPOSAL_STATUSES)[number];

/** Labels and colours are what you see; the database keeps the status text. Colours are the same brand tokens the Deals pipeline uses. */
export const PROPOSAL_META: Record<ProposalStatus, { label: string; hint: string; colour: string }> = {
  Draft: { label: "Draft", hint: "Written, not sent yet", colour: "var(--st-new)" },
  Sent: { label: "Sent", hint: "On Upwork, waiting to be seen", colour: "var(--st-contacted)" },
  Viewed: { label: "Viewed", hint: "The client has looked at it", colour: "var(--st-call)" },
  Replied: { label: "Replied", hint: "The client has answered", colour: "var(--st-replied)" },
  Interview: { label: "Interview", hint: "In conversation or on a call", colour: "var(--st-audit)" },
  Won: { label: "Won (hired)", hint: "You got the job", colour: "var(--st-won)" },
  Lost: { label: "Lost", hint: "Not going ahead", colour: "var(--st-lost)" },
};

export const CLOSED_STATUSES: readonly string[] = ["Won", "Lost"];
export const isClosed = (status: string) => CLOSED_STATUSES.includes(status);
export const isStatus = (s: unknown): s is ProposalStatus => (PROPOSAL_STATUSES as readonly unknown[]).includes(s);
export const statusLabel = (s: string) => PROPOSAL_META[s as ProposalStatus]?.label ?? s;

/** The step after this one, for the one-click "done" button. Won and Lost have none. */
export function nextStatus(status: string): ProposalStatus | null {
  const i = PROPOSAL_STATUSES.indexOf(status as ProposalStatus);
  if (i < 0 || isClosed(status)) return null;
  return PROPOSAL_STATUSES[i + 1] ?? null;
}
/** The step before this one, for "back up". Draft has none, and closed proposals go back to where you pick. */
export function previousStatus(status: string): ProposalStatus | null {
  const i = PROPOSAL_STATUSES.indexOf(status as ProposalStatus);
  return i > 0 && !isClosed(status) ? PROPOSAL_STATUSES[i - 1] : null;
}

// Why a proposal was lost. The database enforces these codes too.
export const PROPOSAL_LOST_REASONS = [
  { code: "no_reply", label: "No reply" },
  { code: "hired_other", label: "Hired someone else" },
  { code: "job_closed", label: "Job closed" },
  { code: "budget_too_low", label: "Budget too low" },
  { code: "withdrew", label: "I withdrew" },
  { code: "other", label: "Other" },
] as const;
export const proposalLostLabel = (code: string | null | undefined) => (code ? PROPOSAL_LOST_REASONS.find((r) => r.code === code)?.label ?? code : "Not recorded");

// Archiving is "not pursuing": reversible, and the reason is optional.
export const ARCHIVE_REASONS = [
  { code: "not_a_fit", label: "Not a good fit" },
  { code: "job_closed", label: "Job closed or filled" },
  { code: "duplicate", label: "Duplicate" },
  { code: "changed_mind", label: "Changed my mind" },
] as const;
export const archiveLabel = (code: string | null | undefined) => (code ? ARCHIVE_REASONS.find((r) => r.code === code)?.label ?? code : "No reason given");
export const isArchiveReason = (c: unknown) => ARCHIVE_REASONS.some((r) => r.code === c);

// Deleting is permanent, so it needs a category and a written note, kept in the deletion log (the database enforces the same).
export const DELETION_CATEGORIES = [
  { code: "admin_mistake", label: "Admin mistake", hint: "Duplicate, test entry or created by error" },
  { code: "not_a_fit", label: "Not a fit", hint: "A job I decided against" },
  { code: "job_gone", label: "Job gone", hint: "Closed, filled or withdrawn by the client" },
] as const;
export const NOTE_MIN = 10;
export const NOTE_MAX = 500;
export const deletionLabel = (code: string) => DELETION_CATEGORIES.find((c) => c.code === code)?.label ?? code;

/** An error message, or null when the category and note are acceptable. */
export function deletionProblem(category: string | null | undefined, note: string | null | undefined): string | null {
  if (!DELETION_CATEGORIES.some((c) => c.code === category)) return "Choose why this proposal is being deleted.";
  const n = (note ?? "").trim();
  if (n.length < NOTE_MIN) return `Write a short note (at least ${NOTE_MIN} characters) explaining why.`;
  if (n.length > NOTE_MAX) return `Keep the note under ${NOTE_MAX} characters.`;
  return null;
}

/** Why this proposal can't be deleted yet, or null when it can. A hired job is real history, and anything live should be archived first. */
export function cannotDelete(p: { status: string; archived_at?: unknown }): string | null {
  if (p.status === "Won") return "A won proposal is a hired job, so it can't be deleted.";
  if (p.status !== "Draft" && !p.archived_at) return "Archive it first. Only drafts and archived proposals can be deleted.";
  return null;
}

/** A lost proposal needs one of the standard reasons. */
export const lostProblem = (code: string | null | undefined) => (PROPOSAL_LOST_REASONS.some((r) => r.code === code) ? null : "Pick a reason for losing this proposal.");

// Follow-up timing: a sent proposal waits a week before it is worth a nudge, and after a month it is no longer "following up"
// but a decision (mark it lost or archive it), so the sidebar number stops counting it. The row in the pipeline still shows it.
export const FOLLOW_UP_AFTER_DAYS = 7;
export const FOLLOW_UP_UNTIL_DAYS = 30;
const WAITING = ["Sent", "Viewed"];

export const daysSince = (iso: string | Date, now: Date = new Date()) => Math.floor((now.getTime() - new Date(iso).getTime()) / 86_400_000);

/** True when it is time to chase: sent or viewed, no change for a week, not yet a month. Archived proposals are never chased. */
export function needsFollowUp(p: { status: string; status_changed_at: string | Date; archived_at?: unknown }, now: Date = new Date()): boolean {
  if (p.archived_at || !WAITING.includes(p.status)) return false;
  const d = daysSince(p.status_changed_at, now);
  return d >= FOLLOW_UP_AFTER_DAYS && d < FOLLOW_UP_UNTIL_DAYS;
}
/** Quiet for a week or more while still waiting: the pipeline row shows it in a warning tone, however old. */
export const isQuiet = (p: { status: string; status_changed_at: string | Date }, now: Date = new Date()) =>
  WAITING.includes(p.status) && daysSince(p.status_changed_at, now) >= FOLLOW_UP_AFTER_DAYS;
