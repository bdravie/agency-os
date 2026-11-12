import Link from "next/link";
import { query } from "@/lib/db";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { scheduleContent } from "@/lib/actions";
import ToastForm from "@/components/ToastForm";
import { PageHeader } from "@/components/ui";
import { loadContentConfig } from "@/lib/content";
import { loadInsights } from "@/lib/contentInsights";
import { suggestSlots } from "@/lib/filmMath";
import ContentTabs from "@/components/ContentTabs";
import { LINKEDIN_FORMAT } from "@/lib/linkedinMath";

/** A LinkedIn post opens its own page (text, image and plan); everything else opens the video page. */
const itemHref = (i: { id: number | string; format: string | null }) => (i.format === LINKEDIN_FORMAT ? `/content/linkedin/${i.id}` : `/content/${i.id}`);

export const dynamic = "force-dynamic";

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export default async function Calendar({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  const offset = Number((await searchParams).week ?? 0) || 0;
  const monday = new Date();
  monday.setHours(12, 0, 0, 0);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7) + offset * 7);
  const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(monday); d.setDate(d.getDate() + i); return d; });

  const [scheduled, unscheduled] = await Promise.all([
    query<any>(`SELECT id, idea, status, format, scheduled_for::text AS day, left(scheduled_time::text, 5) AS time FROM content_items WHERE scheduled_for BETWEEN $1 AND $2 AND status <> 'Archived' ORDER BY scheduled_time NULLS LAST, id`, [iso(days[0]), iso(days[6])]),
    query<any>(`SELECT id, idea, status, format FROM content_items WHERE scheduled_for IS NULL AND status IN ('Idea','Scripted','Filmed') ORDER BY (status = 'Scripted') DESC, id DESC LIMIT 30`),
  ]);

  const [config, ins] = await Promise.all([loadContentConfig(), loadInsights("all")]);
  const tableOf = (title: string) => ins.tables.find((t) => t.title === title)?.groups ?? [];
  const slots = suggestSlots(config.posts_per_week, tableOf("Weekday posted"), tableOf("Time of day posted"));
  const dayOf = (weekday: string) => days.find((d) => d.toLocaleDateString("en-GB", { weekday: "long" }) === weekday) ?? null;

  const range = `${days[0].toLocaleDateString("en-GB", { day: "numeric", month: "short" })} – ${days[6].toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`;
  return (
    <>
      <PageHeader
        back={{ href: "/content", label: "Content" }}
        title="Content calendar"
        description={range}
        actions={
          <>
            <Link href={`/content/calendar?week=${offset - 1}`} className="btn secondary" aria-label="Previous week"><ChevronLeft size={16} aria-hidden /></Link>
            <Link href="/content/calendar" className="btn secondary">This week</Link>
            <Link href={`/content/calendar?week=${offset + 1}`} className="btn secondary" aria-label="Next week"><ChevronRight size={16} aria-hidden /></Link>
          </>
        }
      />
      <ContentTabs current="calendar" />
      <section className="card" aria-labelledby="slots-h" style={{ marginBottom: 16 }}>
        <h2 id="slots-h">Suggested slots</h2>
        <p className="muted">{config.posts_per_week} posts a week. Your best days and times once the data is in; until then a labelled starting guess.</p>
        <ul>
          {slots.map((s) => {
            const d = dayOf(s.weekday);
            const taken = d ? scheduled.filter((x: any) => x.day === iso(d)).length : 0;
            return (
              <li key={s.weekday} className="row-between" style={{ gap: 12, alignItems: "flex-start" }}>
                <span><b>{s.weekday}{d ? ` ${d.getDate()} ${d.toLocaleDateString("en-GB", { month: "short" })}` : ""}</b> · {s.time}<div className="muted">{s.why}</div></span>
                <span className={`badge tone-${taken ? "good" : "neutral"}`}>{taken ? `${taken} scheduled` : "Free"}</span>
              </li>
            );
          })}
        </ul>
      </section>
      <div className="board cal-board">
        {days.map((d) => (
          <section key={iso(d)} className="col" style={iso(d) === iso(new Date()) ? { borderColor: "var(--accent)" } : undefined} aria-label={d.toDateString()}>
            <h2>{d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}</h2>
            {scheduled.filter((s: any) => s.day === iso(d)).map((s: any) => (
              <article key={s.id} className="deal cal-card" style={{ cursor: "default" }}>
                <Link href={itemHref(s)}>{s.idea}</Link>
                <span className="muted">{[s.time, s.format === LINKEDIN_FORMAT ? "LinkedIn post" : null, s.status === "Scripted" && s.format === LINKEDIN_FORMAT ? null : s.status].filter(Boolean).join(" · ")}</span>
              </article>
            ))}
          </section>
        ))}
      </div>

      <h2 style={{ marginTop: 28 }}>Not scheduled yet</h2>
      <div className="card">
        <ul>
          {unscheduled.map((u: any) => (
            <li key={u.id} style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "space-between" }}>
              <span><Link href={itemHref(u)}>{u.idea}</Link> <span className="muted">{u.status}</span></span>
              <ToastForm action={scheduleContent} success="Date saved" style={{ display: "flex", gap: 6 }}>
                <input type="hidden" name="id" value={u.id} />
                <input type="date" name="date" defaultValue={days.some((d) => iso(d) === iso(new Date())) ? iso(new Date()) : iso(days[0])} aria-label="Date" required />
                <button className="secondary">Schedule</button>
              </ToastForm>
            </li>
          ))}
          {unscheduled.length === 0 && <li className="muted">Everything is scheduled.</li>}
        </ul>
      </div>
    </>
  );
}
