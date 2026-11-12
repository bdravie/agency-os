import { query } from "./db";
import { loadPosts } from "./contentPerformance";
import { dayPart, weekdayOf } from "./insightsMath";
import { londonParts } from "./paceMath";
import { dayKey } from "./meetingMath";
import { LINKEDIN_FORMAT } from "./linkedinMath";
import { linkedinGroups, reminderTitle, suggestLinkedInSlots, type Slot } from "./linkedinScheduleMath";

// Server side of planning a LinkedIn post. The reminder is an ordinary CRM task: the calendar sync mirrors it into Google Calendar with no guests,
// and ticking it off, posting, or clearing the day removes the event. Nothing is ever posted by the app.

type Exec = (sql: string, params?: unknown[]) => Promise<unknown>;
const run: Exec = (sql, params) => query(sql, params as any[]);

/** Today and the time now, in UK time. */
export function ukNow(now = new Date()): { today: string; time: string } {
  const p = londonParts(now);
  return { today: dayKey(now), time: `${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}` };
}

/** The next free slots for a LinkedIn post, from your own LinkedIn numbers once there are enough (see suggestLinkedInSlots). `except` leaves this post's own day out of "taken". */
export async function loadLinkedInSlots(except?: number): Promise<Slot[]> {
  const [posts, planned] = await Promise.all([
    loadPosts(),
    query<{ day: string }>(`SELECT scheduled_for::text AS day FROM content_items WHERE format = $1 AND scheduled_for >= (now() AT TIME ZONE 'Europe/London')::date AND status NOT IN ('Posted','Archived') AND id <> $2`, [LINKEDIN_FORMAT, except ?? 0]),
  ]);
  const g = linkedinGroups(posts.map((p) => ({ platform: p.platform, multiple: p.performance.status === "ok" ? p.performance.multiple : null, postedAt: p.posted_at })), weekdayOf, dayPart);
  const { today, time } = ukNow();
  return suggestLinkedInSlots({ weekdays: g.weekdays, parts: g.parts, today, nowTime: time, planned: planned.map((r) => r.day) });
}

/**
 * Brings a post's reminder task in line with its plan. `want`: true adds or moves it, false removes it, "keep" moves it only if there is one open.
 * A post with no day, or one already posted, has no open reminder. Removing a reminder ticks the task off rather than deleting it, so the sync clears its Google event.
 */
export async function applyReminder(itemId: number, want: boolean | "keep", exec: Exec = run): Promise<void> {
  const rows = (await query<any>(
    `SELECT i.idea, i.status, i.scheduled_for::text AS day, i.scheduled_time::text AS time, i.reminder_task_id, t.done_at
       FROM content_items i LEFT JOIN tasks t ON t.id = i.reminder_task_id WHERE i.id = $1`, [itemId]));
  const item = rows[0];
  if (!item) return;
  const open = item.reminder_task_id !== null && item.done_at === null;
  const wanted = (want === "keep" ? open : want) && !!item.day && item.status !== "Posted" && item.status !== "Archived";
  // Midnight UK time when there is no time of day, which the sync shows as an all-day event.
  const due = `(($2::date + COALESCE($3::time, time '00:00'))::timestamp AT TIME ZONE 'Europe/London')`;
  if (wanted && open) {
    await exec(`UPDATE tasks SET title = $4, due_at = ${due} WHERE id = $1`, [item.reminder_task_id, item.day, item.time, reminderTitle(item.idea)]);
  } else if (wanted) {
    await exec(
      `WITH t AS (INSERT INTO tasks (title, due_at) VALUES ($4, ${due}) RETURNING id)
       UPDATE content_items SET reminder_task_id = (SELECT id FROM t) WHERE id = $1`, [itemId, item.day, item.time, reminderTitle(item.idea)]);
  } else if (open) {
    await exec(`UPDATE tasks SET done_at = now() WHERE id = $1 AND done_at IS NULL`, [item.reminder_task_id]);
  }
}

/** When a post goes out, its reminder is done. Safe to call for any content item, and inside a transaction. */
export async function closeReminder(itemId: number, exec: Exec = run): Promise<void> {
  await exec(`UPDATE tasks SET done_at = now() WHERE done_at IS NULL AND id = (SELECT reminder_task_id FROM content_items WHERE id = $1)`, [itemId]);
}
