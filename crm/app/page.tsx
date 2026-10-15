import Link from "next/link";
import { Check, FileSignature, Plus, Video } from "lucide-react";
import { query } from "@/lib/db";
import { completeTask } from "@/lib/actions";
import { gbp } from "@/lib/quote";
import { ago, when } from "@/lib/format";
import { ActivityIcon, activityLabel } from "@/components/activity";
import { Badge, EmptyState, PageHeader, Stat } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Today" };

export default async function Today() {
  const [tasks, stale, recent, backup, pipeline, mrr, outreach] = await Promise.all([
    query<any>(
      `SELECT t.id, t.title, t.due_at, t.company_id, c.name AS company_name, (t.due_at < now()::date) AS overdue
         FROM tasks t LEFT JOIN companies c ON c.id = t.company_id
        WHERE t.done_at IS NULL AND t.due_at < now()::date + 1 ORDER BY t.due_at LIMIT 20`),
    query<any>(
      `SELECT d.id, d.title, d.stage::text AS stage, d.updated_at, d.company_id FROM deals d
        WHERE d.stage IN ('Contacted','Replied','Call booked','Proposal sent') AND d.updated_at < now() - interval '3 days'
        ORDER BY d.updated_at LIMIT 8`),
    query<any>(
      `SELECT a.id, a.type, a.body, a.occurred_at, a.company_id, c.name AS company_name
         FROM activities a LEFT JOIN companies c ON c.id = a.company_id
        WHERE a.type NOT IN ('places_lookup', 'lead_added', 'website_found') ORDER BY a.occurred_at DESC LIMIT 12`),
    query<{ last: string | null }>(`SELECT max(occurred_at) AS last FROM activities WHERE type = 'backup_completed'`),
    query<{ setup: string; monthly: string; n: string }>(
      `SELECT coalesce(sum(setup_value_gbp),0) AS setup, coalesce(sum(monthly_value_gbp),0) AS monthly, count(*) AS n
         FROM deals WHERE stage NOT IN ('Won','Lost')`),
    query<{ mrr: string; clients: string }>(
      `SELECT coalesce(sum(monthly_fee_gbp),0) AS mrr, count(DISTINCT company_id) AS clients FROM client_services WHERE status = 'Active'`),
    query<{ n: string }>(`SELECT count(*) AS n FROM activities WHERE type = 'email_logged' AND occurred_at > now() - interval '7 days'`),
  ]);

  const last = backup[0]?.last ? new Date(backup[0].last) : null;
  const hours = last ? (Date.now() - last.getTime()) / 3_600_000 : null;
  const backupBad = hours === null || hours > 36;
  const overdue = tasks.filter((t: any) => t.overdue).length;
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  return (
    <>
      <PageHeader
        title={greeting}
        description={new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}
        actions={
          <>
            <Link href="/companies?status=New" className="btn secondary"><Plus size={16} aria-hidden /> Find a lead</Link>
            <Link href="/proposals/new" className="btn secondary"><FileSignature size={16} aria-hidden /> New proposal</Link>
            <Link href="/content" className="btn secondary"><Video size={16} aria-hidden /> Content ideas</Link>
          </>
        }
      />

      <section className="stats" aria-label="Key numbers">
        <Stat label="Tasks due" value={tasks.length} hint={overdue ? `${overdue} overdue` : "Nothing overdue"} href="/tasks" />
        <Stat label="Open pipeline" value={gbp(pipeline[0].setup)} hint={`${gbp(pipeline[0].monthly)}/mo across ${pipeline[0].n} deal${pipeline[0].n === "1" ? "" : "s"}`} href="/deals" />
        <Stat label="Monthly recurring revenue" value={gbp(mrr[0].mrr)} hint={`${mrr[0].clients} active client${mrr[0].clients === "1" ? "" : "s"}`} href="/clients" />
        <Stat label="Outreach this week" value={outreach[0].n} hint="emails you've logged as sent" />
      </section>

      <div className="split">
        <div className="stack">
          <section className="card" aria-labelledby="tasks-h">
            <div className="row-between"><h2 id="tasks-h">Tasks due</h2><Link href="/tasks" className="muted">All tasks</Link></div>
            {tasks.length === 0 ? (
              <EmptyState title="All clear" icon={<Check size={22} />}>No tasks due today. Good time to find a few leads.</EmptyState>
            ) : (
              <ul>{tasks.map((t: any) => (
                <li key={t.id} className="row">
                  <form action={completeTask}>
                    <input type="hidden" name="task_id" value={t.id} />
                    <button className="link" title="Mark done" aria-label={`Mark done: ${t.title}`}><Check size={16} /></button>
                  </form>
                  <span style={{ flex: 1 }}>
                    {t.title}
                    {t.company_id && !t.title.includes(t.company_name) && <> <Link href={`/companies/${t.company_id}`} className="muted">{t.company_name}</Link></>}
                  </span>
                  <span className={t.overdue ? "badge tone-bad" : "badge tone-neutral"}>{t.overdue ? "Overdue" : "Today"}</span>
                </li>
              ))}</ul>
            )}
          </section>

          <section className="card" aria-labelledby="follow-h">
            <h2 id="follow-h">Deals going quiet</h2>
            {stale.length === 0 ? (
              <p className="muted">Every open deal has had attention in the last 3 days.</p>
            ) : (
              <ul>{stale.map((d: any) => (
                <li key={d.id} className="row-between">
                  <span>{d.company_id ? <Link href={`/companies/${d.company_id}`}>{d.title}</Link> : d.title}</span>
                  <span className="row"><Badge value={d.stage} /><span className="muted">{ago(d.updated_at)}</span></span>
                </li>
              ))}</ul>
            )}
          </section>
        </div>

        <section className="card" aria-labelledby="act-h">
          <h2 id="act-h">Recent activity</h2>
          {recent.length === 0 ? <EmptyState title="Nothing yet">Activity appears here as you work.</EmptyState> : (
            <ul className="timeline">{recent.map((a: any) => (
              <li key={a.id}>
                <span className="tl-dot"><ActivityIcon type={a.type} /></span>
                <div>
                  <div className="tl-title">{activityLabel(a.type)}{a.company_id && <> · <Link href={`/companies/${a.company_id}`}>{a.company_name}</Link></>}</div>
                  {a.body && a.body !== a.company_name && <div className="muted">{a.body}</div>}
                  <div className="tl-time" title={when(a.occurred_at)}>{ago(a.occurred_at)}</div>
                </div>
              </li>
            ))}</ul>
          )}
          <p className={backupBad ? "error" : "muted"} style={{ marginTop: 12 }}>
            {last ? `Last backup ${ago(last)}${backupBad ? " (over 36 hours: check the backup job)" : ""}` : "No backup recorded yet. Run: uv run python -m agency.backup"}
          </p>
        </section>
      </div>
    </>
  );
}
