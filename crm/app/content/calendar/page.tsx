import Link from "next/link";
import { query } from "@/lib/db";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { scheduleContent } from "@/lib/actions";
import ToastForm from "@/components/ToastForm";
import { PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export default async function Calendar({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  const offset = Number((await searchParams).week ?? 0) || 0;
  const monday = new Date();
  monday.setHours(12, 0, 0, 0);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7) + offset * 7);
  const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(monday); d.setDate(d.getDate() + i); return d; });

  const [scheduled, unscheduled] = await Promise.all([
    query<any>(`SELECT id, idea, status, scheduled_for::text AS day FROM content_items WHERE scheduled_for BETWEEN $1 AND $2 ORDER BY id`, [iso(days[0]), iso(days[6])]),
    query<any>(`SELECT id, idea, status FROM content_items WHERE scheduled_for IS NULL AND status IN ('Idea','Scripted','Filmed') ORDER BY (status = 'Scripted') DESC, id DESC LIMIT 30`),
  ]);

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
      <div className="board" style={{ gridTemplateColumns: "repeat(7, minmax(140px, 1fr))" }}>
        {days.map((d) => (
          <section key={iso(d)} className="col" style={iso(d) === iso(new Date()) ? { borderColor: "var(--accent)" } : undefined} aria-label={d.toDateString()}>
            <h2>{d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}</h2>
            {scheduled.filter((s: any) => s.day === iso(d)).map((s: any) => (
              <article key={s.id} className="deal cal-card" style={{ cursor: "default" }}>
                <Link href={`/content/${s.id}`}>{s.idea}</Link>
                <span className="muted">{s.status}</span>
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
              <span><Link href={`/content/${u.id}`}>{u.idea}</Link> <span className="muted">{u.status}</span></span>
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
