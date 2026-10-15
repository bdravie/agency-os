import Link from "next/link";
import ToastForm from "@/components/ToastForm";
import { notFound } from "next/navigation";
import { Check, Globe, Mail, MapPin, Phone } from "lucide-react";
import { query } from "@/lib/db";
import { addContact, addDeal, addTask, completeTask, findEmailAction, findWebsiteOneAction, logContact, saveNotes, setWebsite } from "@/lib/actions";
import { googleSearchUrl } from "@/lib/websites";
import { outreachDrafts } from "@/lib/outreach";
import { gbp } from "@/lib/quote";
import { ago, when } from "@/lib/format";
import ActionForm from "@/components/ActionForm";
import OutreachDraft from "@/components/OutreachDraft";
import StatusStepper from "@/components/StatusStepper";
import { nextStep } from "@/lib/nextStep";
import { ActivityIcon, activityLabel } from "@/components/activity";
import { Badge, EmptyState, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function CompanyPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const [company] = await query<any>(`SELECT * FROM companies WHERE id = $1`, [id]);
  if (!company) notFound();
  const [contacts, deals, tasks, activity] = await Promise.all([
    query<any>(`SELECT * FROM contacts WHERE company_id = $1 ORDER BY created_at`, [id]),
    query<any>(`SELECT * FROM deals WHERE company_id = $1 ORDER BY created_at DESC`, [id]),
    query<any>(`SELECT * FROM tasks WHERE company_id = $1 AND done_at IS NULL ORDER BY due_at NULLS LAST`, [id]),
    query<any>(`SELECT * FROM activities WHERE company_id = $1 AND type <> 'places_lookup' ORDER BY occurred_at DESC LIMIT 50`, [id]),
  ]);
  const drafts = await outreachDrafts(company.name);
  const [suppressed] = await query<any>(
    `SELECT 1 FROM suppression WHERE ($1::text IS NOT NULL AND lower(domain) = lower($1)) OR ($2::text IS NOT NULL AND lower(email) = lower($2))`,
    [company.domain, company.generic_email]);
  const blocker = company.is_ltd === false ? "Outreach is for limited companies only." : suppressed ? "This company is on your suppression list." : null;

  const followUp = tasks.find((t: any) => /follow-up/i.test(t.title));
  const next = nextStep({ ...company, suppressed: !!suppressed, followup_due: followUp?.due_at ?? null });

  return (
    <>
      <PageHeader
        back={{ href: "/companies", label: "Companies" }}
        title={company.name}
        description={
          <span className="row" style={{ gap: 10 }}>
            <Badge value={company.status} />
            {company.niche && <span>{company.niche}</span>}
            {company.is_ltd === false && <Badge value="Not a limited company" />}
            {company.domain && <a href={`https://${company.domain}`} target="_blank" rel="noreferrer" className="row" style={{ gap: 4 }}><Globe size={14} aria-hidden />{company.domain}</a>}
            {company.generic_email && <span className="row" style={{ gap: 4 }}><Mail size={14} aria-hidden />{company.generic_email}</span>}
            {company.phone && <span className="row" style={{ gap: 4 }}><Phone size={14} aria-hidden />{company.phone}</span>}
            {company.postcode && <span className="row" style={{ gap: 4 }}><MapPin size={14} aria-hidden />{company.postcode}</span>}
          </span>
        }
      />

      <StatusStepper companyId={id} status={company.status} />

      <div className="split">
        <div className="stack">
          <div className={`next${next.warn ? " warn" : ""}`} role="note">
            <div>
              <div className="next-label">Next step</div>
              <b>{next.text}</b>
              {next.href && <a href={next.href}>{next.href.startsWith("/") ? "Open" : "Take me there"} →</a>}
            </div>
          </div>
          <section className="card">
            <h2>Log activity</h2>
            <ToastForm action={logContact} success="Activity logged" reset className="row">
              <input type="hidden" name="company_id" value={id} />
              <select name="type" aria-label="Type"><option value="email">Email</option><option value="dm">DM</option><option value="call">Call</option><option value="note">Note</option></select>
              <input name="body" placeholder="What happened?" aria-label="What happened" style={{ flex: 1, minWidth: 200 }} />
              <button>Log</button>
            </ToastForm>
          </section>

          <details className="card" id="outreach" open={!!company.generic_email && !blocker}>
            <summary>Outreach email{!company.generic_email && <span className="muted" style={{ fontWeight: 400 }}> · available once the company has a generic email</span>}</summary>
            <div style={{ marginTop: 14 }}>
              <OutreachDraft companyId={id} to={company.generic_email} first={drafts.first} followUp={drafts.followUp} blocker={blocker} />
            </div>
          </details>

          <section className="card">
            <h2>Activity</h2>
            {activity.length === 0 ? <EmptyState title="No activity yet">Log a call or email above, or mark an outreach email as sent.</EmptyState> : (
              <ul className="timeline">{activity.map((a: any) => (
                <li key={a.id}>
                  <span className="tl-dot"><ActivityIcon type={a.type} /></span>
                  <div>
                    <div className="tl-title">{activityLabel(a.type)}</div>
                    {a.body && a.body !== company.name && <div className="muted">{a.body}</div>}
                    <div className="tl-time" title={when(a.occurred_at)}>{ago(a.occurred_at)}</div>
                  </div>
                </li>
              ))}</ul>
            )}
          </section>
        </div>

        <div className="stack">
          <section className="card" id="website">
            <h2>Website &amp; email</h2>
            {!company.domain && (
              <div className="stack" style={{ gap: 8, marginBottom: 12 }}>
                <ActionForm action={findWebsiteOneAction} label="Find website automatically" busyLabel="Searching Google…">
                  <input type="hidden" name="company_id" value={id} />
                </ActionForm>
                <a href={googleSearchUrl(company.name, company.postcode)} target="_blank" rel="noreferrer" className="muted">Or search Google yourself ↗</a>
              </div>
            )}
            <ActionForm action={setWebsite} label="Save" busyLabel="Saving…" secondary>
              <input type="hidden" name="company_id" value={id} />
              <input name="domain" defaultValue={company.domain ?? ""} placeholder="Website, e.g. acme.co.uk" aria-label="Website" />
              <input name="generic_email" defaultValue={company.generic_email ?? ""} placeholder="Generic email (info@, hello@…)" aria-label="Generic email" />
            </ActionForm>
            {company.domain && !company.generic_email && (
              <div style={{ marginTop: 10 }}>
                <ActionForm action={findEmailAction} label="Find generic email" busyLabel="Checking the site…" secondary>
                  <input type="hidden" name="company_id" value={id} />
                </ActionForm>
              </div>
            )}
          </section>

          <section className="card">
            <h2>Notes</h2>
            <ToastForm action={saveNotes} success="Notes saved" className="stack" style={{ gap: 8 }}>
              <input type="hidden" name="company_id" value={id} />
              <textarea name="notes" rows={4} defaultValue={company.owner_notes ?? ""} placeholder="Anything worth remembering" aria-label="Notes" />
              <button className="secondary">Save</button>
            </ToastForm>
          </section>

          <section className="card" id="deals">
            <h2>Deals</h2>
            {deals.length === 0 && <p className="muted">No deals yet.</p>}
            <ul>{deals.map((d: any) => (
              <li key={d.id}>
                <div className="row-between"><b>{d.title}</b><Badge value={d.stage} /></div>
                <div className="row-between"><span className="muted">{gbp(d.setup_value_gbp)} setup · {gbp(d.monthly_value_gbp)}/mo</span><Link href={`/quotes/new?deal=${d.id}`}>Create quote</Link></div>
              </li>
            ))}</ul>
            <details style={{ marginTop: 10 }}><summary>Add a deal</summary>
              <ToastForm action={addDeal} success="Deal added" reset className="stack" style={{ gap: 8, marginTop: 10 }}>
                <input type="hidden" name="company_id" value={id} />
                <input name="title" placeholder="Deal title" required aria-label="Deal title" />
                <div className="row"><input name="setup" type="number" min="0" step="1" placeholder="Setup £" aria-label="Setup" style={{ width: 110 }} /><input name="monthly" type="number" min="0" step="1" placeholder="Monthly £" aria-label="Monthly" style={{ width: 110 }} /></div>
                <button className="secondary">Add deal</button>
              </ToastForm>
            </details>
          </section>

          <section className="card">
            <h2>Contacts</h2>
            {contacts.length === 0 && <p className="muted">No named contacts. Add one only after they have engaged.</p>}
            <ul>{contacts.map((c: any) => (
              <li key={c.id}><b>{c.name}</b> <span className="muted">{[c.role, c.email, c.phone].filter(Boolean).join(" · ")}</span><br /><span className="muted">via {c.consent_basis}</span></li>
            ))}</ul>
            <details style={{ marginTop: 10 }}><summary>Add a contact</summary>
              <ToastForm action={addContact} success="Contact added" reset className="stack" style={{ gap: 8, marginTop: 10 }}>
                <input type="hidden" name="company_id" value={id} />
                <input name="name" placeholder="Name" required aria-label="Name" />
                <input name="role" placeholder="Role" aria-label="Role" />
                <input name="email" type="email" placeholder="Email" aria-label="Email" />
                <input name="phone" placeholder="Phone" aria-label="Phone" />
                <select name="consent_basis" required defaultValue="" aria-label="How did they engage?">
                  <option value="" disabled>How did they engage?</option>
                  {["form", "booking", "replied", "messaged", "client"].map((c) => <option key={c}>{c}</option>)}
                </select>
                <button className="secondary">Add contact</button>
              </ToastForm>
            </details>
          </section>

          <section className="card">
            <h2>Tasks</h2>
            {tasks.length === 0 && <p className="muted">No open tasks.</p>}
            <ul>{tasks.map((t: any) => (
              <li key={t.id} className="row">
                <ToastForm action={completeTask} success="Task done">
                  <input type="hidden" name="task_id" value={t.id} />
                  <button className="link" title="Mark done" aria-label={`Mark done: ${t.title}`}><Check size={16} /></button>
                </ToastForm>
                <span style={{ flex: 1 }}>{t.title}</span>
                {t.due_at && <span className="muted">{when(t.due_at)}</span>}
              </li>
            ))}</ul>
            <ToastForm action={addTask} success="Task added" reset className="row" style={{ marginTop: 10 }}>
              <input type="hidden" name="company_id" value={id} />
              <input name="title" placeholder="New task" required aria-label="New task" style={{ flex: 1, minWidth: 120 }} />
              <input name="due" type="datetime-local" aria-label="Due" />
              <button className="secondary">Add</button>
            </ToastForm>
          </section>
        </div>
      </div>
    </>
  );
}
