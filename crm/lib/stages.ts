// Database values (the deal_stage enum) never change; labels and hints are what you see.
// Standard pipeline: Lead > Contacted > Replied > Call booked > Audit sold > Proposal > Won / Lost.
export const STAGES = ["New", "Contacted", "Replied", "Call booked", "Audit sold", "Proposal sent", "Won", "Lost"] as const;
export type Stage = (typeof STAGES)[number];
/** The stages a deal moves through on the way to Won, in order. Lost is a way out, not a step. */
export const FUNNEL_STAGES = STAGES.filter((s) => s !== "Lost") as readonly Stage[];

export const STAGE_META: Record<Stage, { label: string; hint: string; next: string; colour: string }> = {
  New: { label: "Lead", hint: "Not contacted yet", next: "Send the first email or message.", colour: "var(--muted)" },
  Contacted: { label: "Contacted", hint: "Waiting for a reply", next: "Send one follow-up after 3-4 days if there's no reply.", colour: "var(--accent)" },
  Replied: { label: "Replied", hint: "They've replied", next: "Offer a short call or the free pilot.", colour: "var(--violet)" },
  "Call booked": { label: "Call booked", hint: "Discovery call scheduled", next: "Review their site and get the demo ready.", colour: "var(--warn)" },
  "Audit sold": { label: "Audit sold", hint: "Paid audit agreed", next: "Deliver the audit, then propose the build.", colour: "var(--orange)" },
  "Proposal sent": { label: "Proposal", hint: "Proposal or quote sent", next: "Follow up in 3 days and offer to answer questions.", colour: "var(--cyan)" },
  Won: { label: "Won", hint: "Now a paying client", next: "Check the client is set up with a review date.", colour: "var(--good)" },
  Lost: { label: "Lost", hint: "Not going ahead", next: "Note why it was lost, then move on.", colour: "var(--bad)" },
};

export const stageLabel = (s: string) => STAGE_META[s as Stage]?.label ?? s;

// Why deals are lost: standard codes (the database enforces these), shown with friendly labels.
export const LOST_REASONS = [
  { code: "price", label: "Price" },
  { code: "timing", label: "Timing" },
  { code: "no_need", label: "No need" },
  { code: "went_diy", label: "Went DIY" },
  { code: "competitor", label: "Competitor" },
  { code: "no_response", label: "No response" },
] as const;
/** Older lost deals may hold free text or nothing; show that as-is rather than hiding it. */
export const lostLabel = (code: string | null | undefined) => (code ? LOST_REASONS.find((r) => r.code === code)?.label ?? code : "Not recorded");

// How the lead first came in. SMS is recorded for tracking only: nothing here ever sends a text.
export const CHANNELS = [
  { code: "email", label: "Email" },
  { code: "social_dm", label: "Social DM" },
  { code: "upwork", label: "Upwork" },
  { code: "sms", label: "SMS" },
  { code: "referral", label: "Referral" },
] as const;
export const channelLabel = (code: string | null | undefined) => (code ? CHANNELS.find((c) => c.code === code)?.label ?? code : "Not set");

// Content pipeline: database values are the status text; labels and hints are what you see.
export const CONTENT_STATUSES = ["Idea", "Scripted", "Filmed", "Posted"] as const;
export type ContentStatus = (typeof CONTENT_STATUSES)[number];
export const CONTENT_META: Record<ContentStatus, { label: string; hint: string; next: string; colour: string }> = {
  Idea: { label: "Ideas", hint: "Raw ideas to pick from", next: "Pick one and write its script.", colour: "var(--muted)" },
  Scripted: { label: "Script ready", hint: "Script and caption written", next: "Film it, then move it to Filmed.", colour: "var(--accent)" },
  Filmed: { label: "Filmed", hint: "Recorded, not posted yet", next: "Edit it, schedule it and post it.", colour: "var(--warn)" },
  Posted: { label: "Posted", hint: "Published", next: "Watch for comments with your keyword.", colour: "var(--good)" },
};
export const contentLabel = (s: string) => CONTENT_META[s as ContentStatus]?.label ?? s;
