// Turns the model's raw Instagram DM draft into the text you will edit and send. Pure, so it is tested without a database or the AI.
// The sign-off (real name, business name, opt-out line) is added here, never left to the model, so it cannot be missed.

export type RawDm = { first_dm?: unknown; follow_up?: unknown; finding_ids?: unknown; check_first?: unknown };
export type DmDraft = { first: string; followUp: string; checkFirst: string[]; warnings: string[] };

const words = (s: string) => s.split(/\s+/).filter(Boolean).length;
const OPT_OUT = `Reply "no" and I won't message again.`;
const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/** Removes links, email addresses and phone numbers, and any sign-off or opt-out line the model added despite being told not to. */
function clean(s: string, warnings: string[], label: string): string {
  let out = s.replace(/https?:\/\/\S+|www\.\S+/gi, () => { warnings.push(`A link was removed from the ${label}.`); return ""; });
  out = out.replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, () => { warnings.push(`An email address was removed from the ${label}.`); return ""; });
  out = out.replace(/(?:\+44\s?\(?0?\)?\s?|\b0)\d[\d\s-]{8,12}\d/g, () => { warnings.push(`A phone number was removed from the ${label}.`); return ""; });
  const lines = out.split("\n").filter((l) => !/reply\s+["“'‘]?no\b/i.test(l) && !/^\s*[-–—]\s*\S/.test(l));
  return lines.join("\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").replace(/ {2,}/g, " ").trim();
}

export function finishDm(raw: unknown, who: { sender: string; business: string }, knownFindingIds: string[]): DmDraft {
  const r = (raw && typeof raw === "object" ? raw : {}) as RawDm;
  const warnings: string[] = [];
  const first = clean(text(r.first_dm), warnings, "first message"), followUp = clean(text(r.follow_up), warnings, "follow-up");
  if (!first) throw new Error("The AI did not write a message. Try again.");
  if (words(first) > 80) warnings.push(`The first message is ${words(first)} words. Shorter messages get more replies, so trim it.`);
  const ids = Array.isArray(r.finding_ids) ? r.finding_ids.filter((x): x is string => typeof x === "string") : [];
  if (ids.length === 0) warnings.push("The AI did not point to a finding for its observation. Check it is true before sending.");
  else if (ids.some((id) => !knownFindingIds.includes(id))) warnings.push("The AI cited a finding that doesn't exist. Check the opening line is true before sending.");
  const sign = `${who.sender}, ${who.business}\n${OPT_OUT}`;
  const checkFirst = (Array.isArray(r.check_first) ? r.check_first : []).filter((x): x is string => typeof x === "string").map((x) => x.trim()).filter(Boolean).slice(0, 3);
  return { first: `${first}\n\n${sign}`, followUp: followUp ? `${followUp}\n\n${sign}` : "", checkFirst, warnings: [...new Set(warnings)] };
}
