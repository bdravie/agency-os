import { addMonths, daysBetween } from "./outcomeMath.ts";

// Pure helpers for the Enablement module: the 30-day rule, schedule dates, file rules and attendee parsing.

/** A retained client with no session for this many days (or more) is flagged. */
export const OVERDUE_DAYS = 30;

export const SKILL_LEVELS = [
  { level: 1, label: "Learning", hint: "Needs help to use what we set up" },
  { level: 2, label: "Confident", hint: "Uses it day to day, asks when something is new" },
  { level: 3, label: "Independent", hint: "Could show a colleague or adapt it themselves" },
] as const;
export const levelLabel = (n: number | null | undefined) => SKILL_LEVELS.find((l) => l.level === n)?.label ?? "Not rated";

export type SessionStatus = { due: boolean; days: number | null; label: string };

/** Is a retained client overdue a session? With no session on record, the clock runs from the service start. */
export function sessionStatus(i: { retained: boolean; lastSession: string | null; since: string | null; today: string }): SessionStatus {
  if (!i.retained) return { due: false, days: null, label: "Not retained" };
  if (i.lastSession) {
    const days = daysBetween(i.lastSession, i.today);
    return { due: days >= OVERDUE_DAYS, days, label: days === 0 ? "Today" : `${days} day${days === 1 ? "" : "s"} ago` };
  }
  if (!i.since) return { due: true, days: null, label: "No session on record" };
  const days = daysBetween(i.since, i.today);
  return { due: days >= OVERDUE_DAYS, days, label: "No session yet" };
}

// ---------- schedules ----------
export type Cadence = "weekly" | "fortnightly" | "monthly";
export const CADENCES: { code: Cadence; label: string }[] = [{ code: "weekly", label: "Every week" }, { code: "fortnightly", label: "Every two weeks" }, { code: "monthly", label: "Every month" }];
const ms = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
export const plusDays = (iso: string, n: number) => new Date(ms(iso) + n * 86_400_000).toISOString().slice(0, 10);
/** Same day n months on (or before), or the last day if that month is shorter (31 Jan + 1 month = 28 Feb). */
export function shiftMonths(iso: string, n: number): string {
  const first = addMonths(iso.slice(0, 7) + "-01", n);
  const lastDay = new Date(Date.UTC(+first.slice(0, 4), +first.slice(5, 7), 0)).getUTCDate();
  return `${first.slice(0, 8)}${String(Math.min(Number(iso.slice(8, 10)), lastDay)).padStart(2, "0")}`;
}
export const plusOneMonth = (iso: string) => shiftMonths(iso, 1);
const step = (cadence: Cadence, from: string, dir: 1 | -1) => (cadence === "weekly" ? plusDays(from, 7 * dir) : cadence === "fortnightly" ? plusDays(from, 14 * dir) : shiftMonths(from, dir));
export const nextAfter = (cadence: Cadence, from: string) => step(cadence, from, 1);
/** A session counts towards a slot if it is held up to half a cadence early (or any time late). */
const TOLERANCE: Record<Cadence, number> = { weekly: 3, fortnightly: 7, monthly: 15 };

/** The next slot on the schedule's rhythm (anchored on the date it was due) that this session does not already cover. */
export function advanceSchedule(cadence: Cadence, dueOn: string, held: string): string {
  const tol = TOLERANCE[cadence], covered = (slot: string) => plusDays(slot, -tol) <= held;
  let slot = dueOn;
  for (let i = 0; i < 400 && !covered(step(cadence, slot, -1)); i++) slot = step(cadence, slot, -1);   // held long before: stay on the earliest slot not yet covered
  for (let i = 0; i < 400 && covered(slot); i++) slot = step(cadence, slot, 1);                          // otherwise skip every slot this session covers
  return slot;
}

// ---------- files ----------
export const MAX_FILE_BYTES = 3 * 1024 * 1024;
export const MAX_FILES = 5;
const TYPES: Record<string, string> = {
  pdf: "application/pdf", txt: "text/plain; charset=utf-8", md: "text/markdown; charset=utf-8", csv: "text/csv; charset=utf-8", json: "application/json",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg",
};
export const ALLOWED_EXTENSIONS = Object.keys(TYPES);
/** The type is decided here from the extension, never taken from the upload. Web pages and scripts (html, svg, js) are not allowed. */
export function fileInfo(name: string): { ext: string; contentType: string } | null {
  const ext = name.toLowerCase().match(/\.([a-z0-9]{2,5})$/)?.[1] ?? "";
  return TYPES[ext] ? { ext, contentType: TYPES[ext] } : null;
}
export function safeFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "file";
  const clean = base.replace(/[\u0000-\u001f"<>:|?*]/g, "").replace(/\s+/g, " ").trim();
  if (clean.length <= 120) return clean || "file";
  const ext = clean.match(/\.[A-Za-z0-9]{2,5}$/)?.[0] ?? "";
  return clean.slice(0, 120 - ext.length) + ext;
}

// ---------- people ----------
/** "Sam Taylor, Office manager" per line -> name and role. Max 20 lines, names up to 80 characters. */
export function parseAttendeeLines(text: string): { name: string; role: string | null }[] {
  const seen = new Set<string>(), out: { name: string; role: string | null }[] = [];
  for (const line of text.split("\n")) {
    const [n, ...rest] = line.split(/\s*[,\-–|]\s+|\s*,\s*/);
    const name = n.trim().slice(0, 80), role = rest.join(", ").trim().slice(0, 80) || null;
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase()); out.push({ name, role });
    if (out.length >= 20) break;
  }
  return out;
}

export const averageLevel = (levels: (number | null)[]) => {
  const v = levels.filter((x): x is number => x !== null);
  return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10 : null;
};
