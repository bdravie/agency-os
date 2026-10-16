import Link from "next/link";
import { notFound } from "next/navigation";
import { FileDown, TriangleAlert } from "lucide-react";
import { query } from "@/lib/db";
import { loadTraining } from "@/lib/enablementData";
import { addSchedule, addStaff, createSessionTask, deleteDeliverable, deleteSchedule, deleteSession, deleteStaff, saveSchedule, saveStaff } from "@/lib/enablementActions";
import { CADENCES, SKILL_LEVELS, averageLevel, levelLabel, plusDays, sessionStatus } from "@/lib/enablementMath";
import { longDate } from "@/lib/outcomeMath";
import { todayIso } from "@/lib/outcomeData";
import ConfirmButton from "@/components/ConfirmButton";
import DeliverableForm from "@/components/DeliverableForm";
import LogSessionForm from "@/components/LogSessionForm";
import ToastForm from "@/components/ToastForm";
import { PageHeader, Pill } from "@/components/ui";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ companyId: string }> }) {
  const id = Number((await params).companyId);
  const [c] = Number.isInteger(id) ? await query<{ name: string }>(`SELECT name FROM companies WHERE id = $1`, [id]) : [];
  return { title: c ? `Training: ${c.name}` : "Enablement" };
}

const KIND: Record<string, string> = { workshop: "Workshop", follow_up: "Follow-up", office_hours: "Office hours", other: "Session" };
const D_KIND: Record<string, string> = { skill: "Skill", prompt: "Prompt", template: "Template", other: "Other" };
const LEVEL_TONE = { 1: "warn", 2: "blue", 3: "good" } as const;
const LevelPill = ({ level }: { level: number | null }) => level ? <Pill label={`${level} · ${levelLabel(level)}`} tone={LEVEL_TONE[level as 1 | 2 | 3]} /> : <Pill label="Not rated" tone="neutral" />;
const kb = (n: number) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

