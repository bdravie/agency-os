import Link from "next/link";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

const when = (d: Date | string) => new Date(d).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });

export default async function Today() {
  const [tasks, stale, recent] = await Promise.all([
    query<{ id: number; title: string; due_at: string; company_name: string | null }>(
      `SELECT t.id, t.title, t.due_at, c.name AS company_name
         FROM tasks t LEFT JOIN companies c ON c.id = t.company_id
        WHERE t.done_at IS NULL AND t.due_at < now()::date + 1
        ORDER BY t.due_at LIMIT 20`),
    query<{ id: number; title: string; stage: string; updated_at: string }>(
      `SELECT id, title, stage, updated_at FROM deals
        WHERE stage IN ('Contacted','Replied','Call booked','Proposal sent')
          AND updated_at < now() - interval '3 days'
        ORDER BY updated_at LIMIT 10`),
    query<{ id: number; type: string; channel: string | null; body: string | null; occurred_at: string; company_name: string | null }>(
      `SELECT a.id, a.type, a.channel, a.body, a.occurred_at, c.name AS company_name
         FROM activities a LEFT JOIN companies c ON c.id = a.company_id
        ORDER BY a.occurred_at DESC LIMIT 15`),
  ]);

  return (
    <>
      <h1>Today</h1>
      <div className="grid">
        <section className="card">
          <h2>Tasks due</h2>
          {tasks.length === 0 && <p className="muted">Nothing due. Nice.</p>}
          <ul>{tasks.map((t) => (
            <li key={t.id}>{t.title} <span className="muted">{t.company_name} · {when(t.due_at)}</span></li>
          ))}</ul>
        </section>
        <section className="card">
          <h2>Deals needing follow-up</h2>
          {stale.length === 0 && <p className="muted">All deals are fresh.</p>}
          <ul>{stale.map((d) => (
            <li key={d.id}><Link href="/deals">{d.title}</Link> <span className="muted">{d.stage} · last touched {when(d.updated_at)}</span></li>
          ))}</ul>
        </section>
        <section className="card wide">
          <h2>Recent activity</h2>
          {recent.length === 0 && <p className="muted">No activity yet.</p>}
          <ul>{recent.map((a) => (
            <li key={a.id}><b>{a.type}</b> {a.channel && `(${a.channel})`} {a.company_name} {a.body && `– ${a.body}`} <span className="muted">{when(a.occurred_at)}</span></li>
          ))}</ul>
        </section>
      </div>
    </>
  );
}
