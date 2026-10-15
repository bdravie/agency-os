// Database values (the deal_stage enum) never change; labels and hints are what you see.
export const STAGES = ["New", "Contacted", "Replied", "Call booked", "Proposal sent", "Won", "Lost"] as const;
export type Stage = (typeof STAGES)[number];

export const STAGE_META: Record<Stage, { label: string; hint: string; next: string; colour: string }> = {
  New: { label: "New lead", hint: "Not contacted yet", next: "Send the first email.", colour: "var(--muted)" },
  Contacted: { label: "Contacted", hint: "Waiting for a reply", next: "Send one follow-up after 3-4 days if there's no reply.", colour: "var(--accent)" },
  Replied: { label: "In conversation", hint: "They've replied", next: "Offer a short call or the free pilot.", colour: "var(--violet)" },
  "Call booked": { label: "Call booked", hint: "Discovery call scheduled", next: "Review their site and get the demo ready.", colour: "var(--warn)" },
  "Proposal sent": { label: "Quote sent", hint: "Waiting for a decision", next: "Follow up in 3 days and offer to answer questions.", colour: "var(--cyan)" },
  Won: { label: "Won", hint: "Now a paying client", next: "Check the client is set up with a review date.", colour: "var(--good)" },
  Lost: { label: "Lost", hint: "Not going ahead", next: "Note why it was lost, then move on.", colour: "var(--bad)" },
};

export const stageLabel = (s: string) => STAGE_META[s as Stage]?.label ?? s;
