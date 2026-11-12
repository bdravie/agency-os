import Link from "next/link";
import { Video, CheckSquare } from "lucide-react";
import { timeLabel } from "@/lib/meetingMath";
import type { CalendarItem, WeekView } from "@/lib/meetings";

// A Monday-to-Sunday week (BRAND_SHEET.md): today has a Coral outline, meetings booked here have a Coral edge,
// other Google events a stone edge, tasks and scheduled content are quieter. Shared by the Dashboard card and the Calendar page.

const dow = (d: string) => new Date(d + "T12:00:00Z").toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" });
const dom = (d: string) => Number(d.slice(8));
const KIND_LABEL: Record<CalendarItem["kind"], string> = { meeting: "Meeting", event: "Event", task: "Task due", content: "Content" };

function Item({ it }: { it: CalendarItem }) {
  const when = it.allDay ? (it.kind === "event" ? "All day" : "") : timeLabel(it.start);
  const title = it.href ? <Link href={it.href}>{it.title}</Link> : it.link ? <a href={it.link} target="_blank" rel="noreferrer">{it.title}</a> : <span>{it.title}</span>;
  return (
    <li className={`wk-item wk-${it.kind}${it.done ? " wk-done" : ""}`} title={`${KIND_LABEL[it.kind]}${it.sub ? ` · ${it.sub}` : ""}`}>
      <div className="wk-line">
        {it.kind === "task" && <CheckSquare size={12} aria-hidden />}
        {it.kind === "content" && <Video size={12} aria-hidden />}
        {when && <span className="wk-time">{when}</span>}
        <span className="wk-title">{title}</span>
      </div>
      {it.sub && it.kind === "meeting" && <div className="wk-sub">{it.sub}</div>}
      {it.meetUrl && <a className="wk-join" href={it.meetUrl} target="_blank" rel="noreferrer" aria-label={`Join the Google Meet for ${it.title}`}><Video size={12} aria-hidden /> Join</a>}
    </li>
  );
}

export default function WeekCalendar({ view, max = 5, weekHref }: { view: WeekView; max?: number; weekHref?: (day: string) => string }) {
  return (
    <div className="week" role="group" aria-label="This week">
      {view.days.map((d) => {
        const all = view.byDay[d] ?? [];
        // Meetings and events first, then tasks and content; keep the list short on the dashboard.
        const shown = all.slice(0, max), more = all.length - shown.length;
        return (
          <div key={d} className={`wk-day${d === view.today ? " today" : ""}${all.length === 0 ? " wk-empty" : ""}`} aria-current={d === view.today ? "date" : undefined}>
            <div className="wk-head"><span>{dow(d)}</span><b>{dom(d)}</b></div>
            {shown.length > 0 && <ul>{shown.map((it) => <Item key={it.key} it={it} />)}</ul>}
            {more > 0 && (weekHref ? <Link href={weekHref(d)} className="muted wk-more">+{more} more</Link> : <span className="muted wk-more">+{more} more</span>)}
          </div>
        );
      })}
    </div>
  );
}

