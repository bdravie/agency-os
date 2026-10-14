import Link from "next/link";
import { notFound } from "next/navigation";
import { query } from "@/lib/db";
import { addContact, addDeal, addTask, completeTask, findEmailAction, logContact, saveNotes, setWebsite } from "@/lib/actions";
import { googleSearchUrl } from "@/lib/websites";
import ActionForm from "@/components/ActionForm";

export const dynamic = "force-dynamic";

const when = (d: Date | string) => new Date(d).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
const gbp = (n: number | string) => `£${Number(n).toLocaleString("en-GB")}`;

export default async function CompanyPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const [company] = await query<any>(`SELECT * FROM companies WHERE id = $1`, [id]);
  if (!company) notFound();
  const [contacts, deals, tasks, activity] = await Promise.all([
    query<any>(`SELECT * FROM contacts WHERE company_id = $1 ORDER BY created_at`, [id]),
    query<any>(`SELECT * FROM deals WHERE company_id = $1 ORDER BY created_at DESC`, [id]),
    query<any>(`SELECT * FROM tasks WHERE company_id = $1 AND done_at IS NULL ORDER BY due_at NULLS LAST`, [id]),
    query<any>(`SELECT * FROM activities WHERE company_id = $1 ORDER BY occurred_at DESC LIMIT 50`, [id]),
  ]);

  return (
    <>
      <p><Link href="/companies">← Companies</Link></p>
      <h1>{company.name}</h1>
      <p className="muted">
        {[company.domain, company.generic_email, company.phone, company.postcode, company.niche, company.is_ltd === false ? "not a limited company" : null].filter(Boolean).join(" · ")}
      </p>

      <div className="grid">
        <section className="card">
          <h2>Website &amp; email</h2>
          {!company.domain && (
            <p><a href={googleSearchUrl(company.name, company.postcode)} target="_blank" rel="noreferrer">Search Google for this company ↗</a></p>
          )}
          <ActionForm action={setWebsite} label="Save" busyLabel="Saving…">
            <input type="hidden" name="company_id" value={id} />
            <input name="domain" defaultValue={company.domain ?? ""} placeholder="Website, e.g. acme.co.uk" />
            <input name="generic_email" defaultValue={company.generic_email ?? ""} placeholder="Generic email (info@, hello@…)" />
          </ActionForm>
          {company.domain && !company.generic_email && (
            <div style={{ marginTop: 8 }}>
              <ActionForm action={findEmailAction} label="Find generic email" busyLabel="Checking the site…">
                <input type="hidden" name="company_id" value={id} />
              </ActionForm>
            </div>
          )}
        </section>

        <section className="card">
          <h2>Log activity</h2>
          <form action={logContact} style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input type="hidden" name="company_id" value={id} />
            <select name="type"><option value="email">Email</option><option value="dm">DM</option><option value="call">Call</option><option value="note">Note</option></select>
            <input name="body" placeholder="What happened?" style={{ flex: 1 }} />
            <button>Log</button>
          </form>
        </section>

        <section className="card">
          <h2>Notes & status</h2>
          <form action={saveNotes} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <input type="hidden" name="company_id" value={id} />
            <textarea name="notes" rows={3} defaultValue={company.owner_notes ?? ""} />
            <select name="status" defaultValue={company.status}>
              {["New", "Contacted", "Replied", "Client", "Not a fit"].map((s) => <option key={s}>{s}</option>)}
            </select>
            <button>Save</button>
          </form>
        </section>

        <section className="card">
          <h2>Contacts</h2>
          <ul>{contacts.map((c: any) => <li key={c.id}>{c.name} <span className="muted">{[c.role, c.email, c.phone, `via ${c.consent_basis}`].filter(Boolean).join(" · ")}</span></li>)}</ul>
          <details><summary>Add contact</summary>
            <form action={addContact} style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
              <input type="hidden" name="company_id" value={id} />
              <input name="name" placeholder="Name" required />
              <input name="role" placeholder="Role" />
              <input name="email" type="email" placeholder="Email" />
              <input name="phone" placeholder="Phone" />
              <select name="consent_basis" required defaultValue="">
                <option value="" disabled>How did they engage?</option>
                {["form", "booking", "replied", "messaged", "client"].map((c) => <option key={c}>{c}</option>)}
              </select>
              <button>Add</button>
            </form>
          </details>
        </section>

        <section className="card">
          <h2>Deals</h2>
          <ul>{deals.map((d: any) => <li key={d.id}>{d.title} <span className="muted">{d.stage} · {gbp(d.setup_value_gbp)} setup · {gbp(d.monthly_value_gbp)}/mo</span></li>)}</ul>
          <details><summary>Add deal</summary>
            <form action={addDeal} style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
              <input type="hidden" name="company_id" value={id} />
              <input name="title" placeholder="Deal title" required />
              <input name="setup" type="number" min="0" step="1" placeholder="Setup £" />
              <input name="monthly" type="number" min="0" step="1" placeholder="Monthly £" />
              <button>Add</button>
            </form>
          </details>
        </section>

        <section className="card">
          <h2>Tasks</h2>
          <ul>{tasks.map((t: any) => (
            <li key={t.id}>
              <form action={completeTask} style={{ display: "inline" }}>
                <input type="hidden" name="task_id" value={t.id} />
                <button className="link" title="Mark done">☐</button>
              </form> {t.title} {t.due_at && <span className="muted">due {when(t.due_at)}</span>}
            </li>
          ))}</ul>
          <form action={addTask} style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <input type="hidden" name="company_id" value={id} />
            <input name="title" placeholder="New task" required style={{ flex: 1 }} />
            <input name="due" type="datetime-local" />
            <button>Add</button>
          </form>
        </section>

        <section className="card wide">
          <h2>Activity timeline</h2>
          <ul>{activity.map((a: any) => (
            <li key={a.id}><b>{a.type}</b> {a.body && `– ${a.body}`} <span className="muted">{when(a.occurred_at)}</span></li>
          ))}</ul>
          {activity.length === 0 && <p className="muted">No activity yet.</p>}
        </section>
      </div>
    </>
  );
}
