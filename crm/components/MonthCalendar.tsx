import Link from "next/link";
import { CheckSquare, Video } from "lucide-react";
import { timeLabel } from "@/lib/meetingMath";
import type { CalendarItem, MonthView } from "@/lib/meetings";

// A whole month as a Monday-to-Sunday grid (BRAND_SHEET.md), from the same items as WeekCalendar and with the same edges:
// Coral for meetings booked here, stone for other events, dashed for tasks and content. Each day shows a few one-line items;
// the day number and "+n more" open that week, where everything is listed in full. Shared by the Calendar page and the Dashboard.

const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const KIND_LABEL: Record<CalendarItem["kind"], string> = { meeting: "Meeting", event: "Event", task: "Task due", content: "Content" };
const longDay = (d: string) => new Date(d + "T12:00:00Z").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });

function Item({ it }: { it: CalendarItem }) {
  const when = it.allDay ? "" : timeLabel(it.start);
  const title = it.href ? <Link href={it.href}>{it.title}</Link> : it.link ? <a href={it.link} target="_blank" rel="noreferrer">{it.title}</a> : <span>{it.title}</span>;
  return (
    <li className={`mo-item wk-${it.kind}${it.done ? " wk-done" : ""}`} title={`${KIND_LABEL[it.kind]}: ${when ? when + " " : ""}${it.title}${it.sub ? ` · ${it.sub}` : ""}`}>
      {it.kind === "task" && <CheckSquare size={11} aria-hidden />}
      {it.kind === "content" && <Video size={11} aria-hidden />}
      {when && <span className="wk-time">{when}</span>}
      <span className="mo-title">{title}</span>
    </li>
  );
}

export default function MonthCalendar({ view, max = 3, weekHref = (d) => `/calendar?week=${d}` }: { view: MonthView; max?: number; weekHref?: (day: string) => string }) {
  return (
    <div className="month" role="group" aria-label="Month">
      {DOW.map((d) => <div key={d} className="mo-dow" aria-hidden>{d}</div>)}
      {view.days.map((d) => {
        const all = view.byDay[d] ?? [];
        const shown = all.slice(0, max), more = all.length - shown.length;
        const cls = `mo-day${d === view.today ? " today" : ""}${d.startsWith(view.month) ? "" : " mo-out"}${all.length === 0 ? " mo-empty" : ""}`;
        return (
          <div key={d} className={cls} aria-current={d === view.today ? "date" : undefined}>
            <Link href={weekHref(d)} className="mo-num" aria-label={`${longDay(d)}, ${all.length} ${all.length === 1 ? "item" : "items"}. Open that week`}>
              <span className="mo-wd" aria-hidden>{DOW[(new Date(d + "T12:00:00Z").getUTCDay() + 6) % 7]}</span>{Number(d.slice(8))}
            </Link>
            {shown.length > 0 && <ul>{shown.map((it) => <Item key={it.key} it={it} />)}</ul>}
            {more > 0 && <Link href={weekHref(d)} className="muted mo-more">+{more} more</Link>}
          </div>
        );
      })}
    </div>
  );
}
