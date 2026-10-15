import Link from "next/link";
import { notFound } from "next/navigation";
import { Check, FileText, Globe, Mail } from "lucide-react";
import { query } from "@/lib/db";
import { addDealTask, completeTask, logDealNote, updateDeal } from "@/lib/actions";
import { gbp } from "@/lib/quote";
import { ago, dateOnly, when } from "@/lib/format";
import { CHANNELS, STAGE_META, channelLabel, lostLabel, stageLabel, type Stage } from "@/lib/stages";
import DealStageControl from "@/components/DealStageControl";
import ToastForm from "@/components/ToastForm";
import { ActivityIcon, activityLabel } from "@/components/activity";
import { Badge, EmptyState, PageHeader, StageBadge } from "@/components/ui";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const [d] = Number.isInteger(id) ? await query<{ title: string }>(`SELECT title FROM deals WHERE id = $1`, [id]) : [];
  return { title: d?.title ?? "Deal" };
}

export default async function DealPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const [deal] = await query<any>(
    `SELECT d.*, d.stage::text AS stage_text, d.expected_close::text AS close_text, c.name AS company_name, c.domain, c.generic_email, c.status AS company_status, c.postcode
       FROM deals d LEFT JOIN companies c ON c.id = d.company_id WHERE d.id = $1`, [id]);
  if (!deal) notFound();
  const [tasks, quotes, activity, contact, history] = await Promise.all([
    query<any>(`SELECT id, title, due_at FROM tasks WHERE deal_id = $1 AND done_at IS NULL ORDER BY due_at NULLS LAST`, [id]),
    query<any>(`SELECT id, status, total_setup_gbp, total_monthly_gbp, created_at FROM quotes WHERE deal_id = $1 ORDER BY created_at DESC`, [id]),
    query<any>(`SELECT id, type, body, occurred_at FROM activities WHERE deal_id = $1 OR (company_id = $2 AND $2 IS NOT NULL) ORDER BY occurred_at DESC LIMIT 40`, [id, deal.company_id]),
    deal.contact_id ? query<any>(`SELECT name, role, email, phone, consent_basis FROM contacts WHERE id = $1`, [deal.contact_id]) : Promise.resolve([]),
    query<any>(`SELECT from_stage::text AS from_stage, to_stage::text AS to_stage, changed_at, source FROM stage_history WHERE deal_id = $1 ORDER BY changed_at, id`, [id]),
  ]);
  const meta = STAGE_META[deal.stage_text as Stage];

  return (
    <>
      <PageHeader
        back={{ href: "/deals", label: "Deals" }}
        title={deal.title}
        description={
          <span className="row" style={{ gap: 10 }}>
            <StageBadge stage={deal.stage_text} />
            <span>{meta?.hint}</span>
            {deal.company_id && <Link href={`/companies/${deal.company_id}`}>{deal.company_name}</Link>}
          </span>
        }
        actions={<Link href={`/quotes/new?deal=${id}`} className="btn"><FileText size={16} aria-hidden /> Create quote</Link>}
      />

      <section className="card" style={{ marginBottom: 20 }}>
        <div className="field-label">Stage</div>
        <DealStageControl dealId={id} title={deal.title} stage={deal.stage_text} />
        <div className="next" style={{ marginTop: 12 }}>
          <div><div className="next-label">Next step for this stage</div><b style={{ fontWeight: 550 }}>{meta?.next}</b></div>
        </div>
        {deal.stage_text === "Lost" && <p className="muted" style={{ marginTop: 8 }}>Lost: {lostLabel(deal.lost_reason)}{deal.lost_note ? ` · ${deal.lost_note}` : ""}</p>}
      </section>

      <div className="split">
        <div className="stack">
          <section className="card">
            <h2>Details</h2>
            <ToastForm action={updateDeal} success="Deal saved" className="stack" style={{ gap: 12 }}>
              <input type="hidden" name="id" value={id} />
              <div><label className="field-label" htmlFor="f-title">Title</label><input id="f-title" name="title" defaultValue={deal.title} required style={{ width: "100%" }} /></div>
              <div className="row">
                <div><label className="field-label" htmlFor="f-setup">Setup £</label><input id="f-setup" name="setup" type="number" min="0" step="1" defaultValue={Number(deal.setup_value_gbp)} style={{ width: 130 }} /></div>
                <div><label className="field-label" htmlFor="f-monthly">Monthly £</label><input id="f-monthly" name="monthly" type="number" min="0" step="1" defaultValue={Number(deal.monthly_value_gbp)} style={{ width: 130 }} /></div>
                <div><label className="field-label" htmlFor="f-close">Expected close</label><input id="f-close" name="expected_close" type="date" defaultValue={deal.close_text ?? ""} /></div>
                <div><label className="field-label" htmlFor="f-channel">Channel</label><select id="f-channel" name="channel" defaultValue={deal.channel ?? ""}><option value="">Not set</option>{CHANNELS.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}</select></div>
                <div style={{ flex: 1, minWidth: 140 }}><label className="field-label" htmlFor="f-source">Source note</label><input id="f-source" name="source" defaultValue={deal.source ?? ""} placeholder="e.g. cold email" style={{ width: "100%" }} /></div>
              </div>
              <button style={{ alignSelf: "flex-start" }}>Save changes</button>
            </ToastForm>
            <p className="muted" style={{ marginTop: 10 }}>Created {dateOnly(deal.created_at)} · last change {ago(deal.updated_at)}</p>
          </section>

          <section className="card">
            <h2>Stage history</h2>
            <ul>{history.map((h: any, i: number) => (
              <li key={i} className="row-between">
                <span>{h.from_stage ? <>{stageLabel(h.from_stage)} → <b>{stageLabel(h.to_stage)}</b></> : <>{h.source === "backfill" ? "Recorded at" : "Created as"} <b>{stageLabel(h.to_stage)}</b></>}</span>
                <span className="muted" title={when(h.changed_at)}>{h.source === "backfill" ? "start date unknown" : when(h.changed_at)}</span>
              </li>
            ))}</ul>
            {history.some((h: any) => h.source === "backfill") && <p className="muted" style={{ marginTop: 8 }}>This deal existed before stage history was switched on, so earlier moves aren&apos;t known. Every move from now on is timed.</p>}
          </section>

          <section className="card">
            <h2>Activity</h2>
            {activity.length === 0 ? <EmptyState title="Nothing yet">Notes, emails and stage changes appear here.</EmptyState> : (
              <ul className="timeline">{activity.map((a: any) => (
                <li key={a.id}>
                  <span className="tl-dot"><ActivityIcon type={a.type} /></span>
                  <div><div className="tl-title">{activityLabel(a.type)}</div>{a.body && <div className="muted">{a.body}</div>}<div className="tl-time" title={when(a.occurred_at)}>{ago(a.occurred_at)}</div></div>
                </li>
              ))}</ul>
            )}
          </section>
        </div>

        <div className="stack">
          <section className="card">
            <h2>Company</h2>
            {deal.company_id ? (
              <div className="stack" style={{ gap: 6 }}>
                <div className="row-between"><b><Link href={`/companies/${deal.company_id}`}>{deal.company_name}</Link></b><Badge value={deal.company_status} /></div>
                {deal.domain && <a href={`https://${deal.domain}`} target="_blank" rel="noreferrer" className="row muted" style={{ gap: 6 }}><Globe size={14} aria-hidden />{deal.domain}</a>}
                {deal.generic_email && <span className="row muted" style={{ gap: 6 }}><Mail size={14} aria-hidden />{deal.generic_email}</span>}
              </div>
            ) : <p className="muted">No company linked.</p>}
            {contact[0] && <p style={{ marginTop: 10 }}><b>{contact[0].name}</b> <span className="muted">{[contact[0].role, contact[0].email, contact[0].phone].filter(Boolean).join(" · ")}</span></p>}
          </section>

          <section className="card">
            <h2>Tasks</h2>
            {tasks.length === 0 && <p className="muted">No open tasks.</p>}
            <ul>{tasks.map((t: any) => (
              <li key={t.id} className="row">
                <ToastForm action={completeTask} success="Task done">
                  <input type="hidden" name="task_id" value={t.id} />
                  <button className="link" aria-label={`Mark done: ${t.title}`}><Check size={16} /></button>
                </ToastForm>
                <span style={{ flex: 1 }}>{t.title}</span>{t.due_at && <span className="muted">{when(t.due_at)}</span>}
              </li>
            ))}</ul>
            <ToastForm action={addDealTask} success="Task added" reset className="row" style={{ marginTop: 10 }}>
              <input type="hidden" name="deal_id" value={id} />
              <input name="title" placeholder="Add a task…" aria-label="New task" required style={{ flex: 1, minWidth: 120 }} />
              <input name="due" type="date" aria-label="Due" />
              <button className="secondary">Add</button>
            </ToastForm>
          </section>

          <section className="card">
            <h2>Quick note</h2>
            <ToastForm action={logDealNote} success="Note saved" reset className="stack" style={{ gap: 8 }}>
              <input type="hidden" name="deal_id" value={id} />
              <textarea name="body" rows={3} placeholder="What happened? Saved to the activity log." aria-label="Note" required />
              <button className="secondary" style={{ alignSelf: "flex-start" }}>Save note</button>
            </ToastForm>
          </section>

          <section className="card">
            <div className="row-between"><h2 style={{ margin: 0 }}>Quotes</h2><Link href={`/quotes/new?deal=${id}`} className="muted">Create</Link></div>
            {quotes.length === 0 ? <p className="muted" style={{ marginTop: 8 }}>No quotes yet.</p> : (
              <ul style={{ marginTop: 8 }}>{quotes.map((q: any) => (
                <li key={q.id} className="row-between"><Link href={`/quotes/${q.id}`}>Quote #{q.id}</Link><span className="row"><span className="muted">{gbp(q.total_setup_gbp)} + {gbp(q.total_monthly_gbp)}/mo</span><Badge value={q.status} /></span></li>
              ))}</ul>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
