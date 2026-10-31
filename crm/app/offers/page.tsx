import { Package } from "lucide-react";
import { query } from "@/lib/db";
import { addBundle, addOffer, saveBundle, saveOffer } from "@/lib/offerActions";
import { BILLING, billingShort } from "@/lib/dealOffers";
import { gbp } from "@/lib/quote";
import ToastForm from "@/components/ToastForm";
import { EmptyState, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Offers" };

export default async function Offers() {
  const all = await query<any>(`SELECT * FROM offers ORDER BY (billing IS NULL), sort_order, active DESC, niche NULLS LAST, name`);
  const bundles = all.filter((o: any) => o.is_bundle);
  const products = all.filter((o: any) => o.billing && !o.is_bundle);
  const packages = all.filter((o: any) => !o.billing && !o.is_bundle);
  const links = await query<{ bundle_id: number; component_id: number }>(`SELECT bundle_id, component_id FROM offer_components`);

  return (
    <>
      <PageHeader
        title="Offers"
        description="What you sell. Services are priced individually; packages group the services needed to deliver one offer (SEO, website, chatbot…). Both can be added to a deal, where every price can be changed."
      />

      <h2 style={{ margin: "4px 0 4px" }}>Packages</h2>
      <p className="muted" style={{ marginTop: 0 }}>A package has no price of its own: its price is the sum of its services below. Adding one to a deal adds each service as its own line.</p>
      <div className="stack">
        {bundles.map((b: any) => {
          const inside = new Set(links.filter((l) => l.bundle_id === b.id).map((l) => l.component_id));
          const sum = products.filter((p: any) => inside.has(p.id));
          const oneOff = sum.filter((p: any) => p.billing !== "monthly").reduce((n: number, p: any) => n + Number(p.setup_price_gbp), 0);
          const monthly = sum.filter((p: any) => p.billing === "monthly").reduce((n: number, p: any) => n + Number(p.monthly_price_gbp), 0);
          return (
            <ToastForm key={`${b.id}:${[...inside].join(",")}`} action={saveBundle} success="Package saved" className="card offer-product">
              <input type="hidden" name="id" value={b.id} />
              <div className="offer-head">
                <div><b style={{ fontSize: 16 }}>{b.name}</b><div className="muted">{gbp(oneOff)} one-off · {gbp(monthly)}/mo at default prices</div></div>
                <label className="row muted" style={{ flexDirection: "row", gap: 6 }}><input type="checkbox" name="active" defaultChecked={b.active} /> Active</label>
              </div>
              <div className="offer-grid">
                <label>Name<input name="name" defaultValue={b.name} /></label>
                <label className="span3">Outcome in one sentence<input name="outcome" defaultValue={b.outcome ?? ""} /></label>
                <div className="span4"><div className="field-label">Services in this package</div>
                  <div className="row" style={{ gap: 14 }}>{products.map((p: any) => (
                    <label key={p.id} className="row" style={{ flexDirection: "row", gap: 6 }}><input type="checkbox" name="component" value={p.id} defaultChecked={inside.has(p.id)} /> {p.name}</label>
                  ))}</div>
                </div>
              </div>
              <div className="row"><button>Save</button></div>
            </ToastForm>
          );
        })}
        <details className="card">
          <summary>Add a package</summary>
          <ToastForm action={addBundle} success="Package added" reset className="stack" style={{ marginTop: 12, gap: 8 }}>
            <div className="row"><input name="name" placeholder="Package name" required aria-label="Package name" /><input name="outcome" placeholder="Outcome" aria-label="Outcome" style={{ flex: 1, minWidth: 200 }} /></div>
            <div className="row" style={{ gap: 14 }}>{products.map((p: any) => (
              <label key={p.id} className="row" style={{ flexDirection: "row", gap: 6 }}><input type="checkbox" name="component" value={p.id} /> {p.name}</label>
            ))}</div>
            <button style={{ alignSelf: "flex-start" }}>Add package</button>
          </ToastForm>
        </details>
      </div>

      <h2 style={{ margin: "26px 0 10px" }}>Services</h2>
      {products.length === 0 ? (
        <div className="card"><EmptyState title="No services yet" icon={<Package size={22} />}>Run <code>uv run python -m agency.seed_offers</code> or <code>npx tsx --env-file=../.env scripts/seedOffers.mts</code> (from crm/) to add the starting offers.</EmptyState></div>
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
