import Link from "next/link";
import ToastForm from "@/components/ToastForm";
import { notFound } from "next/navigation";
import { Check, Globe, Mail, MapPin, Phone } from "lucide-react";
import { query } from "@/lib/db";
import { addContact, addDeal, addTask, completeTask, findEmailAction, findWebsiteOneAction, logContact, saveNotes, setWebsite } from "@/lib/actions";
import { googleSearchUrl } from "@/lib/websites";
import { outreachDrafts } from "@/lib/outreach";
import { gbp } from "@/lib/quote";
import { ago, dateOnly, when } from "@/lib/format";
import ActionForm from "@/components/ActionForm";
import OutreachDraft from "@/components/OutreachDraft";
import InstagramDm from "@/components/InstagramDm";
import ComplianceCard from "@/components/ComplianceCard";
import OfferSuggestionCard from "@/components/OfferSuggestionCard";
import DecisionMakers from "@/components/DecisionMakers";
import { apolloStatusAction, contactClearOptOutAction, contactOptOutAction } from "@/lib/apolloActions";
import { loadGate } from "@/lib/complianceGate";
import StatusStepper from "@/components/StatusStepper";
import ContactDetailsForm from "@/components/ContactDetailsForm";
import AuditsCard from "@/components/AuditsCard";
import CallsCard from "@/components/CallsCard";
import { creditUsage } from "@/lib/usage";
import { nextStep } from "@/lib/nextStep";
import { fitTier, shortMoney } from "@/lib/leadConfig";
import { ActivityIcon, activityLabel } from "@/components/activity";
import { Badge, EmptyState, PageHeader, StageBadge } from "@/components/ui";

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
  const usage = await creditUsage();
  const gate = await loadGate(id);
  if (!gate) notFound();
  const blocker = gate.sendable ? null : gate.reasons.join(" ");
  const apollo = await apolloStatusAction(id);
  const recipients = await query<any>(`SELECT ct.id, ct.name, ct.role, ct.email FROM contacts ct JOIN contact_gate cg ON cg.contact_id = ct.id WHERE ct.company_id = $1 AND cg.sendable ORDER BY ct.name`, [id]);

  const followUp = tasks.find((t: any) => /follow-up/i.test(t.title));
  const next = nextStep({ ...company, gate: { sendable: gate.sendable, unchecked: company.compliance_status === "unchecked", reasons: gate.reasons }, followup_due: followUp?.due_at ?? null });

  return (
    <>
      <PageHeader
        back={{ href: "/companies", label: "Companies" }}
        title={company.name}
        description={
          <span className="row" style={{ gap: 10 }}>
            <Badge value={company.status} />
            {company.niche && <span>{company.niche}</span>}
            {!gate.sendable && <Badge value={company.opted_out ? "Opted out" : company.compliance_status === "unchecked" ? "Not verified" : "Blocked"} />}
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
          <OfferSuggestionCard companyId={id} name={company.name} />
          <ComplianceCard company={company} gate={gate} />
          <details className="card" id="website" open={!(company.generic_email || company.linkedin_url || company.instagram_url || company.facebook_url || company.contact_url)}>
            <summary>Contact details{(company.generic_email || company.linkedin_url || company.instagram_url || company.facebook_url || company.contact_url) ? <span className="muted" style={{ fontWeight: 400 }}> · {[company.domain && "website", company.generic_email && "email", company.linkedin_url && "LinkedIn", company.instagram_url && "Instagram", company.facebook_url && "Facebook", company.contact_url && "contact page"].filter(Boolean).join(", ")}</span> : <span className="muted" style={{ fontWeight: 400 }}> · no way to reach them yet</span>}</summary>
            <div style={{ marginTop: 14 }}>
              <ContactDetailsForm
                key={[company.domain, company.generic_email, company.phone, company.linkedin_url, company.instagram_url, company.facebook_url, company.contact_url].join("|")}
                company={{ id, name: company.name, postcode: company.postcode, company_number: company.company_number, domain: company.domain, generic_email: company.generic_email, phone: company.phone,
                  linkedin_url: company.linkedin_url, instagram_url: company.instagram_url, facebook_url: company.facebook_url, contact_url: company.contact_url,
                  domain_verified: company.domain_verified, site_signals: company.site_signals }}
                usage={usage}
              />
            </div>
          </details>

          <section className="card">
            <h2>Log activity</h2>
            <ToastForm action={logContact} success="Activity logged" reset className="row">
              <input type="hidden" name="company_id" value={id} />
              <select name="type" aria-label="Type"><option value="email">Email</option><option value="dm">DM</option><option value="call">Call</option><option value="note">Note</option></select>
              <input name="body" placeholder="What happened?" aria-label="What happened" style={{ flex: 1, minWidth: 200 }} />
              <button>Log</button>
            </ToastForm>
          </section>

          <details className="card" id="decision-makers">
            <summary>Decision-makers (Apollo) <span className="badge tone-warn" style={{ marginLeft: 6 }}>emails use credits</span>{apollo.saved > 0 && <span className="muted" style={{ fontWeight: 400 }}> · {apollo.saved} saved</span>}</summary>
            <div style={{ marginTop: 14 }}><DecisionMakers companyId={id} status={apollo} /></div>
          </details>
          <details className="card" id="outreach" open={!!(company.generic_email || company.linkedin_url || company.instagram_url || company.facebook_url || company.contact_url) && !blocker}>
            <summary>Outreach email{!company.generic_email && <span className="muted" style={{ fontWeight: 400 }}> · available once the company has an email, company page or contact form</span>}</summary>
            <div style={{ marginTop: 14 }}>
              <OutreachDraft companyId={id} to={company.generic_email} recipients={recipients.map((r: any) => ({ id: Number(r.id), name: r.name, role: r.role, email: r.email }))} first={drafts.first} followUp={drafts.followUp} social={drafts.social} blocker={blocker}
                routes={[company.linkedin_url && { label: "LinkedIn page", href: company.linkedin_url }, company.instagram_url && { label: "Instagram", href: company.instagram_url }, company.facebook_url && { label: "Facebook page", href: company.facebook_url }, company.contact_url && { label: "Contact form", href: company.contact_url }].filter(Boolean) as { label: string; href: string }[]} />
              {company.instagram_url && !blocker && <InstagramDm companyId={id} instagramUrl={company.instagram_url} cap={Number(process.env.DM_DAILY_CAP ?? 30) || 30} />}
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
          <section className="card" id="filings">
            <h2>Companies House check</h2>
            {!company.ch_checked_at ? (
              <p className="muted">Not checked yet. Run <code>uv run python -m agency.ch_health</code>.</p>
            ) : (
              <div className="stack" style={{ gap: 10 }}>
                <div className="row-between">
                  <span className="row" style={{ gap: 8 }}>
                    <span className={`badge tone-${company.filing_ok ? "good" : "bad"}`}>{company.filing_ok ? "Filings up to date" : "Filing problems"}</span>
                    {(() => { const t = fitTier(company.fit_score, company.filing_ok); return <span className={`badge tone-${t.tone}`} title={t.title}>Fit {t.label}</span>; })()}
                  </span>
                  <span className="muted">checked {ago(company.ch_checked_at)}</span>
                </div>
                <dl className="facts">
                  <div><dt>Confirmation statement</dt><dd className={company.confirmation_overdue ? "error" : ""}>{company.confirmation_overdue ? "Overdue" : "Up to date"}{company.confirmation_next_due && ` · next due ${dateOnly(company.confirmation_next_due)}`}</dd></div>
                  <div><dt>Accounts</dt><dd className={company.accounts_overdue ? "error" : ""}>{company.accounts_overdue ? "Overdue" : "Up to date"}{company.accounts_type && ` · ${company.accounts_type}`}{company.accounts_next_due && ` · next due ${dateOnly(company.accounts_next_due)}`}</dd></div>
                  {company.ch_status_detail && <div><dt>Status note</dt><dd className="error">{company.ch_status_detail}</dd></div>}
                  <div><dt>Employees</dt><dd>{company.employees ?? "Not stated"}</dd></div>
                  <div><dt>Turnover</dt><dd>{company.turnover_gbp !== null ? shortMoney(Number(company.turnover_gbp)) : "Not filed"}</dd></div>
                  <div><dt>Net assets</dt><dd>{company.net_assets_gbp !== null ? shortMoney(Number(company.net_assets_gbp)) : "Not stated"}</dd></div>
                  <div><dt>Est. revenue</dt><dd>{company.est_revenue_gbp ? `≈ ${shortMoney(Number(company.est_revenue_gbp))}` : "Unknown"}{company.est_revenue_basis && <span className="muted"> · {company.est_revenue_basis.replace(/GBP /g, "£")}</span>}</dd></div>
                </dl>
                {company.fit_notes && <p className="muted" style={{ margin: 0 }}>{company.fit_notes.replace(/GBP /g, "£")}</p>}
                <p className="muted" style={{ margin: 0 }}>Revenue is an estimate: most small companies don&apos;t file turnover. Treat it as a ranking aid.</p>
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

          <CallsCard companyId={id} />

          <AuditsCard companyId={id} withDocuments />

          <section className="card" id="deals">
            <h2>Deals</h2>
            {deals.length === 0 && <p className="muted">No deals yet.</p>}
            <ul>{deals.map((d: any) => (
              <li key={d.id}>
                <div className="row-between"><b><Link href={`/deals/${d.id}`}>{d.title}</Link></b><StageBadge stage={d.stage} /></div>
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
              <li key={c.id} className="stack" style={{ gap: 4 }}>
                <div className="row-between"><span><b>{c.name}</b> {c.opted_out && <Badge value="Opted out" />} {c.source === "Apollo" && <span className="badge tone-neutral">Apollo</span>} <span className="muted">{[c.role, c.email, c.email_status, c.phone].filter(Boolean).join(" · ")}</span></span>
                  {c.opted_out
                    ? <ToastForm action={contactClearOptOutAction} success="Opt-out cleared" confirm="Only clear this if it was recorded by mistake. Clear it?"><input type="hidden" name="id" value={c.id} /><button className="link">Recorded by mistake?</button></ToastForm>
                    : <ToastForm action={contactOptOutAction} success="Marked as opted out and suppressed" confirm={`Mark ${c.name} as opted out? They will be blocked everywhere and their address added to the suppression list.`}><input type="hidden" name="id" value={c.id} /><button className="link">They opted out</button></ToastForm>}</div>
                <span className="muted">via {c.consent_basis}</span>
              </li>
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
