import { Package } from "lucide-react";
import { query } from "@/lib/db";
import { addOffer, saveOffer } from "@/lib/offerActions";
import { BILLING, billingShort } from "@/lib/dealOffers";
import { gbp } from "@/lib/quote";
import ToastForm from "@/components/ToastForm";
import { EmptyState, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Offers" };

export default async function Offers() {
  const all = await query<any>(`SELECT * FROM offers ORDER BY (billing IS NULL), sort_order, active DESC, niche NULLS LAST, name`);
  const products = all.filter((o: any) => o.billing);
  const packages = all.filter((o: any) => !o.billing);

  return (
    <>
      <PageHeader
        title="Offers"
        description="What you sell. The core offers can be added to a deal, with their own price, a deliverables checklist and credits between them (for example an audit fee credited against the build)."
      />

      <h2 style={{ margin: "4px 0 10px" }}>Core offers</h2>
      {products.length === 0 ? (
        <div className="card"><EmptyState title="No core offers yet" icon={<Package size={22} />}>Run <code>uv run python -m agency.seed_offers</code> to add the four starting offers.</EmptyState></div>
      ) : (
        <div className="stack">
          {products.map((o: any) => {
            const deliverables = (o.deliverables as string[]).join("\n");
            const dflt = Number(o.billing === "monthly" ? o.monthly_price_gbp : o.setup_price_gbp);
            return (
              <ToastForm key={o.id} action={saveOffer} success="Offer saved" className="card offer-product">
                <input type="hidden" name="id" value={o.id} />
                <div className="offer-head">
                  <div>
                    <b style={{ fontSize: 16 }}>{o.name}</b>
                    <div className="muted">{billingShort(o.billing)} · {o.price_min_gbp !== null ? `${gbp(o.price_min_gbp)}–${gbp(o.price_max_gbp)}${o.billing === "monthly" ? " a month" : ""}` : "no price range set"}{o.default_duration_days ? ` · ${o.default_duration_days} day${o.default_duration_days === 1 ? "" : "s"}` : ""}</div>
                  </div>
                  <label className="row muted" style={{ flexDirection: "row", gap: 6 }}><input type="checkbox" name="active" defaultChecked={o.active} /> Active</label>
                </div>
                <div className="offer-grid">
                  <label>Name<input name="name" defaultValue={o.name} /></label>
                  <label>Billing
                    <select name="billing" defaultValue={o.billing}>{BILLING.map((b) => <option key={b.code} value={b.code}>{b.label}</option>)}</select>
                  </label>
                  <label>{o.billing === "monthly" ? "Default monthly fee £" : "Default price £"}<input name="default_price" type="number" min="0" step="1" defaultValue={dflt} /></label>
                  <label>Default duration (days)<input name="duration" type="number" min="1" step="1" defaultValue={o.default_duration_days ?? ""} /></label>
                  <label>Price from £<input name="price_min" type="number" min="0" step="1" defaultValue={o.price_min_gbp === null ? "" : Number(o.price_min_gbp)} /></label>
                  <label>Price to £<input name="price_max" type="number" min="0" step="1" defaultValue={o.price_max_gbp === null ? "" : Number(o.price_max_gbp)} /></label>
                  <label className="span2">Outcome in one sentence<input name="outcome" defaultValue={o.outcome ?? ""} /></label>
                  <label className="span4">Deliverables checklist (one per line)
                    <textarea name="deliverables" rows={Math.max(4, (o.deliverables as string[]).length + 1)} defaultValue={deliverables} />
                  </label>
                  <label className="span2">Loom link<input name="loom_url" defaultValue={o.loom_url ?? ""} placeholder="https://www.loom.com/share/…" /></label>
                  <label>Niche<input name="niche" defaultValue={o.niche ?? ""} /></label>
                  <label>Demo folder<input name="demo_path" defaultValue={o.demo_path ?? ""} /></label>
                </div>
                <div className="row"><button>Save</button><span className="muted">When you add this to a deal, the checklist is copied, so ticking items off on one deal never changes the offer.</span></div>
              </ToastForm>
            );
          })}
        </div>
      )}

      <h2 style={{ margin: "26px 0 10px" }}>Niche packages (setup + monthly)</h2>
      <p className="muted" style={{ marginTop: -4 }}>Older all-in-one packages. They work in the quote builder. To carry one on a deal with its own price and checklist, give it a billing type.</p>
      <div className="stack">
        {packages.map((o: any) => (
          <ToastForm key={o.id} action={saveOffer} success="Offer saved" className="card offer">
            <input type="hidden" name="id" value={o.id} />
            <label>Name<input name="name" defaultValue={o.name} /></label>
            <label>Niche<input name="niche" defaultValue={o.niche ?? ""} /></label>
            <label>Setup £<input name="setup" type="number" min="0" step="1" defaultValue={Number(o.setup_price_gbp)} /></label>
            <label>Monthly £<input name="monthly" type="number" min="0" step="1" defaultValue={Number(o.monthly_price_gbp)} /></label>
            <label className="span2">Outcome in one sentence<input name="outcome" defaultValue={o.outcome ?? ""} /></label>
            <label>Loom link<input name="loom_url" defaultValue={o.loom_url ?? ""} placeholder="https://www.loom.com/share/…" /></label>
            <label>Demo folder<input name="demo_path" defaultValue={o.demo_path ?? ""} /></label>
            <label>Billing type (optional)
              <select name="billing" defaultValue=""><option value="">None: package</option>{BILLING.map((b) => <option key={b.code} value={b.code}>{b.label}</option>)}</select>
            </label>
            <div className="row-between span3">
              <label className="row" style={{ flexDirection: "row" }}><input type="checkbox" name="active" defaultChecked={o.active} /> Active (shown in quotes)</label>
              <button className="secondary">Save</button>
            </div>
          </ToastForm>
        ))}
        <details className="card">
          <summary>Add an offer</summary>
          <ToastForm action={addOffer} success="Offer added" reset className="row" style={{ marginTop: 12 }}>
            <input name="name" placeholder="Name" required aria-label="Name" />
            <select name="billing" defaultValue="" aria-label="Billing"><option value="">Package</option>{BILLING.map((b) => <option key={b.code} value={b.code}>{b.label}</option>)}</select>
            <input name="niche" placeholder="Niche" aria-label="Niche" />
            <input name="outcome" placeholder="Outcome" aria-label="Outcome" style={{ flex: 1, minWidth: 200 }} />
            <input name="default_price" type="number" min="0" placeholder="Default price £" aria-label="Default price" style={{ width: 140 }} />
            <button>Add</button>
          </ToastForm>
        </details>
      </div>
    </>
  );
}
