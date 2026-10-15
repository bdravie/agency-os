// Pure maths for offers carried by a deal. No database, so it can be tested on its own.
export type Billing = "one_off" | "setup" | "monthly";

export const BILLING: { code: Billing; label: string; short: string }[] = [
  { code: "one_off", label: "One-off fee", short: "One-off" },
  { code: "setup", label: "Setup fee", short: "Setup" },
  { code: "monthly", label: "Monthly retainer", short: "Monthly" },
];
export const billingLabel = (b: string | null | undefined) => BILLING.find((x) => x.code === b)?.label ?? "Package (setup + monthly)";
export const billingShort = (b: string | null | undefined) => BILLING.find((x) => x.code === b)?.short ?? "Package";

export type Line = { billing: Billing; price: number; credit: number };

/** What the client actually pays for a line: the full price, less any credit. Monthly lines never carry credit. */
export const lineNet = (l: Line) => (l.billing === "monthly" ? l.price : Math.max(0, round2(l.price - l.credit)));

const round2 = (n: number) => Math.round(n * 100) / 100;

/** One-off money and recurring money are kept apart. A credit moves value between lines; it never adds or removes revenue twice. */
export function totals(lines: Line[]) {
  const oneOff = round2(lines.filter((l) => l.billing !== "monthly").reduce((s, l) => s + lineNet(l), 0));
  const monthly = round2(lines.filter((l) => l.billing === "monthly").reduce((s, l) => s + l.price, 0));
  const credit = round2(lines.reduce((s, l) => s + (l.billing === "monthly" ? 0 : l.credit), 0));
  const gross = round2(lines.filter((l) => l.billing !== "monthly").reduce((s, l) => s + l.price, 0));
  return { oneOff, monthly, credit, gross };
}

/** The most that can be credited: no more than the audit fee that was paid, and no more than the build costs. */
export const maxCredit = (sourcePrice: number, targetPrice: number) => round2(Math.max(0, Math.min(sourcePrice, targetPrice)));
export const clampCredit = (wanted: number, sourcePrice: number, targetPrice: number) => round2(Math.min(Math.max(0, wanted || 0), maxCredit(sourcePrice, targetPrice)));

export type RangeState = "below" | "within" | "above" | "unknown";
export function rangeState(price: number, min: number | null, max: number | null): RangeState {
  if (min === null || max === null) return "unknown";
  return price < min ? "below" : price > max ? "above" : "within";
}

export type CheckItem = { text: string; done: boolean };
export const checklistFrom = (deliverables: unknown): CheckItem[] =>
  (Array.isArray(deliverables) ? deliverables : []).filter((t): t is string => typeof t === "string" && t.trim() !== "").map((text) => ({ text: text.trim(), done: false }));
export const progress = (list: CheckItem[]) => ({ done: list.filter((i) => i.done).length, total: list.length });
/** Text typed one deliverable per line becomes a clean list: blanks dropped, long lines trimmed, capped at 30. */
export const parseDeliverables = (text: string) => text.split("\n").map((l) => l.replace(/^[-*•\s]+/, "").trim().slice(0, 200)).filter(Boolean).slice(0, 30);
