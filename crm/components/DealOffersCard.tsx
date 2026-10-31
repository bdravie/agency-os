import { query } from "@/lib/db";
import { removeDealOffer, updateDealOffer } from "@/lib/offerActions";
import { loadBuilderCatalogue } from "@/lib/dealBuilderData";
import DealBuilder from "./DealBuilder";
import { billingShort, lineNet, maxCredit, progress, rangeState, totals, type CheckItem } from "@/lib/dealOffers";
import { gbp } from "@/lib/quote";
import ChecklistToggle from "./ChecklistToggle";
import ToastForm from "./ToastForm";
import { EmptyState } from "./ui";
import { Package } from "lucide-react";

// The offers a deal carries: each line has its own agreed price, a checklist, and (for a build) an optional audit credit.
export default async function DealOffersCard({ dealId }: { dealId: number }) {
  const [lines, catalogue] = await Promise.all([
    query<any>(
      `SELECT l.id, l.billing, l.price_gbp::float AS price, l.credit_gbp::float AS credit, l.credit_from_id, l.duration_days, l.status, l.checklist,
              COALESCE(o.name, l.custom_name) AS name, l.offer_id, l.bundle_name, o.price_min_gbp::float AS min, o.price_max_gbp::float AS max
         FROM deal_offers l LEFT JOIN offers o ON o.id = l.offer_id WHERE l.deal_id = $1 ORDER BY l.id`, [dealId]),
    loadBuilderCatalogue(),
  ]);
  const t = totals(lines.map((l: any) => ({ billing: l.billing, price: l.price, credit: l.credit })));

  return (
    <section className="card" id="offers">
      <h2 style={{ margin: 0 }}>Offers &amp; fees</h2>
      <details style={{ marginTop: 10 }} open={lines.length === 0}>
        <summary>Add packages or services</summary>
        <div style={{ marginTop: 10 }}><DealBuilder dealId={dealId} packages={catalogue.packages} services={catalogue.services} /></div>
      </details>

      {lines.length === 0 ? (
        <EmptyState title="No offers on this deal yet" icon={<Package size={22} />}>Add a package (for example SEO or Website), a single service, or a custom service. Their prices set the deal&apos;s one-off and monthly values.</EmptyState>
      ) : (
        <>
          <div className="fees" aria-label="Deal totals">
            <div><span className="muted">One-off</span><b>{gbp(t.oneOff)}</b></div>
            <div><span className="muted">Monthly</span><b>{gbp(t.monthly)}<span className="muted">/mo</span></b></div>
            {t.credit > 0 && <div><span className="muted">Credit applied</span><b>{gbp(t.credit)}</b></div>}
          </div>
          <div className="stack" style={{ gap: 14, marginTop: 14 }}>
            {lines.map((l: any) => {
              const checklist = l.checklist as CheckItem[];
              const pr = progress(checklist);
              const range = rangeState(l.price, l.min, l.max);
              const sources = lines.filter((x: any) => x.id !== l.id && x.billing !== "monthly");
              const source = sources.find((x: any) => x.id === l.credit_from_id);
              return (
                <div key={l.id} className="offer-line">
                  <div className="row-between">
                    <span className="row" style={{ gap: 8 }}><b>{l.name}</b><span className="badge tone-neutral">{billingShort(l.billing)}</span>{l.offer_id === null && <span className="badge tone-neutral">Custom</span>}{l.bundle_name && <span className="muted">{l.bundle_name}</span>}</span>
                    <span className="muted">{pr.total ? `${pr.done}/${pr.total} delivered` : "no checklist"}</span>
                  </div>
                  <ToastForm key={`${l.id}:${l.price}:${l.duration_days}:${l.status}:${l.credit_from_id}:${l.credit}`} action={updateDealOffer} success="Saved" className="line-form">
                    <input type="hidden" name="id" value={l.id} />
                    <label>{l.billing === "monthly" ? "Monthly fee £" : "Price £"}<input name="price" type="number" min="0" step="1" defaultValue={l.price} /></label>
                    <label>Days<input name="duration" type="number" min="1" step="1" defaultValue={l.duration_days ?? ""} style={{ width: 80 }} /></label>
                    <label>Status
                      <select name="status" defaultValue={l.status}><option value="planned">Planned</option><option value="in_progress">In progress</option><option value="delivered">Delivered</option></select>
                    </label>
                    {l.billing !== "monthly" && sources.length > 0 && (
                      <>
                        <label>Credit from
                          <select name="credit_from_id" defaultValue={l.credit_from_id ?? ""}><option value="">No credit</option>{sources.map((x: any) => <option key={x.id} value={x.id}>{x.name} ({gbp(x.price)})</option>)}</select>
                        </label>
                        <label>Credit £<input name="credit" type="number" min="0" step="1" defaultValue={l.credit || ""} placeholder="full fee" style={{ width: 100 }} /></label>
                      </>
                    )}
                    <button className="secondary">Save</button>
                  </ToastForm>
                  <p className="muted" style={{ margin: "6px 0 0" }}>
                    {l.min !== null && <>Range {gbp(l.min)}–{gbp(l.max)}{l.billing === "monthly" ? "/mo" : ""}. </>}
                    {range === "below" && <span className="error">Below your usual range. </span>}
                    {range === "above" && <span className="error">Above your usual range. </span>}
                    {l.credit > 0 && <>Net {gbp(lineNet({ billing: l.billing, price: l.price, credit: l.credit }))} after {gbp(l.credit)} credit{source ? ` from ${source.name}` : ""}.{source && l.credit < maxCredit(source.price, l.price) ? "" : ""}</>}
                  </p>
                  {checklist.length > 0 && (
                    <div className="checklist" role="group" aria-label={`${l.name} deliverables`}>
                      {checklist.map((c, i) => <ChecklistToggle key={`${l.id}-${i}`} lineId={l.id} index={i} text={c.text} done={c.done} />)}
                    </div>
                  )}
                  <ToastForm action={removeDealOffer} success="Offer removed" confirm={`Remove ${l.name} from this deal? Its checklist progress will be lost.`} className="row" style={{ justifyContent: "flex-end" }}>
                    <input type="hidden" name="id" value={l.id} />
                    <button className="link">Remove</button>
                  </ToastForm>
                </div>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}