export default async function CompanyEnablement({ params }: { params: Promise<{ companyId: string }> }) {
  const id = Number((await params).companyId);
  if (!Number.isInteger(id)) notFound();
  const [co] = await query<{ name: string }>(`SELECT name FROM companies WHERE id = $1`, [id]);
  if (!co) notFound();
  const today = todayIso();

  const [training, staff, sessions, schedules, deliverables] = await Promise.all([
    loadTraining(),
    query<any>(`SELECT id, name, role, skill_level, active FROM enablement_staff WHERE company_id = $1 ORDER BY active DESC, name`, [id]),
    query<any>(`SELECT s.id, s.title, s.kind, to_char(s.held_on, 'YYYY-MM-DD') AS held_on, s.duration_minutes, s.topics,
                       COALESCE(json_agg(json_build_object('name', t.name, 'level', a.level_after) ORDER BY t.name) FILTER (WHERE t.id IS NOT NULL), '[]') AS attendees
                  FROM enablement_sessions s LEFT JOIN enablement_attendance a ON a.session_id = s.id LEFT JOIN enablement_staff t ON t.id = a.staff_id
                 WHERE s.company_id = $1 GROUP BY s.id ORDER BY s.held_on DESC, s.id DESC LIMIT 50`, [id]),
    query<any>(`SELECT id, title, cadence, to_char(next_on, 'YYYY-MM-DD') AS next_on, duration_minutes, status FROM enablement_schedules WHERE company_id = $1 ORDER BY (status = 'active') DESC, next_on`, [id]),
    query<any>(`SELECT d.id, d.kind, d.title, d.description, d.body, to_char(d.delivered_on, 'YYYY-MM-DD') AS delivered_on, d.session_id,
                       COALESCE(json_agg(json_build_object('id', f.id, 'name', f.filename, 'size', f.size_bytes) ORDER BY f.id) FILTER (WHERE f.id IS NOT NULL), '[]') AS files
                  FROM enablement_deliverables d LEFT JOIN enablement_files f ON f.deliverable_id = d.id
                 WHERE d.company_id = $1 GROUP BY d.id ORDER BY d.delivered_on DESC, d.id DESC`, [id]),
  ]);
  const row = training.find((t) => t.id === id);
  const status = row?.status ?? sessionStatus({ retained: false, lastSession: sessions[0]?.held_on ?? null, since: null, today });
  const active = staff.filter((s: any) => s.active);
  const avg = averageLevel(active.map((s: any) => s.skill_level));
  const mix = SKILL_LEVELS.map((l) => ({ ...l, n: active.filter((s: any) => s.skill_level === l.level).length }));

  return (
    <>
      <PageHeader back={{ href: "/enablement", label: "Enablement" }} title={`Training: ${co.name}`}
        description={<span className="row" style={{ gap: 10 }}><Link href={`/companies/${id}`}>{co.name}</Link>{row?.retained ? <Pill label="Retained" tone="good" /> : <Pill label="No retainer" tone="neutral" />}<span className="muted">{sessions[0] ? `Last session ${longDate(sessions[0].held_on)} (${status.label})` : "No sessions yet"}</span></span>} />

      <div className="stack">
        {status.due && (
          <section className="card" style={{ borderColor: "var(--warn)" }}>
            <div className="row-between">
              <div className="row" style={{ gap: 8 }}><TriangleAlert size={18} aria-hidden style={{ color: "var(--warn)" }} /><b>Overdue a session:</b> {sessions[0] ? `${status.days} days since the last one.` : status.days === null ? "no session on record." : `${status.days} days since the service started, with none held.`}</div>
              <ToastForm action={createSessionTask} success="Task added for tomorrow"><input type="hidden" name="company_id" value={id} /><button className="secondary">Add task to book one</button></ToastForm>
            </div>
          </section>
        )}

        <section className="card">
          <div className="row-between"><h2 style={{ margin: 0 }}>Staff and skill levels</h2><span className="muted">{active.length} active{avg !== null && ` · average ${avg}`}</span></div>
          {active.length > 0 && <div className="row" style={{ margin: "10px 0" }}>{mix.map((m) => <span key={m.level} className="muted"><b style={{ color: "var(--text)" }}>{m.n}</b> at {m.level} · {m.label}</span>)}</div>}
          <p className="muted" style={{ margin: "6px 0 10px" }}>Names and roles only, no contact details. Levels are a training record to see who needs more help, not a performance rating. Remove anyone on request.</p>
          <div className="stack" style={{ gap: 8 }}>
            {staff.map((s: any) => (
              <div key={s.id} className="row" style={{ gap: 8 }}>
                <ToastForm action={saveStaff} success="Saved" className="row" style={{ flex: 1 }}>
                  <input type="hidden" name="id" value={s.id} />
                  <input name="name" defaultValue={s.name} maxLength={80} style={{ width: 190 }} aria-label="Name" />
                  <input name="role" defaultValue={s.role ?? ""} maxLength={80} placeholder="Role" style={{ width: 170 }} aria-label="Role" />
                  <select name="level" defaultValue={s.skill_level ?? ""} aria-label="Skill level"><option value="">Not rated</option>{SKILL_LEVELS.map((l) => <option key={l.level} value={l.level}>{l.level} · {l.label}</option>)}</select>
                  <label className="row muted" style={{ gap: 6 }}><input type="checkbox" name="active" defaultChecked={s.active} /> Active</label>
                  <button className="secondary">Save</button>
                </ToastForm>
                <ToastForm action={deleteStaff} success="Removed" confirm={`Remove ${s.name} and their attendance history?`}><input type="hidden" name="id" value={s.id} /><button className="link">Remove</button></ToastForm>
              </div>
            ))}
            <ToastForm action={addStaff} success="Added" reset className="row">
              <input type="hidden" name="company_id" value={id} />
              <input name="name" placeholder="Add a person" maxLength={80} style={{ width: 190 }} aria-label="Name" required />
              <input name="role" placeholder="Role" maxLength={80} style={{ width: 170 }} aria-label="Role" />
              <select name="level" defaultValue="" aria-label="Skill level"><option value="">Not rated</option>{SKILL_LEVELS.map((l) => <option key={l.level} value={l.level}>{l.level} · {l.label}</option>)}</select>
              <button className="secondary">Add</button>
            </ToastForm>
          </div>
        </section>

        <section className="card" id="log">
          <h2>Log a session</h2>
          <LogSessionForm companyId={id} today={today} staff={active.map((s: any) => ({ id: Number(s.id), name: s.name, role: s.role, skill_level: s.skill_level }))}
            schedules={schedules.filter((h: any) => h.status === "active").map((h: any) => ({ id: Number(h.id), title: h.title, next_on: h.next_on, duration_minutes: h.duration_minutes }))} />
        </section>

        <section className="card">
          <h2>Sessions held</h2>
          {sessions.length === 0 ? <p className="muted" style={{ margin: 0 }}>Nothing logged yet.</p> : (
            <ul>{sessions.map((s: any) => (
              <li key={s.id} className="stack" style={{ gap: 6 }}>
                <div className="row-between"><span><b>{s.title}</b> <span className="muted">· {KIND[s.kind]} · {longDate(s.held_on)} · {s.duration_minutes} min</span></span>
                  <ToastForm action={deleteSession} success="Session deleted" confirm="Delete this session? Skill levels already updated stay as they are."><input type="hidden" name="id" value={s.id} /><button className="link">Delete</button></ToastForm></div>
                {s.topics && <div className="muted">{s.topics}</div>}
                <div className="row" style={{ gap: 6 }}>{(s.attendees as { name: string; level: number | null }[]).map((a, i) => <span key={i} className="badge tone-neutral">{a.name}{a.level ? ` · level ${a.level}` : ""}</span>)}</div>
              </li>
            ))}</ul>
          )}
        </section>

        <section className="card">
          <h2>Recurring sessions</h2>
          <p className="muted" style={{ marginTop: 0 }}>Each schedule keeps one task open for its next date. Logging a session against it moves it on.</p>
          <div className="stack" style={{ gap: 8 }}>
            {schedules.map((h: any) => (
              <div key={h.id} className="row" style={{ gap: 8 }}>
                <ToastForm action={saveSchedule} success="Saved" className="row" style={{ flex: 1 }}>
                  <input type="hidden" name="id" value={h.id} />
                  <input name="title" defaultValue={h.title} maxLength={200} style={{ flex: 1, minWidth: 200 }} aria-label="Title" />
                  <select name="cadence" defaultValue={h.cadence} aria-label="How often">{CADENCES.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}</select>
                  <input type="date" name="next_on" defaultValue={h.next_on} aria-label="Next session" />
                  <input type="number" name="duration" min="5" max="600" defaultValue={h.duration_minutes} style={{ width: 80 }} aria-label="Minutes" />
                  <label className="row muted" style={{ gap: 6 }}><input type="checkbox" name="paused" defaultChecked={h.status === "paused"} /> Paused</label>
                  <button className="secondary">Save</button>
                </ToastForm>
                <ToastForm action={deleteSchedule} success="Schedule deleted" confirm="Delete this schedule and its open task?"><input type="hidden" name="id" value={h.id} /><button className="link">Delete</button></ToastForm>
              </div>
            ))}
            <ToastForm action={addSchedule} success="Schedule added, with a task for the first session" reset className="row">
              <input type="hidden" name="company_id" value={id} />
              <input name="title" placeholder="New schedule, e.g. Monthly AI clinic" maxLength={200} style={{ flex: 1, minWidth: 200 }} aria-label="Title" required />
              <select name="cadence" defaultValue="monthly" aria-label="How often">{CADENCES.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}</select>
              <input type="date" name="next_on" defaultValue={plusDays(today, 7)} min={today} aria-label="First session" required />
              <input type="number" name="duration" min="5" max="600" defaultValue="60" style={{ width: 80 }} aria-label="Minutes" />
              <button className="secondary">Add</button>
            </ToastForm>
          </div>
        </section>

        <section className="card">
          <h2>Skills, prompts and templates delivered</h2>
          {deliverables.length === 0 ? <p className="muted" style={{ marginTop: 0 }}>Nothing handed over yet.</p> : (
            <ul>{deliverables.map((d: any) => (
              <li key={d.id} className="stack" style={{ gap: 6 }}>
                <div className="row-between"><span className="row" style={{ gap: 8 }}><Pill label={D_KIND[d.kind]} tone="blue" /><b>{d.title}</b><span className="muted">· {longDate(d.delivered_on)}</span></span>
                  <ToastForm action={deleteDeliverable} success="Deleted" confirm={`Delete “${d.title}” and its files?`}><input type="hidden" name="id" value={d.id} /><button className="link">Delete</button></ToastForm></div>
                {d.description && <div className="muted">{d.description}</div>}
                {(d.files as { id: number; name: string; size: number }[]).length > 0 && <div className="row" style={{ gap: 12 }}>{(d.files as { id: number; name: string; size: number }[]).map((f) => <a key={f.id} href={`/enablement/files/${f.id}`} className="row" style={{ gap: 6 }}><FileDown size={14} aria-hidden />{f.name} <span className="muted">{kb(f.size)}</span></a>)}</div>}
                {d.body && <details><summary>Show the text</summary><pre style={{ whiteSpace: "pre-wrap", margin: "8px 0 0", fontFamily: "inherit" }}>{d.body}</pre></details>}
              </li>
            ))}</ul>
          )}
          <details style={{ marginTop: 12 }} open={deliverables.length === 0}>
            <summary>Hand over something new</summary>
            <div style={{ marginTop: 12 }}><DeliverableForm companyId={id} today={today} sessions={sessions.map((s: any) => ({ id: Number(s.id), title: s.title, held_on: s.held_on }))} /></div>
          </details>
        </section>
      </div>
    </>
  );
}
