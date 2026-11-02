import Link from "next/link";
import ToastForm from "@/components/ToastForm";
import { Check, FileSignature, Plus, Video } from "lucide-react";
import { query } from "@/lib/db";
import { loadRevenue } from "@/lib/revenue";
import { loadOutcomes, needsAttention } from "@/lib/outcomeData";
import { dueForSession, loadTraining } from "@/lib/enablementData";
import { completeTask } from "@/lib/actions";
import { loadContentConfig } from "@/lib/content";
import { gbp } from "@/lib/quote";
import { ago, when } from "@/lib/format";
import { activityLabel } from "@/components/activity";
import ActivityItem from "@/components/ActivityItem";
import { activityTarget } from "@/lib/activityTarget";
import { EmptyState, PageHeader, StageBadge, Stat } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Today" };

export default async function Today() {
  const [tasks, stale, recent, backup, revenue, outreach, outcomes, training, contentStats, contentOverdue, contentConfig, briefRow] = await Promise.all([
    query<any>(
      `SELECT t.id, t.title, t.due_at, t.company_id, c.name AS company_name, (t.due_at < now()::date) AS overdue
         FROM tasks t LEFT JOIN companies c ON c.id = t.company_id
        WHERE t.done_at IS NULL AND t.due_at < now()::date + 1 ORDER BY t.due_at LIMIT 20`),
    query<any>(
      `SELECT d.id, d.title, d.stage::text AS stage, d.updated_at, d.company_id FROM deals d
        WHERE d.stage IN ('Contacted','Replied','Call booked','Audit sold','Proposal sent') AND d.updated_at < now() - interval '3 days'
        ORDER BY d.updated_at LIMIT 8`),
    query<any>(
      `SELECT a.id, a.type, a.body, a.occurred_at, a.company_id, a.deal_id, a.contact_id, c.name AS company_name
         FROM activities a LEFT JOIN companies c ON c.id = a.company_id
        WHERE a.type NOT IN ('places_lookup', 'lead_added', 'website_found') ORDER BY a.occurred_at DESC LIMIT 12`),
    query<{ last: string | null }>(`SELECT max(occurred_at) AS last FROM activities WHERE type = 'backup_completed'`),
    loadRevenue(),
    query<{ n: string }>(`SELECT count(*) AS n FROM activities WHERE type = 'email_logged' AND occurred_at > now() - interval '7 days'`),
    loadOutcomes(),
    loadTraining(),
    // Weeks start on Monday, in UK time.
    query<{ posted_week: string; filmed: string; ideas: string }>(
      `SELECT count(*) FILTER (WHERE status = 'Posted' AND (posted_at AT TIME ZONE 'Europe/London') >= date_trunc('week', now() AT TIME ZONE 'Europe/London')) AS posted_week,
              count(*) FILTER (WHERE status = 'Filmed') AS filmed,
              count(*) FILTER (WHERE status = 'Idea') AS ideas
         FROM content_items`),
    query<any>(
      `SELECT id, idea, scheduled_for::text AS day, status FROM content_items
        WHERE scheduled_for < (now() AT TIME ZONE 'Europe/London')::date AND status NOT IN ('Posted','Archived')
        ORDER BY scheduled_for LIMIT 5`),
    loadContentConfig(),
    query<{ has: boolean }>(`SELECT EXISTS (SELECT 1 FROM content_briefs WHERE week_start = (date_trunc('week', now() AT TIME ZONE 'Europe/London'))::date) AS has`),
  ]);
  const postedWeek = Number(contentStats[0].posted_week);
  const noSession = dueForSession(training);
  const atRisk = outcomes.filter(needsAttention);

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
            <Link href="/companies?view=nosite" className="btn secondary"><Plus size={16} aria-hidden /> Find a lead</Link>
            <Link href="/proposals/new" className="btn secondary"><FileSignature size={16} aria-hidden /> New proposal</Link>
            <Link href="/content" className="btn secondary"><Video size={16} aria-hidden /> Content ideas</Link>
          </>
        }
      />

      <section className="stats" aria-label="Key numbers">
        <Stat label="Monthly recurring revenue" value={gbp(revenue.mrr)} hint={`${revenue.activeClients} active client${revenue.activeClients === 1 ? "" : "s"}`} href="/clients" />
        <Stat label="One-off revenue this month" value={gbp(revenue.oneOffMonth)} hint={`${gbp(revenue.oneOffTotal)} all time · audits, builds, workshops`} href="/funnel" />
        <Stat label="Open pipeline" value={gbp(revenue.pipelineOneOff)} hint={`one-off, plus ${gbp(revenue.pipelineMonthly)}/mo recurring · ${revenue.openDeals} deal${revenue.openDeals === 1 ? "" : "s"}`} href="/deals" />
        <Stat label="Tasks due" value={tasks.length} hint={overdue ? `${overdue} overdue` : "Nothing overdue"} href="/tasks" />
        <Stat label="Clients to check on" value={atRisk.length} hint={atRisk.length ? atRisk.slice(0, 2).map((l) => l.outcome.company_name).join(", ") + (atRisk.length > 2 ? "…" : "") : outcomes.length ? "Results are on track" : "Track results on the Outcomes page"} href="/outcomes" />
        <Stat label="Training overdue" value={noSession.length} hint={noSession.length ? noSession.slice(0, 2).map((r) => r.name).join(", ") + (noSession.length > 2 ? "…" : "") : "Retained clients are up to date"} href="/enablement" />
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
                  <ToastForm action={completeTask} success="Task done">
                    <input type="hidden" name="task_id" value={t.id} />
                    <button className="link" title="Mark done" aria-label={`Mark done: ${t.title}`}><Check size={16} /></button>
                  </ToastForm>
                  <span style={{ flex: 1 }}>
                    {t.title}
                    {t.company_id && !t.title.includes(t.company_name) && <> <Link href={`/companies/${t.company_id}`} className="muted">{t.company_name}</Link></>}
                  </span>
                  <span className={t.overdue ? "badge tone-bad" : "badge tone-neutral"}>{t.overdue ? "Overdue" : "Today"}</span>
                </li>
              ))}</ul>
            )}
          </section>

          <section className="card" aria-labelledby="content-h">
            <div className="row-between"><h2 id="content-h">Content</h2><Link href="/content" className="muted">Open content</Link></div>
            <ul>
              <li className="row-between"><span>Posts this week</span><span className={`badge tone-${postedWeek >= contentConfig.posts_per_week ? "good" : "neutral"}`}>{postedWeek} of {contentConfig.posts_per_week}</span></li>
              <li className="row-between"><span>Filmed, not posted</span><span className={`badge tone-${Number(contentStats[0].filmed) ? "warn" : "neutral"}`}>{contentStats[0].filmed}</span></li>
              <li className="row-between"><span>Scripts overdue</span><span className={`badge tone-${contentOverdue.length ? "bad" : "neutral"}`}>{contentOverdue.length}</span></li>
            </ul>
            <p className="muted" style={{ marginTop: 8 }}><Link href="/content/brief">{briefRow[0].has ? "This week's content brief is ready" : "Write this week's content brief"}</Link></p>
            {contentOverdue.map((c: any) => (
              <p key={c.id} className="muted" style={{ marginTop: 6 }}>
                <Link href={`/content/${c.id}`}>{c.idea.length > 80 ? c.idea.slice(0, 77) + "…" : c.idea}</Link> was due {new Date(c.day + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
              </p>
            ))}
          </section>

          <section className="card" aria-labelledby="follow-h">
            <h2 id="follow-h">Deals going quiet</h2>
            {stale.length === 0 ? (
              <p className="muted">Every open deal has had attention in the last 3 days.</p>
            ) : (
              <ul>{stale.map((d: any) => (
                <li key={d.id} className="row-between">
                  <span>{d.company_id ? <Link href={`/companies/${d.company_id}`}>{d.title}</Link> : d.title}</span>
                  <span className="row"><StageBadge stage={d.stage} /><span className="muted">{ago(d.updated_at)}</span></span>
                </li>
              ))}</ul>
            )}
          </section>
        </div>

        <section className="card" aria-labelledby="act-h">
          <h2 id="act-h">Recent activity</h2>
          {recent.length === 0 ? <EmptyState title="Nothing yet">Activity appears here as you work.</EmptyState> : (
            <ul className="timeline">{recent.map((a: any) => (
              <ActivityItem key={a.id} type={a.type} target={activityTarget(a, "feed")}>
                <div className="tl-title">{activityLabel(a.type)}{a.company_id && <> · <Link href={`/companies/${a.company_id}`}>{a.company_name}</Link></>}</div>
                {a.body && a.body !== a.company_name && <div className="muted">{a.body}</div>}
                <div className="tl-time" title={when(a.occurred_at)}>{ago(a.occurred_at)}</div>
              </ActivityItem>
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
