import Link from "next/link";
import { notFound } from "next/navigation";
import { query } from "@/lib/db";
import { acceptQuote, setQuoteStatus } from "@/lib/actions";
import { TERMS, gbp, totals, type LineItem } from "@/lib/quote";
import PrintButton from "@/components/PrintButton";

export const dynamic = "force-dynamic";

export default async function QuotePage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const [q] = await query<any>(
    `SELECT q.*, d.title, d.company_id, c.name AS company FROM quotes q
       LEFT JOIN deals d ON d.id = q.deal_id LEFT JOIN companies c ON c.id = d.company_id WHERE q.id = $1`, [id]);
  if (!q) notFound();
  const items = q.line_items as LineItem[];
  const t = totals(items, Number(q.discount_gbp));
  const brand = process.env.BUSINESS_NAME ?? "Your Agency";

  return (
    <>
      <div className="noprint" style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 16, flexWrap: "wrap" }}>
        <Link href="/quotes">← Quotes</Link>
        <span className="muted">Status: <b>{q.status}</b></span>
        <PrintButton />
        <a href={`/quotes/${id}/pdf`}><button type="button">Download PDF</button></a>
        {q.status === "Accepted" ? (
          <span>Accepted {q.accepted_at && new Date(q.accepted_at).toLocaleDateString("en-GB", { dateStyle: "medium" })} · <Link href="/clients">See Clients</Link></span>
        ) : (
          <>
            <form action={setQuoteStatus} style={{ display: "flex", gap: 6 }}>
              <input type="hidden" name="id" value={id} />
              <select name="status" defaultValue={q.status}>
                <option>Draft</option><option>Sent</option><option>Declined</option>
              </select>
              <button>Update status</button>
            </form>
            <form action={acceptQuote}>
              <input type="hidden" name="id" value={id} />
              <button title="Moves the deal to Won and creates the client">Mark as accepted</button>
            </form>
          </>
        )}
      </div>

      <article className="card quote">
        <header style={{ borderBottom: "3px solid var(--accent)", paddingBottom: 12, marginBottom: 16 }}>
          <div className="muted">{brand}</div>
          <h1 style={{ margin: 0 }}>Quote #{q.id}</h1>
          <div className="muted">Prepared for {q.company} · {new Date(q.created_at).toLocaleDateString("en-GB", { dateStyle: "long" })}
            {q.valid_until && ` · valid until ${new Date(q.valid_until).toLocaleDateString("en-GB", { dateStyle: "long" })}`}</div>
        </header>
        {q.scope && <><h2>Scope</h2><p style={{ whiteSpace: "pre-wrap" }}>{q.scope}</p></>}
        {q.timeline && <><h2>Timeline</h2><p>{q.timeline}</p></>}
        <h2>What's included</h2>
        <table>
          <thead><tr><th>Service</th><th style={{ textAlign: "right" }}>Setup</th><th style={{ textAlign: "right" }}>Monthly</th></tr></thead>
          <tbody>{items.map((i) => (
            <tr key={i.offer_id}><td><b>{i.name}</b><br /><span className="muted">{i.outcome}</span></td>
              <td style={{ textAlign: "right" }}>{gbp(i.setup_gbp)}</td><td style={{ textAlign: "right" }}>{gbp(i.monthly_gbp)}</td></tr>
          ))}</tbody>
        </table>
        <div style={{ textAlign: "right", marginTop: 12, lineHeight: 1.8 }}>
          {Number(q.discount_gbp) > 0 && <div className="muted">Setup before discount {gbp(t.setupBefore)} · Discount −{gbp(q.discount_gbp)}</div>}
          <div><b>Setup fee {gbp(t.setup)}</b></div>
          <div className="muted">{gbp(t.deposit)} due upfront · {gbp(t.balance)} due on go-live</div>
          <div><b>Monthly fee {gbp(t.monthly)}</b></div>
        </div>
        <h2>Terms</h2>
        <ul>{TERMS.map((x) => <li key={x}>{x}</li>)}</ul>
      </article>
    </>
  );
}
