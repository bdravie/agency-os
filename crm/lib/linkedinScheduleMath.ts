// Rules for planning a LinkedIn post (Content > LinkedIn, L3). Pure: no database, no clock of its own, so it can be tested.
// The app never posts: a plan is a day, an optional time, and a reminder task that the calendar sync mirrors into Google Calendar.
import { groupScores, type Group, type ScoredPost } from "./insightsMath.ts";
import { addDays } from "./meetingMath.ts";

export const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;
/** How many slots to suggest. LinkedIn has no setting of its own yet, so three a week, a common pace for a text post. */
export const LINKEDIN_SLOTS = 3;
/** Days to look ahead for a free slot. */
export const LOOK_AHEAD_DAYS = 14;
/** The starting guess before there are enough of your own LinkedIn posts: midweek mornings, when owners check it before the day starts. */
const GUESS_DAYS = ["Tuesday", "Wednesday", "Thursday", "Monday", "Friday"];

/** A time to suggest for each time-of-day group used on What's working (the same bands as dayPart in insightsMath). Night falls back to a morning. */
export const PART_TIME: Record<string, string> = {
  "Morning (5am to 11am)": "08:00", "Midday (11am to 2pm)": "12:00", "Afternoon (2pm to 6pm)": "15:00", "Evening (6pm to 11pm)": "19:00", "Night (11pm to 5am)": "08:00",
};
const DEFAULT_TIME = "08:00";

export type Slot = { date: string; weekday: string; time: string; why: string; taken: number };

/** The weekday (Monday ... Sunday) of a YYYY-MM-DD date. */
export const weekdayOfDate = (date: string): string => {
  const [y, m, d] = date.split("-").map(Number);
  return WEEKDAYS[(new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7];
};

/** Your LinkedIn posts grouped by weekday and by time of day. Only posts with a × score count; a group under 3 posts is thin and never trusted. */
export function linkedinGroups(posts: { platform: string; multiple: number | null; postedAt: string }[], weekdayOf: (iso: string) => string, dayPart: (iso: string) => string): { weekdays: Group[]; parts: Group[]; scored: number } {
  const scored = posts.filter((p) => p.platform === "linkedin" && typeof p.multiple === "number").map((p) => ({ multiple: p.multiple as number, postedAt: p.postedAt }) as unknown as ScoredPost);
  return { weekdays: groupScores(scored, (p) => weekdayOf(p.postedAt)), parts: groupScores(scored, (p) => dayPart(p.postedAt)), scored: scored.length };
}

/**
 * The next free slots: your best LinkedIn weekdays and time first (only groups of 3 or more posts with a median above zero), otherwise a labelled starting guess.
 * `today` and `nowTime` are UK time; a slot later today counts, one already past does not. `planned` holds the days other posts are already planned for,
 * and a day that is taken is skipped for the following week's, so each slot says why it was chosen and how many posts already sit on it.
 */
export function suggestLinkedInSlots(o: { weekdays: Group[]; parts: Group[]; today: string; nowTime: string; planned: string[]; count?: number }): Slot[] {
  const count = o.count ?? LINKEDIN_SLOTS;
  const trusted = o.weekdays.filter((g) => !g.thin && g.median > 0 && (WEEKDAYS as readonly string[]).includes(g.key)).sort((a, b) => b.median - a.median);
  const bestPart = o.parts.find((g) => !g.thin && g.median > 0 && PART_TIME[g.key]);
  const time = bestPart ? PART_TIME[bestPart.key] : DEFAULT_TIME;
  const timeWhy = bestPart ? `${bestPart.key.split(" (")[0].toLowerCase()} is your best time (median ${bestPart.median.toFixed(1)}× over ${bestPart.n} posts)` : "a starting guess for the time";
  const days: { weekday: string; why: string }[] = trusted.map((g) => ({ weekday: g.key, why: `one of your best days on LinkedIn (median ${g.median.toFixed(1)}× over ${g.n} posts)` }));
  for (const d of GUESS_DAYS) if (!days.some((x) => x.weekday === d)) days.push({ weekday: d, why: "a common starting day: not enough of your own LinkedIn posts to say yet" });

  const takenOn = (date: string) => o.planned.filter((p) => p === date).length;
  const out: Slot[] = [];
  for (const d of days) {
    if (out.length >= count) break;
    for (let i = 0; i <= LOOK_AHEAD_DAYS; i++) {
      const date = addDays(o.today, i);
      if (weekdayOfDate(date) !== d.weekday) continue;
      if (i === 0 && time <= o.nowTime) continue;                      // already past today
      if (takenOn(date) > 0 && i + 7 <= LOOK_AHEAD_DAYS) continue;     // try the same weekday next week
      out.push({ date, weekday: d.weekday, time, why: `${d.why}; ${timeWhy}`, taken: takenOn(date) });
      break;
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/** Why a planned day and time cannot be saved, or null. A day is needed for a time; a day more than a year away is a typo. */
export function scheduleProblem(date: string | null, time: string | null, today: string): string | null {
  if (time && !date) return "Choose a day as well as a time.";
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) return "That day is not a date.";
  if (time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return "That time is not a time of day.";
  if (date && Number.isNaN(Date.parse(`${date}T12:00:00Z`))) return "That day is not a date.";
  if (date && date > addDays(today, 366)) return "That day is more than a year away.";
  return null;
}

/** The title of the reminder task (and its Google Calendar event). */
export const reminderTitle = (postTitle: string): string => {
  const t = postTitle.replace(/\s+/g, " ").trim();
  return `Post on LinkedIn: ${t.length > 80 ? `${t.slice(0, 79).trimEnd()}…` : t || "untitled post"}`;
};

/** A time saved by Postgres ("08:00:00") as the time box wants it ("08:00"). */
export const shortTime = (t: string | null | undefined): string | null => (t ? t.slice(0, 5) : null);

/** A planned day and time in words, for the list and the calendar: "Tue 18 Nov, 08:00". */
export function plannedLabel(date: string, time: string | null): string {
  const d = new Date(`${date}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
  return time ? `${d}, ${time}` : d;
}

export type ReadyCheck = { label: string; done: boolean; hint?: string };
/** What is still to do before posting. Advice only: the owner can post whenever they like. */
export function readiness(p: { text: string; problem: string | null; hasImage: boolean; date: string | null; reminder: boolean; posted: boolean }): ReadyCheck[] {
  return [
    { label: "Post written and saved", done: p.text.trim() !== "" && !p.problem, hint: p.problem ?? undefined },
    { label: "Image chosen", done: p.hasImage, hint: "Optional, but a post with an image stands out in the feed" },
    { label: "Day planned", done: !!p.date },
    { label: "Reminder in your calendar", done: p.reminder, hint: "Tick Remind me when you set the day" },
    { label: "Posted and recorded", done: p.posted },
  ];
}
